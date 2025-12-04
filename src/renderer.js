const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const statusLabel = document.getElementById('status');
const transcriptOutput = document.getElementById('transcript-output');

const platform = window.electronAPI.getPlatform();
// Read chunk timeslice from preload-exposed env getter with defaults/validation
const CHUNK_TIMESLICE_MS = (typeof window.electronAPI?.getChunkTimesliceMs === 'function')
    ? Number(window.electronAPI.getChunkTimesliceMs())
    : 200;
console.debug('Using CHUNK_TIMESLICE_MS =', CHUNK_TIMESLICE_MS);

const resolvePreferredMimeType = () => {
    if (typeof MediaRecorder?.isTypeSupported !== 'function') {
        return '';
    }
    const candidates = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm'
    ];
    return candidates.find((candidate) => {
        try {
            return MediaRecorder.isTypeSupported(candidate);
        } catch (_error) {
            return false;
        }
    }) || '';
};

const preferredMimeType = resolvePreferredMimeType();

const buildRecorderOptions = () => {
    if (!preferredMimeType) {
        return {};
    }
    return { mimeType: preferredMimeType };
};

let mediaRecorder = null;
let captureStream = null;
let sessionId = null;
let chunkSequence = 0;
let awaitingSourceSelection = false;
let stopTranscriptionListener = null;
let recordingMimeType = preferredMimeType || 'audio/webm;codecs=opus';
let lastLatencyLabel = '';
let lastLatencyUpdateTs = 0;
let latencyWatchdogTimer = null;
const STALL_THRESHOLD_MS = 5000;
const STALL_WATCH_INTERVAL_MS = 1000;
let localTranscript = '';
let lastServerText = '';

function appendWithOverlap(base, incoming) {
    if (!base || !incoming) return base + incoming;
    const maxOverlap = Math.min(base.length, incoming.length);
    for (let k = maxOverlap; k > 0; k -= 1) {
        if (base.slice(base.length - k) === incoming.slice(0, k)) {
            return base + incoming.slice(k);
        }
    }
    return base + incoming;
}

const updateStatus = (message) => {
    statusLabel.textContent = message;
};

const updateTranscript = (text) => {
    transcriptOutput.textContent = text || '';
};

const updateButtonStates = ({ isFetching = false } = {}) => {
    const isStreaming = Boolean(mediaRecorder && mediaRecorder.state !== 'inactive');
    const busy = isFetching || awaitingSourceSelection;
    startButton.disabled = busy || isStreaming;
    stopButton.disabled = !isStreaming;
};

const resetTranscriptionListener = () => {
    if (typeof stopTranscriptionListener === 'function') {
        stopTranscriptionListener();
        stopTranscriptionListener = null;
    }
};

const teardownSession = async () => {
    if (sessionId) {
        await window.electronAPI.transcription.stopSession(sessionId).catch(() => {});
        sessionId = null;
    }
    resetTranscriptionListener();
    updateTranscript('');
    resetLatencyWatchdog();
    // clear local cached transcript state
    localTranscript = '';
    lastServerText = '';
};

const stopCapture = async () => {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder = null;
    }
    if (captureStream) {
        captureStream.getTracks().forEach((track) => track.stop());
        captureStream = null;
    }
    await teardownSession();
    chunkSequence = 0;
    recordingMimeType = preferredMimeType || 'audio/webm;codecs=opus';
};

const buildVideoConstraints = (sourceId) => ({
    mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
    }
});

const buildAudioConstraints = (sourceId) => {
    if (platform === 'darwin') {
        return false;
    }
    return {
        mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
        }
    };
};

const handleChunk = async (event) => {
    if (!event?.data?.size || !sessionId) {
        return;
    }

    try {
        const sequence = chunkSequence;
        chunkSequence += 1;
        const arrayBuffer = await event.data.arrayBuffer();
        const captureTimestamp = Date.now();
        window.electronAPI.transcription.sendChunk({
            sessionId,
            sequence,
            mimeType: recordingMimeType,
            data: arrayBuffer,
            timestamp: captureTimestamp,
            captureTimestamp
        });
    } catch (error) {
        console.error('Failed to dispatch audio chunk', error);
    }
};

const attachTranscriptionEvents = () => {
    resetTranscriptionListener();
    stopTranscriptionListener = window.electronAPI.transcription.onEvent((payload = {}) => {
        if (!sessionId || payload.sessionId !== sessionId) {
            return;
        }

        switch (payload.type) {
            case 'started':
                ensureLatencyWatchdog();
                lastLatencyLabel = '';
                lastLatencyUpdateTs = Date.now();
                updateStatus('Streaming transcription active.');
                break;
            case 'update':
                // Merge server-sent text with local transcript using a small heuristic to avoid
                // replacing accumulated content with fragment results.
                {
                    const serverText = payload.text || '';
                    const delta = payload.delta || '';
                    if (serverText) {
                        if (serverText === lastServerText) {
                            // no change
                        } else if (serverText.startsWith(lastServerText) && lastServerText.length > 0) {
                            // server is sending cumulative text
                            localTranscript = serverText;
                        } else if (lastServerText.endsWith(serverText)) {
                            // server sent a suffix duplicate, ignore
                        } else if (false && serverText.includes(lastServerText) && lastServerText.length > 0) {
                            // Disabled heuristic that treated an 'includes' case as authoritative
                            // because in practice it sometimes truncated prior content.
                            // We'll instead fall through to overlap/delta merge below.
                            localTranscript = serverText;
                        } else if (delta) {
                            // prefer applying delta if provided - append with overlap detection so we don't duplicate
                            localTranscript = appendWithOverlap(localTranscript, delta);
                        } else {
                            // attempt to merge by overlap: append only non-overlapping portion
                            const prev = lastServerText || '';
                            const abs = serverText;
                            let overlap = 0;
                            const maxOverlap = Math.min(prev.length, abs.length);
                            for (let k = maxOverlap; k > 0; k -= 1) {
                                if (prev.slice(prev.length - k) === abs.slice(0, k)) {
                                    overlap = k;
                                    break;
                                }
                            }
                            localTranscript = appendWithOverlap(localTranscript, abs.slice(overlap));
                        }
                        lastServerText = serverText;
                    } else if (delta) {
                        localTranscript = localTranscript + delta;
                    }
                    updateTranscript(localTranscript || '');
                }
                lastLatencyUpdateTs = Date.now();
                lastLatencyLabel = `WS ${payload.latencyMs ?? '-'}ms | E2E ${payload.pipelineMs ?? '-'}ms | CONV ${payload.conversionMs ?? '-'}ms`;
                ensureLatencyWatchdog();
                renderLatencyStatus();
                break;
            case 'warning':
                console.warn('[Transcription warning]', payload);
                resetLatencyWatchdog();
                updateStatus(`Transcription warning: ${resolveWarningMessage(payload)}`);
                break;
            case 'error':
                resetLatencyWatchdog();
                updateStatus(`Transcription error: ${payload.error?.message || 'Unknown error'}`);
                break;
            case 'stopped':
                resetLatencyWatchdog();
                updateStatus('Transcription session stopped.');
                // clear cached transcript state when service signals stop
                localTranscript = '';
                lastServerText = '';
                break;
            default:
                break;
        }
    });
};

const startStreamingWithSource = async (source) => {
    const sourceId = source?.id;
    if (!sourceId) {
        updateStatus('No valid source selected.');
        return;
    }

    updateButtonStates({ isFetching: true });
    updateStatus('Preparing capture stream…');

    const videoConstraints = buildVideoConstraints(sourceId);
    const audioConstraints = buildAudioConstraints(sourceId);

    try {
        captureStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: videoConstraints
        });
    } catch (error) {
        console.error('Failed to obtain capture stream', error);
        updateStatus(`Failed to capture system audio: ${error?.message || error}`);
        updateButtonStates({ isFetching: false });
        return;
    }

    const audioTracks = captureStream.getAudioTracks();
    if (!audioTracks.length) {
        updateStatus('No system audio track detected.');
        updateButtonStates({ isFetching: false });
        return;
    }

    const audioStream = new MediaStream(audioTracks);

    let sessionResponse;
    try {
        sessionResponse = await window.electronAPI.transcription.startSession({
            sourceName: source.name || source.id,
            platform
        });
    } catch (error) {
        console.error('Failed to start transcription session', error);
        updateStatus(`Transcription unavailable: ${error?.message || 'unknown error'}`);
        await stopCapture();
        updateButtonStates({ isFetching: false });
        return;
    }
    sessionId = sessionResponse.sessionId;
    attachTranscriptionEvents();

    const recorderOptions = buildRecorderOptions();
    try {
        mediaRecorder = new MediaRecorder(audioStream, recorderOptions);
    } catch (error) {
        console.error('MediaRecorder error when applying preferred mime type', recorderOptions, error);
        mediaRecorder = new MediaRecorder(audioStream);
    }

    recordingMimeType = mediaRecorder.mimeType || preferredMimeType || 'audio/webm;codecs=opus';

    mediaRecorder.addEventListener('dataavailable', handleChunk);
    mediaRecorder.addEventListener('error', async (event) => {
        console.error('MediaRecorder error', event.error);
        updateStatus(`Recorder error: ${event.error?.message || event.error}`);
        await stopCapture();
        updateButtonStates();
    });
    mediaRecorder.addEventListener('stop', () => {
        mediaRecorder = null;
        if (captureStream) {
            captureStream.getTracks().forEach((track) => track.stop());
            captureStream = null;
        }
    });

    chunkSequence = 0;
    mediaRecorder.start(CHUNK_TIMESLICE_MS);
    // reset transcript cache for a new session
    localTranscript = '';
    lastServerText = '';
    updateStatus('Capturing system audio…');
    updateButtonStates({ isFetching: false });
};

const promptSourceSelection = async () => {
    awaitingSourceSelection = true;
    updateButtonStates({ isFetching: true });

    try {
        const sources = await window.electronAPI.getDesktopSources({ types: ['screen', 'window'] });
        awaitingSourceSelection = false;

        if (!sources?.length) {
            updateStatus('No sources returned.');
            return;
        }

        await startStreamingWithSource(sources[0]);
    } catch (error) {
        awaitingSourceSelection = false;
        console.error('Failed to list sources', error);
        updateStatus(`Failed to list sources: ${error?.message || 'Unknown error'}`);
    } finally {
        updateButtonStates({ isFetching: false });
    }
};

startButton.addEventListener('click', promptSourceSelection);
stopButton.addEventListener('click', async () => {
    updateStatus('Stopping capture…');
    await stopCapture();
    updateStatus('Idle');
    updateButtonStates();
});

window.addEventListener('beforeunload', () => {
    stopCapture().catch(() => {});
});

updateButtonStates();
updateStatus('Idle');

function ensureLatencyWatchdog() {
    if (latencyWatchdogTimer) {
        return;
    }
    latencyWatchdogTimer = setInterval(() => {
        if (!sessionId || !lastLatencyLabel || !lastLatencyUpdateTs) {
            return;
        }
        const stalledFor = Date.now() - lastLatencyUpdateTs;
        if (stalledFor >= STALL_THRESHOLD_MS) {
            const seconds = Math.max(1, Math.floor(stalledFor / 1000));
            renderLatencyStatus(`(stalled ${seconds}s)`);
        }
    }, STALL_WATCH_INTERVAL_MS);
}

function resetLatencyWatchdog() {
    lastLatencyLabel = '';
    lastLatencyUpdateTs = 0;
    if (latencyWatchdogTimer) {
        clearInterval(latencyWatchdogTimer);
        latencyWatchdogTimer = null;
    }
}

function renderLatencyStatus(suffix = '') {
    if (!lastLatencyLabel) {
        return;
    }
    const extra = suffix ? ` ${suffix}` : '';
    updateStatus(`Latency ${lastLatencyLabel}${extra}`);
}

function resolveWarningMessage(payload = {}) {
    if (payload.warning?.message) {
        return payload.warning.message;
    }
    if (payload.warning?.code) {
        return payload.warning.code;
    }
    if (payload.message) {
        return payload.message;
    }
    return 'Unknown warning';
}
