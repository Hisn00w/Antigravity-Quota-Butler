/**
 * Antigravity Quota Watcher - Main Entry
 */

import * as vscode from 'vscode';
import { ConfigManager } from './core/config_manager';
import { ProcessFinder } from './core/process_finder';
import { QuotaManager } from './core/quota_manager';
import { StatusBarManager } from './ui/status_bar';
import { HistoryManager } from './core/history_manager';
import { DashboardManager } from './ui/dashboard';
import { getTranslation } from './utils/i18n';
import { quota_snapshot, model_quota_info } from './utils/types';
import { logger } from './utils/logger';

let config_manager: ConfigManager;
let process_finder: ProcessFinder;
let quota_manager: QuotaManager;
let status_bar: StatusBarManager;
let history_manager: HistoryManager;
let dashboard_manager: DashboardManager;
let is_initialized = false;
const warned_models = new Set<string>();

export async function activate(context: vscode.ExtensionContext) {
	logger.init(context);
	logger.section('Extension', 'Antigravity Quota Activating');
	logger.info('Extension', `VS Code Version: ${vscode.version}`);
	logger.info('Extension', `Extension activating at: ${new Date().toISOString()}`);

	config_manager = new ConfigManager();
	process_finder = new ProcessFinder();
	quota_manager = new QuotaManager();
	status_bar = new StatusBarManager();
	history_manager = new HistoryManager(context);
	dashboard_manager = new DashboardManager(history_manager);

	context.subscriptions.push(status_bar);

	// Show update/install notification
	const currentVersion = context.extension.packageJSON.version;
	const lastVersion = context.globalState.get('lastVersion');
	if (lastVersion !== currentVersion) {
		vscode.window.showInformationMessage(`AG 额度管家已升级至 v${currentVersion}！如遇到功能异常，请尝试重新启动 VS Code 以确保环境完全加载。`, '查看更新日志').then(selection => {
			if (selection === '查看更新日志') {
				vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(context.asAbsolutePath('CHANGELOG.md')));
			}
		});
		context.globalState.update('lastVersion', currentVersion);
	}

	const config = config_manager.get_config();
	logger.debug('Extension', 'Initial config:', config);

	// Register Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('ag-quota.refresh', () => {
			logger.info('Extension', 'Manual refresh triggered');
			vscode.window.showInformationMessage('正在刷新额度...');
			quota_manager.fetch_quota();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('ag-quota.show_dashboard', () => {
			if (quota_manager.get_last_snapshot()) {
				dashboard_manager.open(quota_manager.get_last_snapshot()!);
			} else {
				vscode.window.showInformationMessage('尚未获取到额度信息，请稍后再试。');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('ag-quota.show_menu', () => {
			logger.debug('Extension', 'Show menu triggered');
			status_bar.show_menu();
		})
	);

	// Manual activation command
	context.subscriptions.push(
		vscode.commands.registerCommand('ag-quota.activate', async () => {
			logger.info('Extension', 'Manual activation triggered');
			if (!is_initialized) {
				await initialize_extension();
			} else {
				vscode.window.showInformationMessage('AGQ 已处于激活状态');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('ag-quota.reconnect', async () => {
			logger.info('Extension', 'Reconnect triggered');
			vscode.window.showInformationMessage('正在重新连接 Antigravity 进程...');
			is_initialized = false;
			quota_manager.stop_polling();
			status_bar.show_loading();
			await initialize_extension();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('ag-quota.show_logs', () => {
			logger.info('Extension', 'Opening debug log panel');
			logger.show();
			vscode.window.showInformationMessage('调试日志面板已打开');
		})
	);

	// Setup Quota Manager Callbacks
	quota_manager.on_update(snapshot => {
		const current_config = config_manager.get_config();

		// Check for quota warnings
		if (current_config.enable_notifications) {
			for (const m of snapshot.models) {
				const pct = m.remaining_percentage ?? 100;
				if (pct < current_config.warning_threshold) {
					if (!warned_models.has(m.model_id)) {
						const alternative = suggest_alternative_model(snapshot, m.model_id);
						const lang = current_config.language === 'auto' ? vscode.env.language : current_config.language;

						const msg = getTranslation(lang, 'quotaWarning', m.label, pct.toFixed(1));

						if (alternative) {
							const alt_label = alternative.label;
							const action = getTranslation(lang, 'tryAlternative', alt_label);
							vscode.window.showWarningMessage(msg, action).then(selected => {
								if (selected === action) {
									vscode.window.showInformationMessage(getTranslation(lang, 'switchManually', alt_label));
								}
							});
						} else {
							vscode.window.showWarningMessage(msg);
						}
						warned_models.add(m.model_id);
					}
				} else {
					// Reset warning if quota is above threshold (e.g. reset)
					warned_models.delete(m.model_id);
				}
			}
		}

		// Log to history and update dashboard
		history_manager.log_snapshot(snapshot);
		dashboard_manager.update(snapshot);

		logger.debug('Extension', 'Quota update received:', {
			models_count: snapshot.models?.length ?? 0,
			prompt_credits: snapshot.prompt_credits,
			timestamp: snapshot.timestamp,
		});
		status_bar.update(
			snapshot,
			current_config.show_prompt_credits ?? false
		);
	});

	quota_manager.on_error(err => {
		logger.error('Extension', `Quota error: ${err.message}`);
		status_bar.show_error(err.message);
	});

	// Initialize extension asynchronously (non-blocking)
	// This prevents blocking VS Code startup
	logger.debug('Extension', 'Starting async initialization...');
	initialize_extension().catch(err => {
		logger.error('Extension', 'Failed to initialize AG Quota Watcher:', err);
	});

	// Handle Config Changes
	context.subscriptions.push(
		config_manager.on_config_change(new_config => {
			logger.info('Extension', 'Config changed:', new_config);
			if (new_config.enabled) {
				quota_manager.start_polling(new_config.polling_interval);
			} else {
				quota_manager.stop_polling();
			}
		})
	);

	logger.info('Extension', 'Extension activation complete');
}

async function initialize_extension() {
	if (is_initialized) {
		logger.debug('Extension', 'Already initialized, skipping');
		return;
	}

	logger.section('Extension', 'Initializing Extension');
	const timer = logger.time_start('initialize_extension');

	const config = config_manager.get_config();
	status_bar.show_loading();

	try {
		logger.info('Extension', 'Detecting Antigravity process...');
		const process_info = await process_finder.detect_process_info();

		if (process_info) {
			logger.info('Extension', 'Process found successfully', {
				extension_port: process_info.extension_port,
				connect_port: process_info.connect_port,
				csrf_token: process_info.csrf_token.substring(0, 8) + '...',
			});

			quota_manager.init(process_info.connect_port, process_info.csrf_token);

			if (config.enabled) {
				logger.debug('Extension', `Starting polling with interval: ${config.polling_interval}ms`);
				quota_manager.start_polling(config.polling_interval);
			}
			is_initialized = true;
			logger.info('Extension', 'Initialization successful');
		} else {
			logger.error('Extension', 'Antigravity process not found');
			logger.info('Extension', 'Troubleshooting tips:');
			logger.info('Extension', '   1. 确保 Antigravity 扩展已安装并启用');
			logger.info('Extension', '   2. 检查 language_server 进程是否正在运行');
			logger.info('Extension', '   3. 尝试重启 VS Code');
			logger.info('Extension', '   4. 打开“输出”面板并选择“Antigravity Quota”查看详细日志');

			status_bar.show_error('未发现 Antigravity 进程');
			vscode.window.showErrorMessage('找不到 Antigravity 进程。它是否正在运行？请查看“显示调试日志”了解更多详情。', '查看日志').then(action => {
				if (action === '查看日志') {
					logger.show();
				}
			});
		}
	} catch (e: any) {
		logger.error('Extension', 'Detection failed with exception:', {
			message: e.message,
			stack: e.stack,
		});
		status_bar.show_error('检测失败');
	}

	timer();
}

export function deactivate() {
	logger.info('Extension', 'Extension deactivating');
	quota_manager?.stop_polling();
	status_bar?.dispose();
}

/**
 * Suggest an alternative model when one is low
 */
function suggest_alternative_model(snapshot: quota_snapshot, low_model_id: string) {
	const threshold = 50; // We suggest models with > 50% quota

	// Helper to categorize models
	const is_pro = (label: string) => label.toLowerCase().includes('pro') || label.toLowerCase().includes('opus') || label.toLowerCase().includes('sonnet 4.5');
	const is_flash = (label: string) => label.toLowerCase().includes('flash') || label.toLowerCase().includes('sonnet 3.5');

	const low_model = snapshot.models.find(m => m.model_id === low_model_id);
	if (!low_model) return null;

	const category_match = (m: any) => {
		if (is_pro(low_model.label)) return is_pro(m.label);
		if (is_flash(low_model.label)) return is_flash(m.label);
		return true;
	};

	// Find models in same category with enough quota
	const candidates = snapshot.models.filter(m =>
		m.model_id !== low_model_id &&
		!m.is_exhausted &&
		(m.remaining_percentage ?? 0) > threshold &&
		category_match(m)
	);

	// Sort by remaining percentage descending
	candidates.sort((a, b) => (b.remaining_percentage ?? 0) - (a.remaining_percentage ?? 0));

	return candidates.length > 0 ? candidates[0] : null;
}
