import * as vscode from 'vscode';
import { usage_history_entry, quota_snapshot } from '../utils/types';

export class HistoryManager {
    private readonly history_key = 'agq.history';
    private readonly max_entries = 500;

    constructor(private context: vscode.ExtensionContext) { }

    /**
     * Log current snapshot to history
     */
    async log_snapshot(snapshot: quota_snapshot): Promise<void> {
        const history = this.get_history();

        const entry: usage_history_entry = {
            timestamp: Date.now(),
            models: {}
        };

        for (const m of snapshot.models) {
            if (m.remaining_percentage !== undefined) {
                entry.models[m.model_id] = {
                    remaining_percentage: m.remaining_percentage,
                    label: m.label
                };
            }
        }

        // Only log if there's significant change or it's been a while (to save space)
        const last_entry = history[history.length - 1];
        if (last_entry) {
            const time_diff = entry.timestamp - last_entry.timestamp;
            // Log if: more than 1 hour passed OR percentage changed by more than 1% for any model
            if (time_diff < 1000 * 60 * 60 && !this.has_significant_change(last_entry, entry)) {
                return;
            }
        }

        history.push(entry);

        // Prune old entries
        if (history.length > this.max_entries) {
            history.shift();
        }

        await this.context.globalState.update(this.history_key, history);
    }

    /**
     * Get full usage history
     */
    get_history(): usage_history_entry[] {
        return this.context.globalState.get<usage_history_entry[]>(this.history_key) || [];
    }

    /**
     * Clear all history
     */
    async clear_history(): Promise<void> {
        await this.context.globalState.update(this.history_key, []);
    }

    private has_significant_change(old_e: usage_history_entry, new_e: usage_history_entry): boolean {
        for (const model_id in new_e.models) {
            const old_val = old_e.models[model_id]?.remaining_percentage;
            const new_val = new_e.models[model_id]?.remaining_percentage;
            if (old_val === undefined || Math.abs(old_val - new_val) > 1) {
                return true;
            }
        }
        return false;
    }
}
