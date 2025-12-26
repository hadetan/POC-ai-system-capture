import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;

const defaultStatus = {
    platform: 'unknown',
    allGranted: false,
    missing: ['microphone', 'screen'],
    checks: {
        microphone: { status: 'unknown', granted: false },
        screen: { status: 'unknown', granted: false }
    }
};

const formatStatusLabel = (entry) => {
    const raw = entry?.status || 'unknown';
    if (entry?.granted) {
        return raw === 'granted' ? 'Granted' : `Granted (${raw})`;
    }
    if (raw === 'not-determined') {
        return 'Not requested yet';
    }
    if (raw === 'denied') {
        return 'Denied';
    }
    return raw.replace(/\b\w/g, (char) => char.toUpperCase());
};

const shouldRequestPermission = (status, key) => {
    const entry = status?.checks?.[key];
    return !entry?.granted;
};

const stopTracks = (stream) => {
    stream?.getTracks?.().forEach((track) => {
        try {
            track.stop();
        } catch (_error) {
            // ignore track stop issues
        }
    });
};

const requestMicrophoneAccess = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone APIs are unavailable in this environment.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stopTracks(stream);
};

const requestScreenCaptureAccess = async () => {
    if (!electronAPI?.getDesktopSources) {
        throw new Error('Screen capture helpers are unavailable.');
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Screen capture APIs are unavailable in this environment.');
    }
    const sources = await electronAPI.getDesktopSources({
        types: ['screen'],
        fetchWindowIcons: false,
        thumbnailSize: { width: 16, height: 16 }
    });
    const source = Array.isArray(sources) && sources.length ? sources[0] : null;
    if (!source?.id) {
        throw new Error('No screen source available to request permission.');
    }
    const constraints = {
        audio: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id
        },
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id
            }
        }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stopTracks(stream);
};

export default function PermissionWindow() {
    const [status, setStatus] = useState(defaultStatus);
    const [isLoading, setIsLoading] = useState(true);
    const [isRequesting, setIsRequesting] = useState(false);
    const [lastError, setLastError] = useState('');
    const acknowledgeLockRef = useRef(false);

    const updateStatus = useCallback((nextStatus) => {
        if (!nextStatus) {
            return;
        }
        setStatus(nextStatus);
        if (nextStatus.allGranted) {
            if (!acknowledgeLockRef.current) {
                acknowledgeLockRef.current = true;
                electronAPI?.permissions?.acknowledge?.().catch(() => {
                    acknowledgeLockRef.current = false;
                });
            }
        } else {
            acknowledgeLockRef.current = false;
        }
    }, []);

    useEffect(() => {
        const unsubscribe = electronAPI?.permissions?.onStatus?.((nextStatus) => {
            updateStatus(nextStatus);
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [updateStatus]);

    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            try {
                const nextStatus = await electronAPI?.permissions?.getStatus?.();
                if (!cancelled && nextStatus) {
                    updateStatus(nextStatus);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        bootstrap();
        return () => {
            cancelled = true;
        };
    }, [updateStatus]);

    const missingPermissions = useMemo(() => status?.missing || [], [status]);
    const hasMissing = missingPermissions.length > 0;
    const shouldRequestMic = shouldRequestPermission(status, 'microphone');
    const shouldRequestScreen = shouldRequestPermission(status, 'screen');

    // const refreshStatus = useCallback(async () => {
    //     const nextStatus = await electronAPI?.permissions?.refreshStatus?.();
    //     if (nextStatus) {
    //         updateStatus(nextStatus);
    //     }
    //     return nextStatus;
    // }, [updateStatus]);

    const handleRequest = useCallback(async () => {
        setIsRequesting(true);
        setLastError('');
        try {
            const errors = [];
            if (shouldRequestMic) {
                try {
                    await requestMicrophoneAccess();
                } catch (error) {
                    errors.push(error?.message || 'Microphone permission request failed.');
                }
            }
            if (shouldRequestScreen) {
                try {
                    await requestScreenCaptureAccess();
                } catch (error) {
                    errors.push(error?.message || 'Screen capture permission request failed.');
                }
            }
            if (errors.length) {
                setLastError(errors.join(' '));
            }
        } finally {
            await refreshStatus();
            setIsRequesting(false);
        }
    }, [refreshStatus, shouldRequestMic, shouldRequestScreen]);

    const statusList = useMemo(() => ([
        {
            key: 'microphone',
            title: 'Microphone Access',
            rationale: 'Microphone will be used only when you toggle it, so it will not listen to you on session starts. This will be used to write your conversation with interviewer and when sent to assistant, AI will have a better context to answer questions.',
            entry: status?.checks?.microphone
        },
        {
            key: 'screen',
            title: 'Screen Recording + System Audio',
            rationale: 'Screen will be captured so you can capture a silent screenshot(s) of coding problem and send to AI to return the solved answer.',
            entry: status?.checks?.screen
        },
        // {
        //     key: 'audio',
        //     title: 'System Audio',
        //     rationale: 'System audio will be captured so it can transcribe the interview asked questions and can be sent to AI for answers.',
        //     entry: status?.checks?.screen
        // }
    ]), [status]);

    return (
        <div className="permissions-window" role="presentation">
            <header className="permissions-header">
                <p className="permissions-kicker">macOS Permissions Required</p>
                <h1>Let&apos;s finish setting things up</h1>
                <p className="permissions-intro">
                    We require these permissions in order to capture your system screen, system audio and mic and send to the assistant A.I. for interview answer.
                </p>
            </header>

            <div className="permissions-body">
                {isLoading ? (
                    <div className="permissions-status-card loading">Checking current permission state…</div>
                ) : (
                    statusList.map(({ key, title, rationale, entry }) => (
                        <article key={key} className="permissions-status-card">
                            <div className="permissions-card-header">
                                <h2>{title}</h2>
                                <span className={`permissions-badge${entry?.granted ? ' granted' : ' missing'}`}>
                                    {formatStatusLabel(entry)}
                                </span>
                            </div>
                            <p className="permissions-rationale">{rationale}</p>
                        </article>
                    ))
                )}
            </div>

            {lastError ? (
                <div className="permissions-alert error" role="alert">
                    {lastError}
                </div>
            ) : null}

            {!hasMissing && !isLoading ? (
                <div className="permissions-alert success">All required permissions are granted. The overlays will open momentarily.</div>
            ) : null}

            <footer className="permissions-actions">
                <button
                    type="button"
                    className="primary"
                    onClick={handleRequest}
                    disabled={isRequesting || !hasMissing}
                    aria-label={
                        isRequesting
                            ? 'Requesting microphone and screen recording permissions'
                            : 'Request microphone and screen recording permissions'
                    }
                >
                    {isRequesting ? 'Requesting…' : 'Request Permissions'}
                </button>
                {/* <button
                    type="button"
                    className="secondary"
                    onClick={refreshStatus}
                    disabled={isRequesting}
                >
                    Refresh Status
                </button> */}
            </footer>

            <p className="permissions-footnote">
                If you granted access in macOS System Settings, click "Refresh Status" to update the permissions shown here.
            </p>
        </div>
    );
}
