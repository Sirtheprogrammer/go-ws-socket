import React, { useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/MessageList.css';

function MessageList({ messages, userId, onDeleteMessage }) {
  const messagesEndRef = useRef(null);
  const { addNotification, setReplyingTo, currentChannel } = useChat();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleDelete = (messageId) => {
    onDeleteMessage(messageId);
    addNotification({
      type: 'success',
      title: 'Message Deleted',
      message: 'Your message has been removed',
      duration: 3000,
    });
  };

  const handleReply = (msg) => {
    setReplyingTo({
      id: msg.id,
      sender: msg.sender,
      content: msg.content,
      channel: currentChannel,
    });
  };

  // Find original message for replies
  const findOriginalMessage = (replyToId) => {
    return messages.find(m => m.id === replyToId);
  };

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="empty-state">
          <p>No messages yet</p>
          <span>Start a conversation!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((msg) => {
        const isOwn = msg.sender === userId;
        const isGroupChat = !currentChannel?.startsWith('dm_');
        const replyToMessage = msg.replyTo ? findOriginalMessage(msg.replyTo.id) : null;

        return (
          <div key={msg.id} className={`message-group ${isOwn ? 'own' : ''}`}>
            <div className="message-avatar">
              {msg.sender.substring(0, 2).toUpperCase()}
            </div>
            <div className="message-content">
              {!isOwn && <div className="message-sender">{msg.sender}</div>}

              <div className={`message-bubble ${isOwn ? 'own' : ''}`}>
                {/* Reply Context - WhatsApp style inside bubble */}
                {msg.replyTo && (
                  <div className="reply-context">
                    <span className="reply-sender">{msg.replyTo.sender}</span>
                    <span className="reply-preview">{msg.replyTo.content?.substring(0, 60)}{msg.replyTo.content?.length > 60 ? '...' : ''}</span>
                  </div>
                )}

                <div className="message-text">{msg.content}</div>

                {/* Action Buttons */}
                <div className="message-actions">
                  {isGroupChat && (
                    <button
                      className="message-action-btn reply-btn"
                      onClick={() => handleReply(msg)}
                      title="Reply"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 17 4 12 9 7"></polyline>
                        <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                      </svg>
                    </button>
                  )}
                  {isOwn && (
                    <button
                      className="message-action-btn delete-btn"
                      onClick={() => handleDelete(msg.id)}
                      title="Delete message"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageList;
