import { useCallback, useEffect, useRef, useState } from 'react';

export function useTranscriptScroll({ messages, autoScroll = true }) {
    const transcriptRef = useRef(null);
    const animationFrameRef = useRef(null);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const cancelScrollAnimation = useCallback(() => {
        if (animationFrameRef.current) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    const animateScrollTo = useCallback((targetTop) => {
        const el = transcriptRef.current;
        if (!el) {
            return;
        }

        cancelScrollAnimation();

        const startTop = el.scrollTop;
        const distance = targetTop - startTop;
        if (distance === 0) {
            setIsAtBottom(targetTop >= Math.max(0, el.scrollHeight - el.clientHeight) - 2);
            return;
        }

        const durationMs = 150;
        const startTime = performance.now();

        const step = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            el.scrollTop = startTop + distance * easeOut;

            if (progress < 1) {
                animationFrameRef.current = window.requestAnimationFrame(step);
            } else {
                animationFrameRef.current = null;
                const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
                const atBottom = el.scrollTop >= maxScrollTop - 2;
                setIsAtBottom(atBottom);
            }
        };

        animationFrameRef.current = window.requestAnimationFrame(step);
    }, [cancelScrollAnimation]);

    const scrollToBottom = useCallback(() => {
        const el = transcriptRef.current;
        if (!el) {
            return;
        }
        const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTo({ top: maxScrollTop, behavior: 'auto' });
    }, []);

    const scrollBy = useCallback((delta) => {
        const el = transcriptRef.current;
        if (!el) {
            return;
        }
        const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
        const nextTop = Math.min(maxScrollTop, Math.max(0, el.scrollTop + delta));
        animateScrollTo(nextTop);
        const atBottom = nextTop >= maxScrollTop - 2;
        setIsAtBottom(atBottom);
    }, [animateScrollTo]);

    const resetScroll = useCallback(() => {
        const el = transcriptRef.current;
        if (!el) {
            return;
        }
        cancelScrollAnimation();
        el.scrollTop = 0;
        setIsAtBottom(true);
    }, [cancelScrollAnimation]);

    useEffect(() => {
        const el = transcriptRef.current;
        if (!el) {
            return () => {};
        }
        const handleScroll = () => {
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
            setIsAtBottom(atBottom);
        };
        handleScroll();
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', handleScroll);
        };
    }, [transcriptRef]);

    useEffect(() => {
        if (!autoScroll || !isAtBottom) {
            return;
        }
        const id = window.requestAnimationFrame(scrollToBottom);
        return () => window.cancelAnimationFrame(id);
    }, [autoScroll, isAtBottom, messages, scrollToBottom]);

    useEffect(() => () => cancelScrollAnimation(), [cancelScrollAnimation]);

    return {
        transcriptRef,
        isAtBottom,
        scrollBy,
        resetScroll,
        scrollToBottom,
        setIsAtBottom
    };
}
