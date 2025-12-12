require('dotenv').config();

const { resolveFfmpegPath } = require('../utils/ffmpeg');

const toInteger = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
};

const toNumber = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
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
        TRANSCRIPTION_FFMPEG_PATH,
        TRANSCRIPTION_HEARTBEAT_INTERVAL_MS,
        TRANSCRIPTION_SILENCE_NOTIFY_MS,
        TRANSCRIPTION_SILENCE_SUPPRESS_MS,
        TRANSCRIPTION_SILENCE_ENERGY_THRESHOLD,
        TRANSCRIPTION_RECONNECT_BACKOFF_MS,
        TRANSCRIPTION_MAX_RECONNECT_ATTEMPTS,
        ASSEMBLYAI_MAX_TURN_SILENCE_MS,
        ASSEMBLYAI_MIN_END_OF_TURN_SILENCE_MS,
        ASSEMBLYAI_EOT_CONFIDENCE_THRESHOLD
    } = process.env;

    const provider = (TRANSCRIPTION_PROVIDER || 'assembly').toLowerCase();
    const ffmpegPath = resolveFfmpegPath(TRANSCRIPTION_FFMPEG_PATH);

    const assemblyParams = {};
    const maxTurnSilence = toInteger(ASSEMBLYAI_MAX_TURN_SILENCE_MS, null);
    if (Number.isInteger(maxTurnSilence) && maxTurnSilence > 0) {
        assemblyParams.maxTurnSilence = maxTurnSilence;
    }
    const minConfidentSilence = toInteger(ASSEMBLYAI_MIN_END_OF_TURN_SILENCE_MS, null);
    if (Number.isInteger(minConfidentSilence) && minConfidentSilence > 0) {
        assemblyParams.minEndOfTurnSilenceWhenConfident = minConfidentSilence;
    }
    const endOfTurnConfidence = toNumber(ASSEMBLYAI_EOT_CONFIDENCE_THRESHOLD, null);
    if (typeof endOfTurnConfidence === 'number' && !Number.isNaN(endOfTurnConfidence)) {
        assemblyParams.endOfTurnConfidenceThreshold = endOfTurnConfidence;
    }

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
            silenceFrameMs: toInteger(TRANSCRIPTION_SILENCE_FRAME_MS, 120),
            heartbeatIntervalMs: toInteger(TRANSCRIPTION_HEARTBEAT_INTERVAL_MS, 250),
            silenceNotifyMs: toInteger(TRANSCRIPTION_SILENCE_NOTIFY_MS, 600),
            silenceSuppressMs: toInteger(TRANSCRIPTION_SILENCE_SUPPRESS_MS, 900),
            silenceEnergyThreshold: toInteger(TRANSCRIPTION_SILENCE_ENERGY_THRESHOLD, 350),
            reconnectBackoffMs: toInteger(TRANSCRIPTION_RECONNECT_BACKOFF_MS, 750),
            maxReconnectAttempts: toInteger(TRANSCRIPTION_MAX_RECONNECT_ATTEMPTS, 6),
            assemblyParams
        }
    };
};
