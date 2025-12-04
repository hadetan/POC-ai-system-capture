const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const ffmpeg = require('fluent-ffmpeg');

class NoAudioTrackError extends Error {
    constructor(message = 'No audio track detected in the recording.') {
        super(message);
        this.name = 'NoAudioTrackError';
    }
}

const sanitizeErrorMessage = (...parts) => {
    return parts
        .filter(Boolean)
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
        .join(' ')
        .slice(0, 2_000);
};

async function ensureTmpDir(tmpDir) {
    await fs.mkdir(tmpDir, { recursive: true });
    return tmpDir;
}

async function extractAudio(videoPath, { ffmpegPath = null, format = 'wav', tmpDir } = {}) {
    if (!videoPath) {
        throw new Error('extractAudio requires a videoPath argument.');
    }

    if (ffmpegPath) {
        ffmpeg.setFfmpegPath(ffmpegPath);
    }

    const workingDir = await ensureTmpDir(tmpDir || path.join(os.tmpdir(), 'screenaudiocapture'));
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    const fileExtension = format === 'wav' ? 'wav' : 'ogg';
    const codec = format === 'wav' ? 'pcm_s16le' : 'libvorbis';
    const outputPath = path.join(workingDir, `${baseName}-${uniqueSuffix}.${fileExtension}`);
    const contentType = format === 'wav' ? 'audio/wav' : 'audio/ogg';

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .noVideo()
            .audioCodec(codec)
            .audioChannels(2)
            .format(fileExtension)
            .on('end', () => {
                resolve({ audioPath: outputPath, contentType });
            })
            .on('error', (error, _stdout, stderr) => {
                const message = sanitizeErrorMessage(error?.message, stderr);
                if (/Stream specifier|match map|no audio/i.test(message)) {
                    reject(new NoAudioTrackError());
                    return;
                }
                reject(new Error(message || 'Failed to extract audio using FFmpeg.'));
            })
            .save(outputPath);
    });
}

module.exports = {
    extractAudio,
    NoAudioTrackError
};
