import { useCallback, useEffect, useMemo, useState } from 'react';

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
const DEFAULT_STATUS = {
    microphone: { granted: false, status: 'unknown' },
    screenCapture: { granted: false, status: 'unknown' },
    systemAudio: { granted: false, status: 'unknown' }
};

const formatStatus = (entry) => {
    if (!entry) {
        return { label: 'Unknown', granted: false };
    }
    if (entry.granted) {
        return { label: 'Granted', granted: true };
    }
    const label = typeof entry.status === 'string' && entry.status
        ? entry.status.replace(/[-_]/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
        : 'Unknown';
    return { label, granted: false };
};

function PermissionWindow() {
    const [permissionState, setPermissionState] = useState(DEFAULT_STATUS);
    const [isBusy, setIsBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [infoMessage, setInfoMessage] = useState('');

    const currentState = useMemo(() => ({
        microphone: permissionState.microphone || DEFAULT_STATUS.microphone,
        screenCapture: permissionState.screenCapture || DEFAULT_STATUS.screenCapture,
        systemAudio: permissionState.systemAudio || DEFAULT_STATUS.systemAudio
    }), [permissionState]);

    const reloadPermissionState = useCallback(async () => {
        if (!electronAPI?.permissions?.check) {
            return;
        }
        try {
            const response = await electronAPI.permissions.check();
            if (!response?.ok) {
                setErrorMessage(response?.error || 'Failed to load permission status.');
                return;
            }
            if (response.state) {
                setPermissionState(response.state);
            }
        } catch (error) {
            setErrorMessage(error?.message || 'Failed to refresh permissions.');
        }
    }, []);

    const requestMicrophone = useCallback(async () => {
        if (!electronAPI?.permissions?.requestMicrophone) {
            return;
        }
        setIsBusy(true);
        setErrorMessage('');
        setInfoMessage('');
        try {
            const result = await electronAPI.permissions.requestMicrophone();
            if (!result?.ok) {
                setErrorMessage(result?.error || 'Unable to request microphone access.');
            } else if (!result.granted) {
                setInfoMessage('Microphone access was not granted. Please enable it in System Settings.');
            }
        } catch (error) {
            setErrorMessage(error?.message || 'Microphone request failed.');
        } finally {
            setIsBusy(false);
            await reloadPermissionState();
        }
    }, [reloadPermissionState]);

    const openScreenSettings = useCallback(async () => {
        if (!electronAPI?.permissions?.openSystemSettings) {
            return;
        }
        setErrorMessage('');
        try {
            const result = await electronAPI.permissions.openSystemSettings('screen-recording');
            if (!result?.ok && result?.error) {
                setErrorMessage(result.error);
            }
        } catch (error) {
            setErrorMessage(error?.message || 'Unable to open System Settings.');
        }
    }, []);

    const stopTracks = (stream) => {
        if (!stream) {
            return;
        }
        stream.getTracks().forEach((track) => {
            try {
                track.stop();
            } catch (_error) {
                // ignore track stop errors
            }
        });
    };

    const attemptScreenCapture = useCallback(async () => {
        if (!electronAPI?.getDesktopSources) {
            return;
        }
        setIsBusy(true);
        setErrorMessage('');
        setInfoMessage('');

        let stream;
        try {
            const sources = await electronAPI.getDesktopSources({
                types: ['screen'],
                thumbnailSize: { width: 1280, height: 720 }
            });
            if (!Array.isArray(sources) || sources.length === 0 || !sources[0]?.id) {
                throw new Error('No screen source available for capture.');
            }
            const sourceId = sources[0].id;
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId
                    }
                }
            });
            const audioTracks = stream.getAudioTracks();
            const hasAudio = audioTracks.some((track) => track.readyState === 'live');
            if (electronAPI?.permissions?.storeSystemAudio) {
                await electronAPI.permissions.storeSystemAudio({
                    granted: hasAudio,
                    status: hasAudio ? 'ready' : 'missing-audio-track'
                });
            }
            if (!hasAudio) {
                setInfoMessage('System audio track was not detected. Please ensure a loopback driver such as BlackHole is installed.');
            }
        } catch (error) {
            const message = error?.message || 'Screen capture failed.';
            setErrorMessage(message);
        } finally {
            stopTracks(stream);
            setIsBusy(false);
            await reloadPermissionState();
        }
    }, [reloadPermissionState]);

    const acknowledgePermissions = useCallback(async () => {
        if (!electronAPI?.permissions?.acknowledge) {
            return;
        }
        setErrorMessage('');
        try {
            const result = await electronAPI.permissions.acknowledge();
            if (!result?.ok && result?.error) {
                setErrorMessage(result.error);
            }
            if (!result?.needsAttention && result?.state) {
                setPermissionState(result.state);
            }
        } catch (error) {
            setErrorMessage(error?.message || 'Failed to notify main process.');
        }
    }, []);

    useEffect(() => {
        reloadPermissionState();
        const unsubscribe = electronAPI?.permissions?.onUpdate?.((nextState) => {
            if (nextState) {
                setPermissionState(nextState);
            }
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [reloadPermissionState]);

    const microphoneStatus = formatStatus(currentState.microphone);
    const screenStatus = formatStatus(currentState.screenCapture);
    const systemAudioStatus = formatStatus(currentState.systemAudio);

    return (
        <div className="permission-window">
            <header className="permission-window__header">
                <h1>Screen &amp; Microphone Access Required</h1>
                <p>
                    To record your screen and audio we need permission to capture the screen, system audio, and microphone.
                    Complete the steps below to continue.
                </p>
            </header>

            <section className="permission-step">
                <div className="permission-step__heading">
                    <h2>1. Microphone Access</h2>
                    <span className={`permission-status ${microphoneStatus.granted ? 'granted' : 'pending'}`}>
                        {microphoneStatus.label}
                    </span>
                </div>
                <p>We only use the microphone during recordings you initiate. This enables voice capture for transcripts and assistant replies.</p>
                <button type="button" disabled={isBusy} onClick={requestMicrophone}>
                    Request Microphone Access
                </button>
            </section>

            <section className="permission-step">
                <div className="permission-step__heading">
                    <h2>2. Screen Recording</h2>
                    <span className={`permission-status ${screenStatus.granted ? 'granted' : 'pending'}`}>
                        {screenStatus.label}
                    </span>
                </div>
                <p>macOS asks for permission the first time screen capture runs. Click below to trigger the prompt and allow access.</p>
                <div className="permission-step__actions">
                    <button type="button" disabled={isBusy} onClick={attemptScreenCapture}>
                        Try Screen Capture (Triggers Prompt)
                    </button>
                    <button type="button" disabled={isBusy} onClick={openScreenSettings}>
                        Open System Settings (Screen Recording)
                    </button>
                </div>
            </section>

            <section className="permission-step">
                <div className="permission-step__heading">
                    <h2>3. System Audio</h2>
                    <span className={`permission-status ${systemAudioStatus.granted ? 'granted' : 'pending'}`}>
                        {systemAudioStatus.label}
                    </span>
                </div>
                <p>
                    System audio requires an audio loopback driver such as BlackHole. After installing, run the screen capture check to verify an audio track is present.
                </p>
                <a
                    href="https://existential.audio/blackhole/"
                    target="_blank"
                    rel="noreferrer"
                    className="permission-link"
                >
                    Install BlackHole (free)
                </a>
            </section>

            {errorMessage && (
                <div className="permission-alert permission-alert--error">
                    {errorMessage}
                </div>
            )}

            {infoMessage && (
                <div className="permission-alert permission-alert--info">
                    {infoMessage}
                </div>
            )}

            <footer className="permission-window__footer">
                <button type="button" disabled={isBusy} onClick={reloadPermissionState}>
                    I enabled permissions — Re-check
                </button>
                <button
                    type="button"
                    disabled={isBusy || !currentState.microphone.granted || !currentState.screenCapture.granted}
                    onClick={acknowledgePermissions}
                >
                    Continue
                </button>
            </footer>
        </div>
    );
}

export default PermissionWindow;
