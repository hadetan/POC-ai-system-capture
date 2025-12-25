/**
 * Centralized OS detection utility
 * Can be used in React components and other parts of the application
 */

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;

/**
 * Gets the current platform
 * Returns 'darwin' for macOS, 'win32' for Windows, 'linux' for Linux, or 'unknown'
 */
export function getPlatform() {
    if (typeof electronAPI?.getPlatform === 'function') {
        return electronAPI.getPlatform();
    }
    return 'unknown';
}

/**
 * Checks if the current OS is macOS
 */
export function isMacOS() {
    return getPlatform() === 'darwin';
}

/**
 * Checks if the current OS is Windows
 */
export function isWindows() {
    return getPlatform() === 'win32';
}

/**
 * Checks if the current OS is Linux
 */
export function isLinux() {
    return getPlatform() === 'linux';
}

/**
 * Gets the keyboard shortcut text for the current OS using the correct modifier label
 */
export function getPrimaryModifierKey() {
    return isMacOS() ? 'Cmd' : 'Ctrl';
}

export function getAltModifierKey() {
    return isMacOS() ? 'Option' : 'Alt';
}

export function formatShortcutKeyLabel(key) {
    if (!key) {
        return key;
    }
    const normalized = String(key).toLowerCase();
    if (normalized === 'ctrl' || normalized === 'cmd' || normalized === 'cmdorctrl') {
        return getPrimaryModifierKey();
    }
    if (normalized === 'alt' || normalized === 'option') {
        return getAltModifierKey();
    }
    return key;
}

export function getKeyboardShortcutText() {
    return `${getPrimaryModifierKey()}+Enter`;
}

/**
 * Gets the "Ask AI" prompt text with the appropriate keyboard shortcut for the current OS
 */
export function getAskAIPromptText() {
    return `${getKeyboardShortcutText()} to ask AI`;
}
