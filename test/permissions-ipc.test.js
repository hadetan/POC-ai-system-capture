const test = require('node:test');
const assert = require('node:assert/strict');

const { registerPermissionsHandlers } = require('../server/electron/ipc/permissions');

const createFakeIpcMain = () => {
    const handlers = new Map();
    return {
        handle: (channel, handler) => {
            handlers.set(channel, handler);
        },
        getHandler: (channel) => handlers.get(channel)
    };
};

test('permissions IPC handlers expose status, request, store, and acknowledge', async () => {
    const fakeIpcMain = createFakeIpcMain();
    let microphoneRequested = false;
    let systemAudioStored = null;
    let acknowledgeCount = 0;

    const fakeSystemPreferences = {
        getMediaAccessStatus: (type) => (type === 'microphone' ? 'granted' : 'denied'),
        askForMediaAccess: async () => {
            microphoneRequested = true;
            return true;
        }
    };

    const fakeShell = {
        openExternal: async () => {}
    };

    const fakeSettingsStore = {
        getPermissionsState: () => ({
            systemAudio: { granted: false, status: 'unknown' }
        }),
        setPermissionsState: (_platform, nextState) => {
            systemAudioStored = nextState.systemAudio;
            return { ...nextState };
        }
    };

    registerPermissionsHandlers({
        ipcMain: fakeIpcMain,
        systemPreferences: fakeSystemPreferences,
        shell: fakeShell,
        settingsStore: fakeSettingsStore,
        onPermissionsGranted: () => {
            acknowledgeCount += 1;
        }
    });

    const checkHandler = fakeIpcMain.getHandler('permissions:check');
    const requestHandler = fakeIpcMain.getHandler('permissions:request-microphone');
    const storeAudioHandler = fakeIpcMain.getHandler('permissions:store-system-audio');
    const acknowledgeHandler = fakeIpcMain.getHandler('permissions:acknowledge');

    assert.ok(checkHandler, 'permissions:check handler registered');
    assert.ok(requestHandler, 'permissions:request-microphone handler registered');
    assert.ok(storeAudioHandler, 'permissions:store-system-audio handler registered');
    assert.ok(acknowledgeHandler, 'permissions:acknowledge handler registered');

    const checkResult = await checkHandler();
    assert.equal(checkResult.ok, true);
    assert.equal(checkResult.state.microphone.granted, true);
    assert.equal(checkResult.state.screenCapture.granted, false);
    assert.equal(checkResult.needsAttention, true);

    const micResult = await requestHandler();
    assert.equal(micResult.ok, true);
    assert.equal(micResult.granted, true);
    assert.ok(microphoneRequested);

    const audioResult = await storeAudioHandler({}, { granted: true, status: 'ready' });
    assert.equal(audioResult.ok, true);
    assert.equal(audioResult.state.granted, true);
    assert.equal(audioResult.state.status, 'ready');
    assert.ok(systemAudioStored);
    assert.equal(systemAudioStored.granted, true);

    // Update system preferences to grant screen recording before acknowledging
    fakeSystemPreferences.getMediaAccessStatus = () => 'granted';

    const acknowledgeResult = await acknowledgeHandler();
    assert.equal(acknowledgeResult.ok, true);
    assert.equal(acknowledgeResult.needsAttention, false);
    assert.equal(acknowledgeCount, 1);
});
