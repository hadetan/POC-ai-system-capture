const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createWindowManager } = require('../../server/electron/window-manager');

class FakeBrowserWindow {
    static nextId = 1;

    constructor(opts = {}) {
        this.id = FakeBrowserWindow.nextId++;
        this.opts = opts;
        this.visible = Boolean(opts.show);
        this._bounds = { x: 0, y: 0, width: opts.width || 200, height: opts.height || 200 };
        this._events = new Map();
        this.webContents = {
            _isLoading: false,
            _listeners: new Map(),
            send: () => {},
            isLoadingMainFrame: () => this.webContents._isLoading,
            once: (event, handler) => {
                this.webContents._listeners.set(event, handler);
            }
        };
    }

    loadFile(target, options = {}) {
        this.lastLoad = { target, options };
    }

    loadURL(target) {
        this.lastLoad = { target, options: {} };
    }

    once(event, handler) {
        this._events.set(event, handler);
    }

    on(event, handler) {
        this._events.set(event, handler);
    }

    emit(event, ...args) {
        const handler = this._events.get(event);
        if (handler) {
            handler(...args);
        }
    }

    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents() {}
    setFullScreenable() {}
    focus() { this.visible = true; }
    show() { this.visible = true; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    close() { this.emit('closed'); }
    isDestroyed() { return false; }
    setPosition() {}
    setContentSize(width, height) {
        this._bounds.width = width;
        this._bounds.height = height;
    }
    getBounds() {
        return { ...this._bounds };
    }
}

const fakeScreen = {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } })
};

const fakeNativeImage = { createFromPath: () => ({}) };
const fakeFs = { existsSync: () => false };
const fakeApp = { quit: () => {} };

const windowManager = createWindowManager({
    BrowserWindow: FakeBrowserWindow,
    screen: fakeScreen,
    nativeImage: fakeNativeImage,
    pathModule: path,
    fsModule: fakeFs,
    stealthModeEnabled: false,
    contentProtectionEnabledByDefault: true,
    moveStepPx: 200,
    app: fakeApp
});

test('permission window hides overlays and restores them on close', () => {
    const control = windowManager.createControlWindow();
    const transcript = windowManager.createTranscriptWindow();

    control.show();
    transcript.show();
    assert.equal(control.visible, true);
    assert.equal(transcript.visible, true);

    const permissionWindow = windowManager.createPermissionWindow();
    assert.ok(permissionWindow, 'permission window created');
    assert.equal(control.visible, false, 'control hidden while permission window active');
    assert.equal(transcript.visible, false, 'transcript hidden while permission window active');
    assert.equal(permissionWindow.lastLoad.options.query.window, 'permissions');

    windowManager.destroyPermissionWindow();
    assert.equal(control.visible, true, 'control restored after permission window closed');
    assert.equal(transcript.visible, true, 'transcript restored after permission window closed');
});

test('permission check window loads dedicated renderer variant', () => {
    const checkWindow = windowManager.createPermissionCheckWindow();
    assert.ok(checkWindow, 'permission check window created');
    assert.equal(checkWindow.lastLoad.options.query.window, 'permissions-check');
    windowManager.destroyPermissionCheckWindow();
});
