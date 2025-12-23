import { mergeText } from './mergeText.js';

const hasValue = (value) => typeof value === 'string' && value.length > 0;

export const resolveTranscriptText = (currentText, { delta, serverText }) => {
    const base = typeof currentText === 'string' ? currentText : '';
    if (hasValue(delta)) {
        return mergeText(base, delta, true);
    }
    if (hasValue(serverText)) {
        return serverText;
    }
    return base;
};

export const initialTranscriptText = ({ delta, serverText }) => {
    if (hasValue(serverText)) {
        return serverText;
    }
    if (hasValue(delta)) {
        return delta;
    }
    return '';
};

export const isTranscriptRollback = ({ previousText, nextText, isFinal, hasServerText }) => {
    if (isFinal) {
        return false;
    }
    if (!hasServerText) {
        return false;
    }
    if (!hasValue(previousText) || typeof nextText !== 'string') {
        return false;
    }
    if (nextText.length >= previousText.length) {
        return false;
    }
    return previousText.startsWith(nextText);
};
