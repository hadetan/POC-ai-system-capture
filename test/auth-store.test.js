'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createAuthStore, AUTH_FILENAME } = require('../server/electron/auth-store');

const makeApp = (dir) => ({
    getPath: (key) => {
        if (key === 'userData') {
            return dir;
        }
        throw new Error(`Unexpected path key: ${key}`);
    }
});

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'auth-store-test-'));

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

test('saveAccessToken trims input, persists payload, and loads value', () => {
    const dir = makeTempDir();
    try {
        const store = createAuthStore({ app: makeApp(dir) });
        const saved = store.saveAccessToken('  bearer-token  ');
        assert.equal(saved, 'bearer-token');

        const filePath = path.join(dir, AUTH_FILENAME);
        assert.equal(fs.existsSync(filePath), true);

        const payload = readJson(filePath);
        assert.equal(payload.accessToken, 'bearer-token');
        assert.ok(!Number.isNaN(Date.parse(payload.updatedAt)), 'expected updatedAt to be ISO date string');
        assert.equal(store.loadAccessToken(), 'bearer-token');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('saveAccessToken with blank input clears file contents', () => {
    const dir = makeTempDir();
    try {
        const store = createAuthStore({ app: makeApp(dir) });
        const result = store.saveAccessToken('   ');
        assert.equal(result, '');

        const filePath = path.join(dir, AUTH_FILENAME);
        assert.equal(fs.existsSync(filePath), true);
        const payload = readJson(filePath);
        assert.deepEqual(payload, {});
        assert.equal(store.loadAccessToken(), '');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('clearAccessToken wipes stored token', () => {
    const dir = makeTempDir();
    try {
        const store = createAuthStore({ app: makeApp(dir) });
        store.saveAccessToken('initial');
        assert.equal(store.loadAccessToken(), 'initial');

        const result = store.clearAccessToken();
        assert.equal(result, '');
        const filePath = path.join(dir, AUTH_FILENAME);
        const payload = readJson(filePath);
        assert.deepEqual(payload, {});
        assert.equal(store.loadAccessToken(), '');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
