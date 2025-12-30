'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAuthHandlers } = require('../server/electron/ipc/auth');

test('auth handlers wire through to authStore', async () => {
    const handles = new Map();
    const ipcMain = {
        handle: (channel, handler) => {
            handles.set(channel, handler);
        }
    };

    let savedValue = null;
    let clearCount = 0;
    const authStore = {
        loadAccessToken: () => 'cached-token',
        saveAccessToken: (next) => {
            savedValue = next;
            return 'persisted-token';
        },
        clearAccessToken: () => {
            clearCount += 1;
        }
    };

    registerAuthHandlers({ ipcMain, authStore, env: {} });

    const getToken = handles.get('auth:get-token');
    assert.ok(getToken, 'expected auth:get-token handler to be registered');
    const getResult = await getToken();
    assert.deepEqual(getResult, { ok: true, accessToken: 'cached-token' });

    const setToken = handles.get('auth:set-token');
    const setResult = await setToken(null, { accessToken: ' next-token ' });
    assert.equal(savedValue, ' next-token ');
    assert.deepEqual(setResult, { ok: true, accessToken: 'persisted-token' });

    const clearToken = handles.get('auth:clear-token');
    const clearResult = await clearToken();
    assert.equal(clearCount, 1);
    assert.deepEqual(clearResult, { ok: true });
});

test('env:get handler exposes whitelisted keys only', async () => {
    const handles = new Map();
    const ipcMain = {
        handle: (channel, handler) => {
            handles.set(channel, handler);
        }
    };

    const env = {
        API_BASE_URL: ' https://api.example.com ',
        SUPABASE_URL: 'https://sb.example.com',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_REDIRECT_URI: '',
        SECRET_TOKEN: 'should-not-leak'
    };

    registerAuthHandlers({ ipcMain, authStore: { loadAccessToken() {}, saveAccessToken() {}, clearAccessToken() {} }, env });

    const envGet = handles.get('env:get');
    const result = await envGet();
    assert.deepEqual(result, {
        ok: true,
        env: {
            API_BASE_URL: 'https://api.example.com',
            SUPABASE_URL: 'https://sb.example.com',
            SUPABASE_ANON_KEY: 'anon'
        }
    });
});
