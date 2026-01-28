import React, { useEffect, useRef } from 'react';
import '../styles/MessageList.css';

function MessageList({ messages, userId }) {
  const messagesEndRef = useRef(null);

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
        return (
          <div key={msg.id} className={`message-group ${isOwn ? 'own' : ''}`}>
            <div className="message-avatar">
              {msg.sender.substring(0, 2).toUpperCase()}
            </div>
            <div className="message-content">
              {!isOwn && <div className="message-sender">{msg.sender}</div>}
              <div className={`message-bubble ${isOwn ? 'own' : ''}`}>
                {msg.content}
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
