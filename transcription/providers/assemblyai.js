const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { setTimeout: delay } = require('node:timers/promises');
const { extractAudio, NoAudioTrackError } = require('../../utils/media');

const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;

if (!fetchFn) {
    throw new Error('Global fetch is unavailable. Update to Node 18+ or provide a fetch polyfill.');
}

const UPLOAD_URL = 'https://api.assemblyai.com/v2/upload';
const TRANSCRIPT_URL = 'https://api.assemblyai.com/v2/transcript';

class AssemblyProvider {
    constructor(options = {}) {
        const {
            apiKey,
            timeoutMs = 120_000,
            pollIntervalMs = 1_500,
            ffmpegPath = null,
            requestConfig = {}
        } = options;

        if (!apiKey) {
            throw new Error('AssemblyProvider requires ASSEMBLYAI_API_KEY.');
        }

        this.apiKey = apiKey;
        this.timeoutMs = timeoutMs;
        this.pollIntervalMs = Math.max(500, pollIntervalMs);
        this.ffmpegPath = ffmpegPath;
        this.requestConfig = requestConfig;
    }

    async prepareAudio(videoPath) {
        try {
            return await extractAudio(videoPath, {
                ffmpegPath: this.ffmpegPath,
                format: 'wav'
            });
        } catch (error) {
            if (error instanceof NoAudioTrackError) {
                throw error;
            }
            throw new Error(`Failed to prepare audio for AssemblyAI: ${error.message}`);
        }
    }

    buildHeaders(extra = {}) {
        return {
            authorization: this.apiKey,
            ...extra
        };
    }

    async uploadAudio(filePath) {
        const stream = createReadStream(filePath);
        const response = await fetchFn(UPLOAD_URL, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: stream
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`AssemblyAI upload failed (${response.status}): ${body}`);
        }

        const payload = await response.json();
        if (!payload?.upload_url) {
            throw new Error('AssemblyAI upload response missing upload_url.');
        }
        return payload.upload_url;
    }

    async createTranscript(uploadUrl, metadata) {
        const requestBody = {
            audio_url: uploadUrl,
            auto_chapters: false,
            punctuate: true,
            format_text: true,
            speaker_labels: false,
            metadata: metadata ? {
                sourceName: metadata.sourceName,
                platform: metadata.platform,
                sessionId: metadata.sessionId
            } : undefined,
            ...this.requestConfig
        };

        const response = await fetchFn(TRANSCRIPT_URL, {
            method: 'POST',
            headers: this.buildHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`AssemblyAI transcript request failed (${response.status}): ${body}`);
        }

        const payload = await response.json();
        if (!payload?.id) {
            throw new Error('AssemblyAI transcript response missing id.');
        }
        return payload;
    }

    async pollTranscript(transcriptId, deadlineTs) {
        while (true) {
            if (Date.now() > deadlineTs) {
                throw new Error('AssemblyAI transcription timed out.');
            }

            const response = await fetchFn(`${TRANSCRIPT_URL}/${transcriptId}`, {
                headers: this.buildHeaders()
            });

            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`AssemblyAI transcript poll failed (${response.status}): ${body}`);
            }

            const payload = await response.json();
            if (payload.status === 'completed') {
                return payload;
            }
            if (payload.status === 'error') {
                throw new Error(payload.error || 'AssemblyAI transcription failed.');
            }

            await delay(this.pollIntervalMs);
        }
    }

    async transcribe({ audioPath, metadata }) {
        if (!audioPath) {
            throw new Error('transcribe() requires an audioPath.');
        }

        const deadline = Date.now() + this.timeoutMs;
        const uploadUrl = await this.uploadAudio(audioPath);
        const transcriptJob = await this.createTranscript(uploadUrl, metadata);
        const transcript = await this.pollTranscript(transcriptJob.id, deadline);

        if (!transcript.text) {
            throw new Error('AssemblyAI returned an empty transcript.');
        }

        return {
            text: transcript.text,
            provider: 'assembly',
            model: transcript?.model ?? 'assemblyai-default'
        };
    }
}

module.exports = {
    AssemblyProvider,
    NoAudioTrackError
};
