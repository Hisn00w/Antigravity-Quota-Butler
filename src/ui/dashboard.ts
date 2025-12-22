import * as vscode from 'vscode';
import { HistoryManager } from '../core/history_manager';
import { quota_snapshot } from '../utils/types';

export class DashboardManager {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private history: HistoryManager) { }

    open(snapshot: quota_snapshot) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.update(snapshot);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'agqDashboard',
            'AG 额度管家 - 仪表盘',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.get_html(snapshot);

        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'updateSetting') {
                const config = vscode.workspace.getConfiguration('ag-quota');
                await config.update(message.key, message.value, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`设置已更新: ${message.key} = ${message.value}`);
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    update(snapshot: quota_snapshot) {
        if (this.panel) {
            const config = vscode.workspace.getConfiguration('ag-quota');
            this.panel.webview.postMessage({
                type: 'update',
                snapshot,
                history: this.history.get_history(),
                config: {
                    warningThreshold: config.get('warningThreshold'),
                    autoSwitchModels: config.get('autoSwitchModels')
                }
            });
        }
    }

    private get_html(snapshot: quota_snapshot): string {
        const history = this.history.get_history();
        const config = vscode.workspace.getConfiguration('ag-quota');
        const currentThreshold = config.get('warningThreshold', 20);
        const autoSwitch = config.get('autoSwitchModels', false);

        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AGQ Dashboard</title>
    <style>
        :root {
            --card-bg: var(--vscode-notifications-background);
            --border-color: var(--vscode-widget-border);
            --header-border: var(--vscode-panel-border);
        }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
            padding: 30px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            line-height: 1.6;
            margin: 0;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 0 20px 50px 20px;
            animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            border-bottom: 2px solid var(--header-border);
            padding-bottom: 15px;
            margin-bottom: 30px;
            margin-top: 20px;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, var(--vscode-textLink-foreground), var(--vscode-textPreformat-foreground));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--vscode-foreground);
            opacity: 0.9;
        }
        .card-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            position: relative;
            overflow: hidden;
        }
        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 15px rgba(0,0,0,0.1);
            border-color: var(--vscode-focusBorder);
        }
        .card h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 500;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .pct {
            font-size: 32px;
            font-weight: 800;
            margin-bottom: 15px;
            font-variant-numeric: tabular-nums;
        }
        .progress-container {
            height: 6px;
            background: var(--vscode-widget-border);
            border-radius: 10px;
            overflow: hidden;
        }
        .progress-bar {
            height: 100%;
            transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .history-section {
            margin-bottom: 40px;
        }
        .chart-container {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }
        .chart-svg {
            width: 100%;
            height: 250px;
            overflow: visible;
        }
        .chart-axis {
            stroke: var(--vscode-widget-border);
            stroke-width: 1;
            opacity: 0.5;
        }
        .chart-label {
            font-size: 11px;
            fill: var(--vscode-descriptionForeground);
            font-weight: 500;
        }
        .chart-line {
            fill: none;
            stroke-width: 2.5;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .chart-dot {
            transition: all 0.2s ease;
            cursor: pointer;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        }
        .chart-dot:hover {
            r: 6;
            stroke: var(--vscode-editor-background);
            stroke-width: 2;
        }
        .legend {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-top: 20px;
            background: var(--vscode-editor-background);
            padding: 10px 15px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }

        /* Settings at the bottom */
        .settings-section {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 1px solid var(--border-color);
        }
        .settings-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
        }
        .setting-card-inner {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
        }
        .setting-item {
            margin-bottom: 25px;
        }
        .setting-item:last-child { margin-bottom: 0; }
        .setting-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        .description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
        }
        input[type="range"] {
            width: 100%;
            height: 4px;
            background: var(--vscode-widget-border);
            border-radius: 2px;
            -webkit-appearance: none;
            outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            background: var(--vscode-textLink-foreground);
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid var(--vscode-editor-background);
            box-shadow: 0 0 5px rgba(0,0,0,0.2);
            transition: transform 0.1s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.2);
        }
        .threshold-badge {
            background: var(--vscode-textLink-foreground);
            color: var(--vscode-editor-background);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
        }
        .switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 20px;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: var(--vscode-widget-border);
            transition: .4s;
            border-radius: 34px;
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 14px; width: 14px;
            left: 3px; bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .slider { background-color: var(--vscode-textLink-foreground); }
        input:checked + .slider:before { transform: translateX(20px); }

        .save-indicator {
            text-align: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 20px;
            opacity: 0.6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AG 额度管家</h1>
            <div id="last-update" style="font-size: 11px; opacity: 0.7; font-weight: 500;">
                同步时间: ${new Date().toLocaleTimeString()}
            </div>
        </div>

        <div class="section-title">
            <span>📊 当前状态</span>
        </div>
        <div class="card-grid" id="models-grid">
            ${snapshot.models.map(m => `
                <div class="card" id="card-${m.model_id}">
                    <h3 title="${m.label}">${m.label}</h3>
                    <div class="pct" id="pct-${m.model_id}">
                        ${m.remaining_percentage !== undefined ? m.remaining_percentage.toFixed(1) + '%' : 'N/A'}
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" id="bar-${m.model_id}" style="width: ${m.remaining_percentage ?? 0}%; background-color: ${this.get_color(m.remaining_percentage ?? 0)}"></div>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="history-section">
            <div class="section-title">
                <span>📈 消耗趋势</span>
            </div>
            <div class="chart-container">
                <svg id="history-chart" class="chart-svg" viewBox="0 0 800 250" preserveAspectRatio="none">
                    <text x="0" y="245" class="chart-label">0%</text>
                    <text x="0" y="130" class="chart-label">50%</text>
                    <text x="0" y="15" class="chart-label">100%</text>
                    <line x1="35" y1="240" x2="800" y2="240" class="chart-axis" stroke-dasharray="4" />
                    <line x1="35" y1="125" x2="800" y2="125" class="chart-axis" stroke-dasharray="4" />
                    <line x1="35" y1="10" x2="800" y2="10" class="chart-axis" stroke-dasharray="4" />
                </svg>
                <div id="chart-legend" class="legend"></div>
            </div>
        </div>

        <div class="settings-section">
            <div class="section-title">
                <span>⚙️ 偏好设置</span>
            </div>
            <div class="settings-grid">
                <div class="setting-card-inner">
                    <div class="setting-item">
                        <div class="setting-label">
                            <span>额度报警阈值</span>
                            <span class="threshold-badge" id="threshold-display">${currentThreshold}%</span>
                        </div>
                        <input type="range" id="threshold-range" min="0" max="100" value="${currentThreshold}">
                        <div class="description">当模型剩余百分比低于此值时发送警告。</div>
                    </div>
                </div>
                <div class="setting-card-inner">
                    <div class="setting-item">
                        <div class="setting-label">
                            <span>智能平替建议</span>
                            <label class="switch">
                                <input type="checkbox" id="autoswitch-check" ${autoSwitch ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="description">额度不足时自动寻找并建议最佳替代模型。建议与通知功能配合使用。</div>
                    </div>
                </div>
            </div>
            <div class="save-indicator">所有更改将实时保存至您的扩展配置</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let historyData = ${JSON.stringify(history)};
        let currentThreshold = ${currentThreshold};
        const COLORS = [
            '#3fb950', '#007acc', '#cca700', '#f14c4c', '#a371f7', '#da367f', '#0969da'
        ];

        // Settings Listeners
        const thresholdRange = document.getElementById('threshold-range');
        const thresholdDisplay = document.getElementById('threshold-display');
        const autoSwitchCheck = document.getElementById('autoswitch-check');

        thresholdRange.addEventListener('input', (e) => {
            thresholdDisplay.textContent = e.target.value + '%';
        });

        thresholdRange.addEventListener('change', (e) => {
            currentThreshold = parseInt(e.target.value);
            vscode.postMessage({
                type: 'updateSetting',
                key: 'warningThreshold',
                value: currentThreshold
            });
        });

        autoSwitchCheck.addEventListener('change', (e) => {
            vscode.postMessage({
                type: 'updateSetting',
                key: 'autoSwitchModels',
                value: e.target.checked
            });
        });

        function getColor(pct) {
            if (pct < 20) return '#f14c4c'; 
            if (pct < 50) return '#cca700'; 
            return '#3fb950';
        }

        function updateUI(snapshot, history, config) {
            // Update time
            document.getElementById('last-update').textContent = '同步时间: ' + new Date().toLocaleTimeString();
            
            // Update cards
            snapshot.models.forEach(m => {
                const pctEl = document.getElementById('pct-' + m.model_id);
                const barEl = document.getElementById('bar-' + m.model_id);
                if (pctEl && barEl) {
                    const pct = m.remaining_percentage !== undefined ? m.remaining_percentage.toFixed(1) + '%' : 'N/A';
                    pctEl.textContent = pct;
                    pctEl.style.color = m.remaining_percentage !== undefined && m.remaining_percentage < currentThreshold ? 'var(--vscode-errorForeground)' : 'inherit';
                    
                    barEl.style.width = (m.remaining_percentage ?? 0) + '%';
                    barEl.style.backgroundColor = getColor(m.remaining_percentage ?? 0);
                }
            });

            // Update chart
            renderChart(history);
        }

        function renderChart(data) {
            const svg = document.getElementById('history-chart');
            const legend = document.getElementById('chart-legend');
            svg.querySelectorAll('.chart-line, .chart-dot, .temp-text').forEach(n => n.remove());

            if (data.length < 2) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", "400");
                text.setAttribute("y", "125");
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("fill", "var(--vscode-descriptionForeground)");
                text.setAttribute("class", "temp-text");
                text.textContent = "正在积攒数据点... 至少需要 2 个记录点绘制趋势图 (当前: " + data.length + ")";
                svg.appendChild(text);
                return;
            }

            const modelIds = new Set();
            data.forEach(entry => Object.keys(entry.models).forEach(id => modelIds.add(id)));
            const sortedModelIds = Array.from(modelIds);

            const width = 800;
            const height = 250;
            const paddingLeft = 45;
            const paddingTop = 10;
            const paddingBottom = 10;
            const chartWidth = width - paddingLeft;
            const chartHeight = height - paddingTop - paddingBottom;

            legend.innerHTML = '';

            sortedModelIds.forEach((id, index) => {
                const color = COLORS[index % COLORS.length];
                const points = [];
                let modelLabel = id;

                data.forEach((entry, i) => {
                    if (entry.models[id]) {
                        modelLabel = entry.models[id].label;
                        const x = paddingLeft + (i / (data.length - 1)) * chartWidth;
                        const y = paddingTop + (1 - entry.models[id].remaining_percentage / 100) * chartHeight;
                        points.push(x + ',' + y);
                        
                        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                        dot.setAttribute("cx", x);
                        dot.setAttribute("cy", y);
                        dot.setAttribute("r", "3.5");
                        dot.setAttribute("fill", color);
                        dot.setAttribute("class", "chart-dot");
                        dot.innerHTML = \`<title>\${modelLabel}: \${entry.models[id].remaining_percentage.toFixed(1)}% (\${new Date(entry.timestamp).toLocaleString()})</title>\`;
                        svg.appendChild(dot);
                    }
                });

                if (points.length > 0) {
                    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
                    polyline.setAttribute("points", points.join(' '));
                    polyline.setAttribute("stroke", color);
                    polyline.setAttribute("class", "chart-line");
                    svg.appendChild(polyline);

                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    item.innerHTML = \`<div class="legend-color" style="background-color: \${color}"></div><span>\${modelLabel}</span>\`;
                    legend.appendChild(item);
                }
            });
        }

        renderChart(historyData);

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                updateUI(message.snapshot, message.history, message.config);
            }
        });
    </script>
</body>
</html>
		`;
    }

    private get_color(pct: number): string {
        if (pct < 20) return '#f14c4c'; // Error red
        if (pct < 50) return '#cca700'; // Warning yellow
        return '#3fb950'; // Healthy green
    }
}
