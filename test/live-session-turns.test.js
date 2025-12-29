const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { LiveStreamingSession } = require('../server/ai/transcription/streaming/live-session');

const createSession = () => new LiveStreamingSession({
    sessionId: 'session-test',
    sourceName: 'Desktop',
    sourceType: 'system',
    client: new EventEmitter(),
    streamingConfig: {}
});

test('LiveStreamingSession aggregates low-latency and formatted turns', () => {
    const session = createSession();
    const updates = [];
    session.on('update', (payload) => updates.push(payload));

    session.applyTurnUpdate({
        provider: 'assembly',
        turnOrder: 0,
        transcript: 'hi',
        eventType: 'turn-update'
    });

    session.applyTurnUpdate({
        provider: 'assembly',
        turnOrder: 0,
        utterance: 'hi there',
        eventType: 'turn-update'
    });

    session.applyTurnUpdate({
        provider: 'assembly',
        turnOrder: 0,
        formattedTranscript: 'Hi there.',
        isFormatted: true,
        endOfTurn: true,
        eventType: 'turn-formatted'
    });

    assert.strictEqual(updates.length, 3);
    assert.strictEqual(updates[0].text, 'hi');
    assert.strictEqual(updates[0].isFinal, false);
    assert.strictEqual(updates[1].text, 'hi there');
    assert.strictEqual(updates[1].isFinal, false);
    assert.strictEqual(updates[2].text, 'Hi there.');
    assert.strictEqual(updates[2].isFinal, true);
    assert.strictEqual(updates[2].turn.isFormatted, true);
});

test('normalizeLegacyTranscription produces sequential synthetic turns', () => {
    const session = createSession();

    const first = session.normalizeLegacyTranscription({ text: 'hello' });
    assert.strictEqual(first.turnOrder, 0);
    assert.strictEqual(first.endOfTurn, false);

    const second = session.normalizeLegacyTranscription({ text: 'hello', isFinal: true });
    assert.strictEqual(second.turnOrder, 0);
    assert.strictEqual(second.endOfTurn, true);

    const third = session.normalizeLegacyTranscription({ text: 'next words' });
    assert.strictEqual(third.turnOrder, 1);
});
