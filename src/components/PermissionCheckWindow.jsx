import { useEffect, useMemo, useState } from 'react';

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
const DEFAULT_STATE = {
    microphone: { status: 'unknown', granted: false },
    screenCapture: { status: 'unknown', granted: false },
    systemAudio: { status: 'unknown', granted: false }
};

const formatLabel = (entry) => {
    if (!entry) {
        return 'Unknown';
    }
    if (entry.granted) {
        return 'Granted';
    }
    const status = typeof entry.status === 'string' && entry.status
        ? entry.status
        : 'Pending';
    return status.replace(/[-_]/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
};

function PermissionCheckWindow() {
    const [state, setState] = useState(DEFAULT_STATE);

    useEffect(() => {
        const unsubscribe = electronAPI?.permissions?.onUpdate?.((nextState) => {
            if (nextState) {
                setState({
                    microphone: nextState.microphone || DEFAULT_STATE.microphone,
                    screenCapture: nextState.screenCapture || DEFAULT_STATE.screenCapture,
                    systemAudio: nextState.systemAudio || DEFAULT_STATE.systemAudio
                });
            }
        });
        electronAPI?.permissions?.check?.();
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    const items = useMemo(() => ([
        { label: 'Microphone', entry: state.microphone },
        { label: 'Screen Recording', entry: state.screenCapture },
        { label: 'System Audio', entry: state.systemAudio }
    ]), [state]);

    return (
        <div className="permission-check">
            <h1>Preparing Recorder…</h1>
            <p>We are checking your macOS permissions. This will only take a moment.</p>
            <ul>
                {items.map((item) => (
                    <li key={item.label} className={item.entry?.granted ? 'granted' : 'pending'}>
                        <span>{item.label}</span>
                        <strong>{formatLabel(item.entry)}</strong>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default PermissionCheckWindow;
