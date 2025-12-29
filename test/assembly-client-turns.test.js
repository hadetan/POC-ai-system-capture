const test = require('node:test');
const assert = require('node:assert/strict');
const { AssemblyLiveClient } = require('../server/ai/transcription/streaming/providers/assembly-client');

test('AssemblyLiveClient emits enriched turn payloads with formatted upgrades', () => {
    const client = new AssemblyLiveClient({ apiKey: 'fake-key', enableRawMessages: false });
    const events = [];
    client.on('turn-event', (payload) => events.push(payload));

    client.lastSendTs = Date.now() - 25;
    client.handleTurnEvent({
        transcript: 'hi',
        utterance: 'hi',
        turn_order: 0,
        end_of_turn: false,
        end_of_turn_confidence: 0.12
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].turnOrder, 0);
    assert.strictEqual(events[0].transcript, 'hi');
    assert.strictEqual(events[0].utterance, 'hi');
    assert.strictEqual(events[0].eventType, 'turn-update');
    assert.strictEqual(events[0].isFormatted, false);
    assert.strictEqual(events[0].endOfTurn, false);

    client.lastSendTs = Date.now() - 25;
    client.handleTurnEvent({
        transcript: 'Hi.',
        turn_order: 0,
        turn_is_formatted: true,
        end_of_turn: true,
        end_of_turn_confidence: 0.91
    });

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].eventType, 'turn-formatted');
    assert.strictEqual(events[1].formattedTranscript, 'Hi.');
    assert.strictEqual(events[1].isFormatted, true);
    assert.strictEqual(events[1].endOfTurn, true);
    assert.strictEqual(events[1].turnOrder, 0);
    assert.ok(events[1].latencyMs >= 0);
});
