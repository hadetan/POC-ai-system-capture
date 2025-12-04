/**
 * Gemini Live API WebSocket Client for real-time audio transcription.
 *
 * Per official docs (https://ai.google.dev/gemini-api/docs/live-guide):
 * - Audio must be raw 16-bit PCM, little-endian, mono
 * - Input sample rate: 16kHz (API will resample if needed)
 * - MIME type: audio/pcm;rate=16000
 * - Enable input_audio_transcription for speech-to-text
 * - Set response_modalities: ["TEXT"] for text-only output
 */

const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

const LIVE_API_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const LOG_PREFIX = '[LiveAPI]';
const log = (level, message, ...args) => {
    const stamp = new Date().toISOString();
    const logger = console[level] || console.log;
    logger(`${LOG_PREFIX} ${stamp} ${message}`, ...args);
};

log('info', `GeminiLiveClient loaded from ${__filename}`);

/**
 * Gemini Live API client for real-time audio transcription.
 * Uses WebSocket to stream PCM audio and receive text transcriptions.
 */
class GeminiLiveClient extends EventEmitter {
    constructor(options) {
        super();
        const { apiKey, model, timeoutMs = 30000 } = options;

        if (!apiKey) {
            throw new Error('GeminiLiveClient requires apiKey.');
        }

        this.apiKey = apiKey;
        // Use the Live API model for real-time audio
        this.model = model || 'gemini-2.5-flash-preview-native-audio-dialog';
        this.timeoutMs = timeoutMs;

        this.ws = null;
        this.connected = false;
        this.setupComplete = false;
        this.transcript = '';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
    }

    /**
     * Connect to the Gemini Live API WebSocket
     */
    async connect() {
        if (this.ws && this.connected) {
            return;
        }

        const url = `${LIVE_API_URL}?key=${this.apiKey}`;

        return new Promise((resolve, reject) => {
            const connectTimeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, this.timeoutMs);

            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                log('info', 'WebSocket connected');
                this.connected = true;
                clearTimeout(connectTimeout);
                this.sendSetup();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
                if (this.setupComplete && !this._resolved) {
                    this._resolved = true;
                    resolve();
                }
            });

            this.ws.on('error', (error) => {
                log('error', 'WebSocket error:', error.message);
                clearTimeout(connectTimeout);
                this.emit('error', error);
                if (!this._resolved) {
                    this._resolved = true;
                    reject(error);
                }
            });

            this.ws.on('close', (code, reason) => {
                log('info', `WebSocket closed: ${code} ${reason}`);
                this.connected = false;
                this.setupComplete = false;
                this.emit('disconnected', { code, reason: reason?.toString() });
            });
        });
    }

    /**
     * Send the initial setup message to configure the session
     */
    sendSetup() {
        const setupMessage = {
            setup: {
                model: `models/${this.model}`,
                generationConfig: {
                    responseModalities: ['TEXT']
                },
                // Enable transcription of input audio - this is what we need!
                inputAudioTranscription: {}
            }
        };

        log('info', 'Sending setup:', JSON.stringify(setupMessage));
        this.ws.send(JSON.stringify(setupMessage));
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            // Debug: log all incoming messages
            const messageKeys = Object.keys(message);
            log('info', `Received message with keys: ${messageKeys.join(', ')}`);

            // Setup complete acknowledgment
            if (message.setupComplete) {
                log('info', 'Setup complete');
                this.setupComplete = true;
                this.emit('ready');
                return;
            }

            // Server content with transcription
            if (message.serverContent) {
                const serverContent = message.serverContent;
                const contentKeys = Object.keys(serverContent);
                log('info', `ServerContent keys: ${contentKeys.join(', ')}`);

                // Input transcription - this is the transcription of the audio we sent
                if (serverContent.inputTranscription?.text) {
                    const text = serverContent.inputTranscription.text;
                    if (text) {
                        log('info', `Input transcription: "${text}"`);
                        // Emit only the delta - let service.js handle accumulation
                        // Provide a latency hint based on recent send timestamp
                        const now = Date.now();
                        let latencyHint;
                        if (this.lastSendTs) {
                            latencyHint = now - this.lastSendTs;
                        }
                        this.emit('transcription', {
                            text: text,
                            latencyMs: latencyHint
                        });
                        log('info', `Approx latency to transcript: ${latencyHint ?? 'n/a'}ms`);
                    }
                }

                // Model turn - the model's response (we may not need this for pure transcription)
                if (serverContent.modelTurn?.parts) {
                    for (const part of serverContent.modelTurn.parts) {
                        if (part.text) {
                            log('info', `Model response: "${part.text}"`);
                            // We can emit this separately if needed
                            this.emit('model-response', { text: part.text });
                        }
                    }
                }

                // Turn complete
                if (serverContent.turnComplete) {
                    log('info', 'Turn complete');
                    this.emit('turn-complete');
                }

                // Interrupted
                if (serverContent.interrupted) {
                    log('info', 'Generation interrupted');
                    this.emit('interrupted');
                }
            }

            // Usage metadata
            if (message.usageMetadata) {
                this.emit('usage', message.usageMetadata);
            }

            // Go away notice (server disconnecting soon)
            if (message.goAway) {
                log('warn', 'Server sent goAway, will disconnect soon');
                this.emit('go-away', message.goAway);
            }

        } catch (error) {
            log('error', 'Failed to parse message:', error.message);
        }
    }

    /**
     * Send audio data to the API
     * Audio must be raw 16-bit PCM, little-endian, mono @ 16kHz
     * @param {Buffer} pcmBuffer - Raw PCM audio data
     */
    /**
     * Send audio data with optional metadata for latency tracking
     * @param {Buffer} pcmBuffer - Raw PCM audio data
     * @param {Object} meta - Optional metadata (e.g., {clientTs, seq})
     */
    sendAudio(pcmBuffer, meta = {}) {
        if (!this.connected || !this.setupComplete) {
            log('warn', 'Cannot send audio: not connected or setup not complete');
            return false;
        }

        if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length === 0) {
            return false;
        }

        // Log audio chunk size (every 10th chunk to reduce noise)
        this.audioChunkCount = (this.audioChunkCount || 0) + 1;
        if (this.audioChunkCount % 10 === 1) {
            log('info', `Sending audio chunk #${this.audioChunkCount}, size: ${pcmBuffer.length} bytes`);
        }
        // Track client timestamp and last send timestamp for latency estimation
        const sendTs = Date.now();
        try {
            this.lastSendTs = sendTs;
            this.lastSendSeq = this.audioChunkCount;
            if (meta?.clientTs) {
                this.lastClientTs = meta.clientTs;
            }
        } catch (err) {
            // ignore metadata errors
        }

        // Use "audio" field per API spec (mediaChunks is deprecated)
        const message = {
            realtimeInput: {
                audio: {
                    data: pcmBuffer.toString('base64'),
                    mimeType: 'audio/pcm;rate=16000'
                }
            }
        };

        let instrumentationMeta = null;
        if (meta && typeof meta === 'object') {
            instrumentationMeta = {
                sequence: meta.sequence,
                captureTs: meta.captureTs ?? meta.clientTs,
                segmentProducedTs: meta.segmentProducedTs,
                filler: Boolean(meta.filler),
                pcmBytes: pcmBuffer.length
            };
        }

        try {
            this.ws.send(JSON.stringify(message));
            const payload = instrumentationMeta || {};
            payload.wsSendTs = sendTs;
            payload.pcmBytes = payload.pcmBytes ?? pcmBuffer.length;
            this.emit('chunk-sent', payload);
            return true;
        } catch (error) {
            log('error', 'Failed to send audio:', error.message);
            return false;
        }
    }

    /**
     * Signal end of audio stream (e.g., microphone turned off)
     */
    sendAudioStreamEnd() {
        if (!this.connected || !this.setupComplete) {
            return;
        }

        const message = {
            realtimeInput: {
                audioStreamEnd: true
            }
        };

        try {
            this.ws.send(JSON.stringify(message));
            log('info', 'Sent audio stream end');
        } catch (error) {
            log('error', 'Failed to send audio stream end:', error.message);
        }
    }

    /**
     * Send text message to trigger a response
     * @param {string} text - Text to send
     * @param {boolean} endTurn - Whether this completes the turn
     */
    sendText(text, endTurn = true) {
        if (!this.connected || !this.setupComplete) {
            return false;
        }

        const message = {
            clientContent: {
                turns: [
                    {
                        role: 'user',
                        parts: [{ text }]
                    }
                ],
                turnComplete: endTurn
            }
        };

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            log('error', 'Failed to send text:', error.message);
            return false;
        }
    }

    /**
     * Get current accumulated transcript
     */
    getTranscript() {
        return this.transcript;
    }

    /**
     * Clear the accumulated transcript
     */
    clearTranscript() {
        this.transcript = '';
    }

    /**
     * Check if connected and ready
     */
    isReady() {
        return this.connected && this.setupComplete;
    }

    /**
     * Disconnect from the API
     */
    disconnect() {
        if (this.ws) {
            try {
                this.sendAudioStreamEnd();
                this.ws.close(1000, 'Client disconnect');
            } catch (error) {
                log('error', 'Error during disconnect:', error.message);
            }
            this.ws = null;
        }
        this.connected = false;
        this.setupComplete = false;
        this._resolved = false;
    }
}

module.exports = { GeminiLiveClient };
