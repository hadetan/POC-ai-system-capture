const test = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveTranscriptText,
    initialTranscriptText,
    isTranscriptRollback
} = require('../src/utils/transcriptText');

test('resolveTranscriptText appends delta when provided', () => {
    const current = 'hello';
    const delta = ' world';
    assert.equal(resolveTranscriptText(current, { delta }), 'hello world');
});

test('resolveTranscriptText prefers server text when no delta', () => {
    const current = 'partial text';
    const serverText = 'authoritative complete text';
    assert.equal(resolveTranscriptText(current, { serverText }), serverText);
});

test('initialTranscriptText prefers server text then delta', () => {
    assert.equal(initialTranscriptText({ serverText: 'full' }), 'full');
    assert.equal(initialTranscriptText({ delta: 'piece' }), 'piece');
    assert.equal(initialTranscriptText({}), '');
});

test('isTranscriptRollback flags shorter authoritative text', () => {
    const previous = 'pack the mac and the mic levels';
    const next = 'pack the mac';
    assert.equal(isTranscriptRollback({ previousText: previous, nextText: next, isFinal: false, hasServerText: true }), true);
});

test('isTranscriptRollback ignores finals and extensions', () => {
    const base = 'one two three';
    assert.equal(isTranscriptRollback({ previousText: base, nextText: 'one two three four', isFinal: false, hasServerText: true }), false);
    assert.equal(isTranscriptRollback({ previousText: base, nextText: 'one two', isFinal: true, hasServerText: true }), false);
    assert.equal(isTranscriptRollback({ previousText: base, nextText: 'one two', isFinal: false, hasServerText: false }), false);
});
