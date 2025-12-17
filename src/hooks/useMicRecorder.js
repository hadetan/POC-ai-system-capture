import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_MIME = 'audio/webm;codecs=opus';
const MIC_SOURCE_NAME = 'mic';

const getElectronAPI = () => (typeof window !== 'undefined' ? window.electronAPI : null);

export function useMicRecorder({
    chunkTimeslice = 200,
    preferredMimeType,
    platform,
    sessionApi
}) {
    const [isMicRecording, setIsMicRecording] = useState(false);
    const [isMicStarting, setIsMicStarting] = useState(false);
    const [micStatus, setMicStatus] = useState('Mic muted');

    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const sessionIdRef = useRef(null);
    const chunkSequenceRef = useRef(0);
    const recordingMimeTypeRef = useRef(preferredMimeType || DEFAULT_MIME);

    const releaseStream = useCallback(() => {
        if (!mediaStreamRef.current) {
            return;
        }
        mediaStreamRef.current.getTracks().forEach((track) => {
            try {
                track.stop();
            } catch (_err) {
                // Ignore track stop failures
            }
        });
        mediaStreamRef.current = null;
    }, []);

    const stopMicRecording = useCallback(async () => {
        if (mediaRecorderRef.current) {
            try {
                mediaRecorderRef.current.stop();
            } catch (_error) {
                // Ignore stop errors
            }
            mediaRecorderRef.current = null;
        }
        releaseStream();
        chunkSequenceRef.current = 0;
        recordingMimeTypeRef.current = preferredMimeType || DEFAULT_MIME;
        const sessionId = sessionIdRef.current;
        sessionIdRef.current = null;
        const api = getElectronAPI();
        if (sessionId && api?.transcription?.stopSession) {
            try {
                await api.transcription.stopSession(sessionId);
            } catch (error) {
                console.warn('Failed to stop microphone transcription session', error);
            }
        }
        setIsMicStarting(false);
        setIsMicRecording(false);
        setMicStatus('Mic muted');
    }, [preferredMimeType, releaseStream]);

    const handleChunk = useCallback(async (event) => {
        if (!event?.data?.size) {
            return;
        }
        const sessionId = sessionIdRef.current;
        if (!sessionId) {
            return;
        }
        try {
            const sequence = chunkSequenceRef.current;
            chunkSequenceRef.current += 1;
            const arrayBuffer = await event.data.arrayBuffer();
            const captureTimestamp = Date.now();
            const api = getElectronAPI();
            api?.transcription?.sendChunk?.({
                sessionId,
                sequence,
                mimeType: recordingMimeTypeRef.current,
                data: arrayBuffer,
                timestamp: captureTimestamp,
                captureTimestamp
            });
        } catch (error) {
            console.error('Failed to dispatch microphone audio chunk', error);
        }
    }, []);

    const startMicRecording = useCallback(async () => {
        if (isMicRecording || isMicStarting) {
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setMicStatus('Microphone capture unsupported.');
            return;
        }
        setIsMicStarting(true);
        setMicStatus('Requesting microphone…');
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1
                },
                video: false
            });
        } catch (error) {
            console.error('Failed to obtain microphone stream', error);
            setMicStatus(`Mic unavailable: ${error?.message || 'Permission denied'}`);
            setIsMicStarting(false);
            return;
        }
        mediaStreamRef.current = stream;

        const api = getElectronAPI();
        if (typeof api?.transcription?.startSession !== 'function') {
            setMicStatus('Transcription unavailable for microphone.');
            setIsMicStarting(false);
            releaseStream();
            return;
        }

        const sourceLabel = stream.getAudioTracks?.()[0]?.label || MIC_SOURCE_NAME;
        try {
            const response = await api.transcription.startSession({
                sourceName: sourceLabel,
                sourceType: 'mic',
                platform,
                streamingConfig: {
                    ...(platform ? { platformHint: platform } : {}),
                    vad: { enabled: true }
                }
            });
            if (!response?.sessionId) {
                throw new Error('Missing microphone session id');
            }
            sessionIdRef.current = response.sessionId;
            sessionApi?.attachTranscriptionEvents?.();
        } catch (error) {
            console.error('Failed to start microphone transcription session', error);
            setMicStatus(`Mic session failed: ${error?.message || 'unknown error'}`);
            setIsMicStarting(false);
            releaseStream();
            return;
        }

        let recorder;
        const recorderOptions = preferredMimeType ? { mimeType: preferredMimeType } : undefined;
        try {
            recorder = recorderOptions ? new MediaRecorder(stream, recorderOptions) : new MediaRecorder(stream);
        } catch (error) {
            console.warn('Preferred microphone mime type failed, falling back to default', error);
            try {
                recorder = new MediaRecorder(stream);
            } catch (fallbackError) {
                console.error('Failed to create MediaRecorder for microphone', fallbackError);
                setMicStatus(`Recorder error: ${fallbackError?.message || 'Unknown error'}`);
                setIsMicStarting(false);
                await stopMicRecording();
                return;
            }
        }

        mediaRecorderRef.current = recorder;
        recordingMimeTypeRef.current = recorder?.mimeType || preferredMimeType || DEFAULT_MIME;
        recorder.addEventListener('dataavailable', handleChunk);
        recorder.addEventListener('stop', () => {
            releaseStream();
        });
        recorder.addEventListener('error', async (event) => {
            console.error('Microphone MediaRecorder error', event.error);
            setMicStatus(`Mic recorder error: ${event.error?.message || 'Unknown error'}`);
            await stopMicRecording();
        });
        chunkSequenceRef.current = 0;
        recorder.start(chunkTimeslice);
        setIsMicRecording(true);
        setIsMicStarting(false);
        setMicStatus('Mic live');
    }, [chunkTimeslice, handleChunk, isMicRecording, isMicStarting, platform, preferredMimeType, releaseStream, sessionApi, stopMicRecording]);

    useEffect(() => () => {
        stopMicRecording().catch(() => {});
    }, [stopMicRecording]);

    return {
        isMicRecording,
        isMicStarting,
        micStatus,
        startMicRecording,
        stopMicRecording
    };
}
