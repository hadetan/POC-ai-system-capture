import { Suspense, lazy, useEffect, useMemo } from 'react';
import './App.css';

// Lazy-load window components to keep the initial bundle size under the chunk warning threshold.
const TranscriptWindowEntry = lazy(() => import('./windows/TranscriptWindowEntry'));
const SettingsWindow = lazy(() => import('./components/SettingsWindow'));
const PermissionWindow = lazy(() => import('./components/PermissionWindow'));
const TranscriptPreviewWindow = lazy(() => import('./components/TranscriptPreviewWindow'));
const AuthWindow = lazy(() => import('./components/AuthWindow'));

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
const DEFAULT_MIME = 'audio/webm;codecs=opus';
const WINDOW_VARIANTS = {
    TRANSCRIPT: 'transcript',
    SETTINGS: 'settings',
    PERMISSIONS: 'permissions',
    TRANSCRIPT_PREVIEW: 'transcript-preview',
    AUTH: 'auth'
};

const resolvePreferredMimeType = () => {
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
        return DEFAULT_MIME;
    }
    if (typeof window.MediaRecorder.isTypeSupported !== 'function') {
        return DEFAULT_MIME;
    }
    const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
    return candidates.find((candidate) => {
        try {
            return window.MediaRecorder.isTypeSupported(candidate);
        } catch (_error) {
            return false;
        }
    }) || DEFAULT_MIME;
};

const resolveWindowVariant = () => {
    if (typeof window === 'undefined') {
        return WINDOW_VARIANTS.TRANSCRIPT;
    }
    const params = new URLSearchParams(window.location.search || '');
    return params.get('window') || WINDOW_VARIANTS.TRANSCRIPT;
};

const preferredMimeType = resolvePreferredMimeType();

function App() {
    const windowVariant = useMemo(() => resolveWindowVariant(), []);
    const isSettingsWindow = windowVariant === WINDOW_VARIANTS.SETTINGS;
    const isPermissionWindow = windowVariant === WINDOW_VARIANTS.PERMISSIONS;
    const isTranscriptPreviewWindow = windowVariant === WINDOW_VARIANTS.TRANSCRIPT_PREVIEW;
    const isAuthWindow = windowVariant === WINDOW_VARIANTS.AUTH;

    const overlayMovementHandledGlobally = useMemo(() => {
        if (typeof electronAPI?.overlay?.movementHandledGlobally === 'boolean') {
            return electronAPI.overlay.movementHandledGlobally;
        }
        return false;
    }, []);

    const chunkTimeslice = useMemo(() => {
        if (typeof electronAPI?.getChunkTimesliceMs === 'function') {
            return Number(electronAPI.getChunkTimesliceMs());
        }
        return 200;
    }, []);

    const platform = useMemo(() => {
        if (typeof electronAPI?.getPlatform === 'function') {
            return electronAPI.getPlatform();
        }
        return 'unknown';
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return () => {};
        }
        document.body.dataset.windowMode = windowVariant;
        return () => {
            if (document.body.dataset.windowMode === windowVariant) {
                delete document.body.dataset.windowMode;
            }
        };
    }, [windowVariant]);

    useEffect(() => {
        if (overlayMovementHandledGlobally) {
            return () => {};
        }
        const handler = (event) => {
            const hasModifier = event.ctrlKey || event.metaKey;
            if (!hasModifier) {
                return;
            }
            const directionMap = {
                ArrowLeft: 'left',
                ArrowRight: 'right',
                ArrowUp: 'up',
                ArrowDown: 'down'
            };
            const direction = directionMap[event.key];
            if (!direction) {
                return;
            }
            event.preventDefault();
            try {
                electronAPI?.overlay?.moveDirection?.(direction);
            } catch (_error) {
                // ignore overlay move failures
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [overlayMovementHandledGlobally]);

    return (
        <Suspense fallback={null}>
            {isSettingsWindow && <SettingsWindow />}
            {isPermissionWindow && <PermissionWindow />}
            {isTranscriptPreviewWindow && <TranscriptPreviewWindow />}
            {isAuthWindow && <AuthWindow />}
            {!isSettingsWindow && !isPermissionWindow && !isTranscriptPreviewWindow && !isAuthWindow && (
                <TranscriptWindowEntry
                    chunkTimeslice={chunkTimeslice}
                    preferredMimeType={preferredMimeType}
                    platform={platform}
                />
            )}
        </Suspense>
    );
}

export default App;
