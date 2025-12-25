import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
const DEFAULT_STATUS = {
    microphone: { granted: false, status: 'unknown' },
    screenCapture: { granted: false, status: 'unknown' }
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
        screenCapture: permissionState.screenCapture || DEFAULT_STATUS.screenCapture
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
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId
                    }
                }
            });
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

    const hasAcknowledgedRef = useRef(false);
    const allPermissionsGranted = currentState.microphone.granted && currentState.screenCapture.granted;

    useEffect(() => {
        if (!allPermissionsGranted) {
            hasAcknowledgedRef.current = false;
            return;
        }
        if (hasAcknowledgedRef.current) {
            return;
        }
        hasAcknowledgedRef.current = true;
        acknowledgePermissions();
    }, [allPermissionsGranted, acknowledgePermissions]);

    const microphoneStatus = formatStatus(currentState.microphone);
    const screenStatus = formatStatus(currentState.screenCapture);

    return (
        <div className="permission-window">
            <header className="permission-window__header">
                <h1>Screen &amp; Microphone Access Required</h1>
                <p>
                    To record your screen with system audio and your microphone we need a couple of permissions.
                    Complete the steps below and we'll move ahead automatically once everything looks good.
                </p>
            </header>

            <section className="permission-step">
                <div className="permission-step__heading">
                    <h2>1. Screen &amp; System Audio</h2>
                    <span className={`permission-status ${screenStatus.granted ? 'granted' : 'pending'}`}>
                        {screenStatus.label}
                    </span>
                </div>
                <p>macOS asks for permission the first time screen capture runs. Click below to trigger the prompt so we can record the display and its playback audio.</p>
                {!screenStatus.granted ? (
                    <div className="permission-step__actions">
                        <button type="button" disabled={isBusy} onClick={attemptScreenCapture}>
                            Request Screen Recording Access
                        </button>
                    </div>
                ) : (
                    <p className="permission-step__granted">Screen recording permission granted. You're good to go.</p>
                )}
            </section>

            <section className="permission-step">
                <div className="permission-step__heading">
                    <h2>2. Microphone Access</h2>
                    <span className={`permission-status ${microphoneStatus.granted ? 'granted' : 'pending'}`}>
                        {microphoneStatus.label}
                    </span>
                </div>
                <p>We only use the microphone during recordings you initiate. This enables voice capture for transcripts and assistant replies.</p>
                {!microphoneStatus.granted ? (
                    <button type="button" disabled={isBusy} onClick={requestMicrophone}>
                        Request Microphone Access
                    </button>
                ) : (
                    <p className="permission-step__granted">Microphone permission granted. You're all set.</p>
                )}
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
        </div>
    );
}

export default PermissionWindow;
