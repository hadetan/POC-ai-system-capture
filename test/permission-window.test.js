const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const ReactDOMClient = require('react-dom/client');
const { JSDOM } = require('jsdom');

const originalGlobals = {
    window: global.window,
    document: global.document,
    navigator: global.navigator,
    electronAPI: global.electronAPI,
    MediaStream: global.MediaStream
};

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.IS_REACT_ACT_ENVIRONMENT = true;

test.after(() => {
    global.window = originalGlobals.window;
    global.document = originalGlobals.document;
    global.navigator = originalGlobals.navigator;
    global.electronAPI = originalGlobals.electronAPI;
    global.MediaStream = originalGlobals.MediaStream;
});

class FakeMediaStream {
    constructor(tracks = []) {
        this._tracks = tracks.slice();
    }

    getTracks() {
        return this._tracks.slice();
    }

    getAudioTracks() {
        return this._tracks.filter((track) => track.kind === 'audio');
    }
}

global.MediaStream = FakeMediaStream;
window.MediaStream = FakeMediaStream;

const baseState = {
    microphone: { granted: false, status: 'not-determined' },
    screenCapture: { granted: false, status: 'not-determined' },
    systemAudio: { granted: false, status: 'unknown' }
};

const listeners = new Set();
let checkCalls = 0;
let microphoneRequested = 0;
let acknowledgeCalls = 0;
const constraintsHistory = [];

const createTrack = (kind) => ({ kind, readyState: 'live', stop: () => {} });

navigator.mediaDevices.getUserMedia = async (constraints) => {
    constraintsHistory.push(constraints);
    return new FakeMediaStream([createTrack('audio'), createTrack('video')]);
};

const storedState = { ...baseState };

global.electronAPI = {
    getDesktopSources: async () => [{ id: 'screen-source' }],
    permissions: {
        check: async () => {
            checkCalls += 1;
            return { ok: true, state: { ...storedState } };
        },
        requestMicrophone: async () => {
            microphoneRequested += 1;
            storedState.microphone = { granted: true, status: 'granted' };
            return { ok: true, granted: true };
        },
        storeSystemAudio: async ({ granted, status }) => {
            storedState.systemAudio = { granted, status: status || (granted ? 'granted' : 'error') };
            return { ok: true, state: storedState.systemAudio };
        },
        acknowledge: async () => {
            acknowledgeCalls += 1;
            storedState.screenCapture = { granted: true, status: 'granted' };
            return { ok: true, needsAttention: false, state: { ...storedState } };
        },
        openSystemSettings: async () => ({ ok: true }),
        onUpdate: (callback) => {
            listeners.add(callback);
            return () => listeners.delete(callback);
        }
    }
};

test('PermissionWindow renders status and triggers permission actions', async () => {
    const module = await import('../src/components/PermissionWindow.jsx');
    const PermissionWindow = module.default;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
        root.render(React.createElement(PermissionWindow));
    });

    assert.ok(checkCalls > 0, 'initial permission check triggered');

    const steps = Array.from(container.querySelectorAll('.permission-step'));
    assert.equal(steps.length, 3, 'renders three permission steps');

    const microphoneButton = steps[0].querySelector('button');
    assert.ok(microphoneButton, 'request microphone button found');

    await act(async () => {
        microphoneButton.click();
    });

    assert.equal(microphoneRequested, 1, 'microphone request issued');

    await act(async () => {
        listeners.forEach((listener) => listener({
            microphone: { granted: true, status: 'granted' },
            screenCapture: { granted: false, status: 'denied' },
            systemAudio: { granted: false, status: 'unknown' }
        }));
    });

    assert.equal(steps[0].querySelector('button'), null, 'microphone button hidden after grant');

    const screenButton = steps[1].querySelector('button');
    await act(async () => {
        screenButton.click();
    });

    const latestScreenConstraints = constraintsHistory.at(-1);
    assert.ok(latestScreenConstraints, 'screen capture constraints recorded');
    assert.equal(latestScreenConstraints.audio, false, 'screen capture skips audio request');
    assert.equal(latestScreenConstraints.video.mandatory.chromeMediaSource, 'desktop');

    const systemAudioButton = steps[2].querySelector('button');
    await act(async () => {
        systemAudioButton.click();
    });

    const latestAudioConstraints = constraintsHistory.at(-1);
    assert.ok(latestAudioConstraints, 'system audio constraints recorded');
    assert.equal(latestAudioConstraints.video, false, 'system audio capture skips video');
    assert.equal(latestAudioConstraints.audio.mandatory.chromeMediaSource, 'desktop');

    await act(async () => {
        listeners.forEach((listener) => listener({
            microphone: { granted: true, status: 'granted' },
            screenCapture: { granted: true, status: 'granted' },
            systemAudio: { granted: true, status: 'granted' }
        }));
    });

    const continueButtons = Array.from(container.querySelectorAll('.permission-window__footer button'));
    assert.equal(continueButtons[1].disabled, false, 'continue enabled when all permissions granted');
    await act(async () => {
        continueButtons[1].click();
    });

    assert.equal(acknowledgeCalls, 1, 'acknowledge invoked');

    await act(async () => {
        root.unmount();
    });
    container.remove();
});
