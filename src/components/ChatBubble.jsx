import React from 'react';

function ChatBubble({ text, side = 'left', isFinal = true, attachments = [] }) {
    const bubbleSide = side === 'right' ? 'right' : 'left';
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    return (
        <div className={`chat-bubble ${bubbleSide}`} data-final={isFinal ? 'true' : 'false'}>
            {hasAttachments && (
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
            )}
            {text || ''}
        </div>
    );
}

export default ChatBubble;
