import React, { useMemo } from 'react';
import CodeSnippet from './CodeSnippet';
import { parseFencedCode } from '../utils/parseFencedCode';
import { getAskAIPromptText } from '../utils/osDetection';
import './css/ChatBubble.css';

function ChatBubble({ text, side = 'left', isFinal = true, attachments = [], sourceType, sent = false }) {
    const bubbleSide = side === 'right' ? 'right' : 'left';
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const segments = useMemo(() => parseFencedCode(text || ''), [text]);
    const isMicSource = sourceType === 'mic';
    const bubbleClasses = [`chat-bubble`, bubbleSide];
    if (isMicSource) {
        bubbleClasses.push('chat-bubble-mic');
    }
    const shouldShowAttachmentHint = hasAttachments && bubbleSide === 'right' && sent !== true;

    const renderSegment = (segment, index) => {
        if (segment.type === 'code') {
            return (
                <CodeSnippet
                    key={`code-${index}`}
                    code={segment.code}
                    language={segment.language}
                />
            );
        }
        if (segment.type === 'error') {
            return (
                <span key={`error-${index}`} className="code-snippet-error">
                    {segment.text}
                </span>
            );
        }
        return (
            <span key={`text-${index}`} className="chat-bubble-text">
                {segment.text}
            </span>
        );
    };

    return (
        <div className={bubbleClasses.join(' ')} data-final={isFinal ? 'true' : 'false'}>
            {hasAttachments && (
                <div className="chat-bubble-attachments-container">
                    <div className="chat-bubble-attachments">
                        {attachments.map((att) => (
                            <img
                                key={att.id || att.name}
                                className="chat-bubble-attachment"
                                src={att.dataUrl || att.data}
                                alt={att.name || 'attachment'}
                            />
                        ))}
                    </div>
                    {shouldShowAttachmentHint && (
                        <div className="chat-bubble-attachment-hint">
                            {getAskAIPromptText()}
                        </div>
                    )}
                </div>
            )}
            <div className="chat-bubble-content">
                {segments.map((segment, index) => renderSegment(segment, index))}
            </div>
        </div>
    );
}

export default ChatBubble;
