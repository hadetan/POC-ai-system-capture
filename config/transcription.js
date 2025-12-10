require('dotenv').config();

const { resolveFfmpegPath } = require('../utils/ffmpeg');

const toInteger = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
};

module.exports = function loadTranscriptionConfig() {
    const {
        TRANSCRIPTION_PROVIDER,
        ASSEMBLYAI_API_KEY,
        TRANSCRIPTION_TIMEOUT_MS,
        TRANSCRIPTION_CHUNK_TIMESLICE_MS,
        TRANSCRIPTION_MAX_CHUNK_BYTES,
        TRANSCRIPTION_PROMPT,
        TRANSCRIPTION_SILENCE_FILL_MS,
        TRANSCRIPTION_SILENCE_FRAME_MS,
        TRANSCRIPTION_FFMPEG_PATH
    } = process.env;

    const provider = (TRANSCRIPTION_PROVIDER || 'assembly').toLowerCase();
    const ffmpegPath = resolveFfmpegPath(TRANSCRIPTION_FFMPEG_PATH);

    return {
        provider,
        ffmpegPath,
        providerConfig: {
            assembly: {
                apiKey: ASSEMBLYAI_API_KEY || null,
                timeoutMs: toInteger(TRANSCRIPTION_TIMEOUT_MS, 120_000),
                ffmpegPath
            }
        },
        streaming: {
            chunkTimesliceMs: toInteger(TRANSCRIPTION_CHUNK_TIMESLICE_MS, 150),
            maxChunkBytes: toInteger(TRANSCRIPTION_MAX_CHUNK_BYTES, 128 * 1024),
            prompt: TRANSCRIPTION_PROMPT || 'transcribe the incoming system audio. respond with lower-case plain text, no timestamps, no speaker labels.',
            silenceFillMs: toInteger(TRANSCRIPTION_SILENCE_FILL_MS, 200),
            silenceFrameMs: toInteger(TRANSCRIPTION_SILENCE_FRAME_MS, 20)
        }
    };
};
