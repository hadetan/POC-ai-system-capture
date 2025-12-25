'use strict';

const {
    SCREEN_PRIVACY_URL,
    checkMacPermissions,
    shouldDisplayPermissionWindow,
    persistSystemAudioState
} = require('../permissions');

const SCREEN_SETTINGS_ALIASES = new Set(['screen', 'screen-recording', 'privacy-screen']);

const resolveSettingsTarget = (rawTarget) => {
    const normalized = typeof rawTarget === 'string' ? rawTarget.trim().toLowerCase() : '';
    if (SCREEN_SETTINGS_ALIASES.has(normalized)) {
        return SCREEN_PRIVACY_URL;
    }
    return SCREEN_PRIVACY_URL;
};

const registerPermissionsHandlers = ({
    ipcMain,
    systemPreferences,
    shell,
    settingsStore,
    onPermissionsGranted
}) => {
    if (!ipcMain) {
        throw new Error('registerPermissionsHandlers requires an ipcMain instance.');
    }

    const snapshotPermissions = () => checkMacPermissions({ systemPreferences, settingsStore });

    ipcMain.handle('permissions:check', async () => {
        const state = snapshotPermissions();
        return {
            ok: true,
            state,
            needsAttention: shouldDisplayPermissionWindow(state)
        };
    });

    ipcMain.handle('permissions:request-microphone', async () => {
        if (!systemPreferences || typeof systemPreferences.askForMediaAccess !== 'function') {
            return { ok: false, error: 'Microphone access request is not supported on this platform.' };
        }
        try {
            const granted = await systemPreferences.askForMediaAccess('microphone');
            return { ok: true, granted };
        } catch (error) {
            return {
                ok: false,
                error: error?.message || 'Failed to request microphone access.'
            };
        }
    });

    ipcMain.handle('permissions:open-settings', async (_event, target) => {
        if (!shell || typeof shell.openExternal !== 'function') {
            return { ok: false, error: 'Unable to open System Settings on this platform.' };
        }
        const resolvedTarget = resolveSettingsTarget(target);
        try {
            await shell.openExternal(resolvedTarget);
            return { ok: true };
        } catch (error) {
            return {
                ok: false,
                error: error?.message || 'Failed to open System Settings.'
            };
        }
    });

    ipcMain.handle('permissions:store-system-audio', async (_event, payload = {}) => {
        const granted = Boolean(payload.granted);
        const status = typeof payload.status === 'string' ? payload.status : undefined;
        const stored = persistSystemAudioState({ settingsStore, granted, status });
        return {
            ok: true,
            state: stored
        };
    });

    ipcMain.handle('permissions:acknowledge', async () => {
        const state = snapshotPermissions();
        const needsAttention = shouldDisplayPermissionWindow(state);
        if (!needsAttention && typeof onPermissionsGranted === 'function') {
            await onPermissionsGranted({ state });
        }
        return {
            ok: true,
            state,
            needsAttention
        };
    });
};

module.exports = {
    registerPermissionsHandlers
};
