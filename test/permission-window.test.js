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
let lastConstraints = null;

const createTrack = (kind) => ({ kind, readyState: 'live', stop: () => {} });

navigator.mediaDevices.getUserMedia = async (constraints) => {
    lastConstraints = constraints;
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
        storeSystemAudio: async ({ granted }) => {
            storedState.systemAudio = { granted, status: granted ? 'ready' : 'missing-audio-track' };
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

    const requestButton = container.querySelector('button');
    assert.ok(requestButton, 'request microphone button found');

    await act(async () => {
        requestButton.click();
    });

    assert.equal(microphoneRequested, 1, 'microphone request issued');

    await act(async () => {
        listeners.forEach((listener) => listener({
            microphone: { granted: true, status: 'granted' },
            screenCapture: { granted: false, status: 'denied' },
            systemAudio: { granted: false, status: 'unknown' }
        }));
    });

    const screenButton = container.querySelector('.permission-step__actions button');
    await act(async () => {
        screenButton.click();
    });

    assert.ok(lastConstraints);
    assert.equal(lastConstraints.audio.mandatory.chromeMediaSource, 'desktop');

    const continueButtons = Array.from(container.querySelectorAll('.permission-window__footer button'));
    await act(async () => {
        continueButtons[1].click();
    });

    assert.equal(acknowledgeCalls, 1, 'acknowledge invoked');

    await act(async () => {
        root.unmount();
    });
    container.remove();
});
