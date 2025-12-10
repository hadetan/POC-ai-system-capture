const fs = require('node:fs');

let bundledPath;
let attemptedLoad = false;

function loadBundledFfmpegPath() {
    if (attemptedLoad) {
        return bundledPath;
    }
    attemptedLoad = true;
    try {
        const installer = require('@ffmpeg-installer/ffmpeg');
        if (installer?.path && fs.existsSync(installer.path)) {
            bundledPath = installer.path;
        } else {
            bundledPath = null;
        }
    } catch (error) {
        bundledPath = null;
    }
    return bundledPath;
}

function resolveFfmpegPath(explicitPath) {
    const normalized = typeof explicitPath === 'string' && explicitPath.trim().length > 0
        ? explicitPath.trim()
        : null;
    if (normalized) {
        return normalized;
    }

    const envPath = typeof process.env.TRANSCRIPTION_FFMPEG_PATH === 'string'
        ? process.env.TRANSCRIPTION_FFMPEG_PATH.trim()
        : null;
    if (envPath) {
        return envPath;
    }

    const fallback = loadBundledFfmpegPath();
    if (fallback) {
        return fallback;
    }

    return null;
}

function hasBundledFfmpeg() {
    return Boolean(loadBundledFfmpegPath());
}

module.exports = {
    resolveFfmpegPath,
    hasBundledFfmpeg
};
