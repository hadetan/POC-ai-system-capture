'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SETTINGS_FILENAME = 'settings.json';

const ensureDirectory = ({ fsModule, targetPath }) => {
    const dir = path.dirname(targetPath);
    if (!fsModule.existsSync(dir)) {
        fsModule.mkdirSync(dir, { recursive: true });
    }
};

const readFileSafe = ({ fsModule, targetPath }) => {
    try {
        if (!fsModule.existsSync(targetPath)) {
            return {};
        }
        const raw = fsModule.readFileSync(targetPath, 'utf8');
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
        }
    } catch (error) {
        console.error('[SettingsStore] Failed to parse settings file, ignoring.', error);
    }
    return {};
};

const writeFileSafe = ({ fsModule, targetPath, data }) => {
    try {
        ensureDirectory({ fsModule, targetPath });
        fsModule.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[SettingsStore] Failed to write settings file.', error);
        throw error;
    }
};

const createSettingsStore = ({
    app,
    fsModule = fs,
    pathModule = path
} = {}) => {
    if (!app || typeof app.getPath !== 'function') {
        throw new Error('Electron app instance is required to manage settings storage.');
    }

    const resolveFilePath = () => {
        const userData = app.getPath('userData');
        if (!userData) {
            throw new Error('Unable to determine userData path for settings storage.');
        }
        return pathModule.join(userData, SETTINGS_FILENAME);
    };

    const loadAll = () => readFileSafe({ fsModule, targetPath: resolveFilePath() });

    const saveAll = (nextData) => {
        writeFileSafe({ fsModule, targetPath: resolveFilePath(), data: nextData });
    };

    const getAssistantSettings = () => {
        const store = loadAll();
        const assistant = typeof store.assistant === 'object' && store.assistant !== null
            ? store.assistant
            : {};
        const provider = typeof assistant.provider === 'string' ? assistant.provider : '';
        const model = typeof assistant.model === 'string' ? assistant.model : '';
        const providerConfig = typeof assistant.providerConfig === 'object' && assistant.providerConfig !== null
            ? assistant.providerConfig
            : {};
        return {
            provider,
            model,
            providerConfig
        };
    };

    const setAssistantSettings = (settings = {}) => {
        const store = loadAll();
        store.assistant = {
            provider: typeof settings.provider === 'string' ? settings.provider.trim().toLowerCase() : '',
            model: typeof settings.model === 'string' ? settings.model.trim() : '',
            providerConfig: typeof settings.providerConfig === 'object' && settings.providerConfig !== null
                ? settings.providerConfig
                : {}
        };
        saveAll(store);
        return store.assistant;
    };

    const getPermissionsState = (platform = process.platform) => {
        const store = loadAll();
        if (typeof store.permissions !== 'object' || store.permissions === null) {
            return {};
        }
        const platformKey = typeof platform === 'string' && platform ? platform : 'default';
        const platformState = store.permissions[platformKey];
        if (typeof platformState === 'object' && platformState !== null) {
            return { ...platformState };
        }
        return {};
    };

    const setPermissionsState = (platform = process.platform, nextState = {}) => {
        const store = loadAll();
        if (typeof store.permissions !== 'object' || store.permissions === null) {
            store.permissions = {};
        }
        const platformKey = typeof platform === 'string' && platform ? platform : 'default';
        const current = typeof store.permissions[platformKey] === 'object' && store.permissions[platformKey] !== null
            ? store.permissions[platformKey]
            : {};
        const merged = {
            ...current,
            ...nextState,
            updatedAt: Date.now()
        };
        store.permissions[platformKey] = merged;
        saveAll(store);
        return { ...merged };
    };

    return {
        resolveFilePath,
        loadAll,
        saveAll,
        getAssistantSettings,
        setAssistantSettings,
        getPermissionsState,
        setPermissionsState
    };
};

module.exports = {
    createSettingsStore,
    SETTINGS_FILENAME
};
