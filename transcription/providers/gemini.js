const fs = require('node:fs/promises');
const { GoogleGenAI } = require('@google/genai');
const { extractAudio, NoAudioTrackError } = require('../../utils/media');

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(timeoutMessage || 'Gemini transcription timed out.'));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        return result;
    } finally {
        clearTimeout(timeoutHandle);
    }
};

class GeminiProvider {
    constructor(options = {}) {
        const { apiKey, model = 'models/gemini-1.5-flash-latest', timeoutMs = 90_000, ffmpegPath = null } = options;
        if (!apiKey) {
            throw new Error('Gemini provider requires GEMINI_API_KEY to be set.');
        }

        this.apiKey = apiKey;
        this.modelName = model;
        this.timeoutMs = timeoutMs;
        this.ffmpegPath = ffmpegPath;
        this.prompt = 'Transcribe the following audio and return only plain text with line breaks where natural pauses occur.';
        this.client = new GoogleGenAI({ apiKey });
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
            throw new Error(`Failed to prepare audio for Gemini: ${error.message}`);
        }
    }

    async transcribe({ audioPath, contentType, metadata }) {
        const audioBuffer = await fs.readFile(audioPath);
        const base64 = audioBuffer.toString('base64');

        let result;
        try {
            result = await withTimeout(
                this.client.models.generateContent({
                    model: this.modelName,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    text: `${this.prompt}\nRecording source: ${metadata?.sourceName || 'unknown source'}.`
                                },
                                {
                                    inlineData: {
                                        data: base64,
                                        mimeType: contentType
                                    }
                                }
                            ]
                        }
                    ]
                }),
                this.timeoutMs,
                'Gemini transcription timed out.'
            );
        } catch (error) {
            const message = error?.message || String(error);
            if (/models\/.*not found/i.test(message)) {
                throw new Error(`${message} — verify TRANSCRIPTION_MODEL matches a model available to your Gemini API key (e.g. models/gemini-1.5-flash-latest).`);
            }
            throw error;
        }

        const normalizePartsToText = (parts) => {
            if (!Array.isArray(parts)) {
                return [];
            }

            return parts.flatMap((part) => {
                if (!part) {
                    return [];
                }

                if (typeof part.text === 'string') {
                    return [part.text];
                }

                if (Array.isArray(part.parts)) {
                    return normalizePartsToText(part.parts);
                }

                return [];
            });
        };

        const collectCandidateTexts = (candidates) => {
            if (!Array.isArray(candidates)) {
                return [];
            }

            return candidates.flatMap((candidate) => {
                if (!candidate) {
                    return [];
                }

                if (Array.isArray(candidate.parts)) {
                    return normalizePartsToText(candidate.parts);
                }

                if (Array.isArray(candidate.content?.parts)) {
                    return normalizePartsToText(candidate.content.parts);
                }

                return [];
            });
        };

        const extractText = (payload) => {
            if (!payload) {
                return '';
            }

            if (typeof payload.text === 'string' && payload.text.trim()) {
                return payload.text.trim();
            }

            const responseText = typeof payload.response?.text === 'string' ? payload.response.text.trim() : '';
            if (responseText) {
                return responseText;
            }

            const candidateTexts = collectCandidateTexts(payload.response?.candidates) || [];
            const directCandidateTexts = collectCandidateTexts(payload.candidates) || [];
            const allTexts = [...candidateTexts, ...directCandidateTexts]
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter(Boolean);

            return allTexts.join('\n').trim();
        };

        const text = extractText(result);

        if (!text) {
            let status = 'unavailable';
            if (typeof result === 'object' && result !== null) {
                try {
                    status = JSON.stringify(result).slice(0, 500);
                } catch (_error) {
                    status = 'non-serializable payload';
                }
            }
            throw new Error(`Gemini returned an empty transcription response (payload snapshot: ${status}).`);
        }

        return {
            text,
            provider: 'gemini',
            model: this.modelName
        };
    }
}

module.exports = {
    GeminiProvider,
    NoAudioTrackError
};
