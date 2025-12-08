#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { AssemblyLiveClient } = require('../transcription/streaming/assembly-client');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node scripts/test-realtime-assembly.js <path-to-16khz-mono-pcm-file>');
        process.exit(1);
    }

    const resolvedPath = path.resolve(filePath);
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
        console.error('Missing ASSEMBLYAI_API_KEY in environment.');
        process.exit(1);
    }

    const pcmBuffer = await fs.readFile(resolvedPath);
    console.log(`[Harness] Loaded ${pcmBuffer.length} bytes from ${resolvedPath}`);

    const client = new AssemblyLiveClient({ apiKey });

    client.on('transcription', (payload) => {
        console.log(`[Transcription:${payload.type}] ${payload.text} (latency ~${payload.latencyMs ?? 'n/a'}ms)`);
    });

    client.on('error', (error) => {
        console.error('[Harness] Client error:', error.message);
    });

    client.on('disconnected', () => {
        console.log('[Harness] Socket disconnected');
    });

    await client.connect();

    const chunkSize = 3200; // ~100ms of 16kHz PCM mono
    let sequence = 0;
    for (let offset = 0; offset < pcmBuffer.length; offset += chunkSize) {
        const chunk = pcmBuffer.slice(offset, offset + chunkSize);
        const sent = client.sendAudio(chunk, { sequence, captureTs: Date.now() });
        if (!sent) {
            console.warn('[Harness] Failed to send chunk, aborting');
            break;
        }
        sequence += 1;
        await sleep(100); // mimic real-time pacing
    }

    client.sendAudioStreamEnd();
    await sleep(1500);
    client.disconnect();
}

main().catch((error) => {
    console.error('[Harness] Fatal error:', error);
    process.exit(1);
});
