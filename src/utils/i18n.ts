export const EXT_I18N: Record<string, any> = {
    'zh-cn': {
        quotaWarning: '额度报警: 模型 {0} 剩余额度仅剩 {1}%！',
        tryAlternative: '尝试使用 {0}',
        switchManually: '请在 Antigravity 模型选择菜单中手动切换至 {0}',
        pinedDefault: 'AGQ',
        syncError: '同步失败: {0}'
    },
    'en': {
        quotaWarning: 'Quota Warning: Model {0} has only {1}% remaining!',
        tryAlternative: 'Try using {0}',
        switchManually: 'Please manually switch to {0} in the Antigravity model menu',
        pinedDefault: 'AGQ',
        syncError: 'Sync failed: {0}'
    },
    'ja': {
        quotaWarning: 'クォータ警告: モデル {0} の残量はわずか {1}% です！',
        tryAlternative: '{0} を試す',
        switchManually: 'Antigravity モデルメニューで手動で {0} に切り替えてください',
        pinedDefault: 'AGQ',
        syncError: '同期失敗: {0}'
    },
    'fr': {
        quotaWarning: 'Alerte Quota : Modèle {0} n\'a plus que {1}% restant !',
        tryAlternative: 'Essayer {0}',
        switchManually: 'Veuillez passer manuellement à {0} dans le menu du modèle Antigravity',
        pinedDefault: 'AGQ',
        syncError: 'Sync échouée : {0}'
    },
    'de': {
        quotaWarning: 'Kontingent-Warnung: Modell {0} hat nur noch {1}% übrig!',
        tryAlternative: 'Versuchen Sie {0}',
        switchManually: 'Bitte wechseln Sie manuell zu {0} im Antigravity-Modellmenü',
        pinedDefault: 'AGQ',
        syncError: 'Synchronisierung fehlgeschlagen: {0}'
    }
};

export function getTranslation(lang: string, key: string, ...args: any[]): string {
    if (lang === 'auto') {
        // Simple fallback to browser/ide language
        lang = 'en'; // Default
    }

    // Normalize lang
    if (lang.startsWith('zh')) lang = 'zh-cn';
    if (lang.startsWith('ja')) lang = 'ja';
    if (lang.startsWith('fr')) lang = 'fr';
    if (lang.startsWith('de')) lang = 'de';

    const strings = EXT_I18N[lang] || EXT_I18N['en'];
    let val = strings[key] || EXT_I18N['en'][key] || key;

    args.forEach((arg, i) => {
        val = val.replace(`{${i}}`, String(arg));
    });

    return val;
}
