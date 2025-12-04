const path = require('node:path');

const toBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    const normalized = String(value).toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
    }
    return defaultValue;
};

const toInteger = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
};

module.exports = function loadTranscriptionConfig({ defaultOutputDir } = {}) {
    const {
        TRANSCRIPTION_ENABLED,
        TRANSCRIPTION_PROVIDER,
        TRANSCRIPTION_FFMPEG_PATH,
        TRANSCRIPTION_MODEL,
        TRANSCRIPTION_TIMEOUT_MS,
        TRANSCRIPTION_OUTPUT_DIR,
        TRANSCRIPTION_MOCK,
        TRANSCRIPTION_CHUNK_TIMESLICE_MS,
        TRANSCRIPTION_MAX_CHUNK_BYTES,
        TRANSCRIPTION_WINDOW_CHUNKS,
        TRANSCRIPTION_PROMPT,
        TRANSCRIPTION_SILENCE_FILL_MS,
        TRANSCRIPTION_SILENCE_FRAME_MS,
        GEMINI_API_KEY
    } = process.env;

    const provider = (TRANSCRIPTION_PROVIDER || 'gemini').toLowerCase();

    return {
        enabled: toBoolean(TRANSCRIPTION_ENABLED, Boolean(GEMINI_API_KEY)),
        provider,
        ffmpegPath: TRANSCRIPTION_FFMPEG_PATH || null,
        model: TRANSCRIPTION_MODEL || 'models/gemini-1.5-flash-latest',
        timeoutMs: toInteger(TRANSCRIPTION_TIMEOUT_MS, 90_000),
        outputDir: TRANSCRIPTION_OUTPUT_DIR
            ? path.resolve(TRANSCRIPTION_OUTPUT_DIR)
            : defaultOutputDir,
        providerConfig: {
            gemini: {
                apiKey: GEMINI_API_KEY || null,
                model: TRANSCRIPTION_MODEL || 'models/gemini-1.5-flash-latest',
                timeoutMs: toInteger(TRANSCRIPTION_TIMEOUT_MS, 90_000)
            }
        },
        streaming: {
            mock: toBoolean(TRANSCRIPTION_MOCK, false),
            chunkTimesliceMs: toInteger(TRANSCRIPTION_CHUNK_TIMESLICE_MS, 200),
            maxChunkBytes: toInteger(TRANSCRIPTION_MAX_CHUNK_BYTES, 128 * 1024),
            windowChunks: Math.max(1, toInteger(TRANSCRIPTION_WINDOW_CHUNKS, 12)),
            prompt: TRANSCRIPTION_PROMPT || 'Transcribe the incoming system audio. Respond with lower-case plain text, no timestamps, no speaker labels.',
            silenceFillMs: toInteger(TRANSCRIPTION_SILENCE_FILL_MS, 200),
            silenceFrameMs: toInteger(TRANSCRIPTION_SILENCE_FRAME_MS, 20)
        }
    };
};
