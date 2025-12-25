'use strict';

const MEDIA_MICROPHONE = 'microphone';
const MEDIA_SCREEN = 'screen';
const PLATFORM_MAC = 'darwin';

const SCREEN_PRIVACY_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenRecording';

const safeCall = (fn, fallback) => {
    if (typeof fn !== 'function') {
        return fallback;
    }
    try {
        return fn();
    } catch (error) {
        console.warn('[Permissions] systemPreferences call failed', error);
        return fallback;
    }
};

const getMediaAccessStatus = (systemPreferences, mediaType) => {
    const resolver = () => systemPreferences.getMediaAccessStatus(mediaType);
    const status = safeCall(resolver, 'unknown');
    if (typeof status !== 'string') {
        return 'unknown';
    }
    return status.toLowerCase();
};

const isAccessGranted = (status) => status === 'granted';

const readStoredSystemAudioState = (settingsStore) => {
    if (!settingsStore || typeof settingsStore.getPermissionsState !== 'function') {
        return {};
    }
    const stored = settingsStore.getPermissionsState(PLATFORM_MAC);
    if (typeof stored.systemAudio === 'object' && stored.systemAudio !== null) {
        return { ...stored.systemAudio };
    }
    return {};
};

const computeSystemAudioStatus = (storedState = {}) => {
    const granted = Boolean(storedState.granted);
    const status = typeof storedState.status === 'string' && storedState.status
        ? storedState.status
        : (granted ? 'ready' : 'unknown');
    return {
        granted,
        status
    };
};

const checkMacPermissions = ({ systemPreferences, settingsStore }) => {
    if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
        return {
            microphone: { granted: false, status: 'unknown' },
            screenCapture: { granted: false, status: 'unknown' },
            systemAudio: computeSystemAudioStatus()
        };
    }

    const microphoneStatus = getMediaAccessStatus(systemPreferences, MEDIA_MICROPHONE);
    const screenStatus = getMediaAccessStatus(systemPreferences, MEDIA_SCREEN);
    const storedSystemAudio = computeSystemAudioStatus(readStoredSystemAudioState(settingsStore));

    return {
        microphone: {
            status: microphoneStatus,
            granted: isAccessGranted(microphoneStatus)
        },
        screenCapture: {
            status: screenStatus,
            granted: isAccessGranted(screenStatus)
        },
        systemAudio: storedSystemAudio
    };
};

const shouldDisplayPermissionWindow = (permissionState) => {
    if (!permissionState || typeof permissionState !== 'object') {
        return true;
    }
    const { microphone, screenCapture, systemAudio } = permissionState;
    if (!microphone?.granted || !screenCapture?.granted) {
        return true;
    }
    return !systemAudio?.granted;
};

const persistSystemAudioState = ({ settingsStore, granted, status }) => {
    if (!settingsStore || typeof settingsStore.setPermissionsState !== 'function') {
        return { granted: Boolean(granted), status: status || (granted ? 'ready' : 'unknown') };
    }
    const nextState = {
        systemAudio: {
            granted: Boolean(granted),
            status: typeof status === 'string' && status ? status : (granted ? 'ready' : 'unknown'),
            lastUpdatedAt: Date.now()
        }
    };
    const stored = settingsStore.setPermissionsState(PLATFORM_MAC, nextState);
    if (typeof stored.systemAudio === 'object' && stored.systemAudio !== null) {
        return { ...stored.systemAudio };
    }
    return nextState.systemAudio;
};

module.exports = {
    SCREEN_PRIVACY_URL,
    checkMacPermissions,
    shouldDisplayPermissionWindow,
    persistSystemAudioState,
    isAccessGranted
};
