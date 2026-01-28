import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import indexedDBService from '../services/indexedDBService';
import postgresService from '../services/postgresService';
import '../styles/MessageInput.css';

function MessageInput({ channel, userId, onSendMessage, isConnected }) {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const { settings, addMessage, replyingTo, clearReplyingTo } = useChat();

  // Focus input when replying
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const handleSendMessage = async () => {
    if (!message.trim() || !isConnected || !userId) {
      return;
    }

    const isDirectMessage = channel.startsWith('dm_');
    const recipientId = isDirectMessage ? channel.replace('dm_', '') : null;
    const msgType = isDirectMessage ? 'chat:private' : 'chat:group';
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageContent = message;

    const msg = {
      type: msgType,
      sender: userId,
      payload: {
        content: messageContent,
        ...(replyingTo && {
          replyTo: {
            id: replyingTo.id,
            sender: replyingTo.sender,
            content: replyingTo.content,
          }
        })
      },
      timestamp: Date.now(),
      id: messageId,
    };

    if (isDirectMessage) {
      msg.recipient = recipientId;
    } else {
      msg.channel = channel;
    }

    try {
      const messageData = {
        id: messageId,
        sender: userId,
        channel: channel,
        content: messageContent,
        timestamp: Date.now(),
        type: msgType,
        recipient: isDirectMessage ? recipientId : undefined,
        replyTo: replyingTo ? {
          id: replyingTo.id,
          sender: replyingTo.sender,
          content: replyingTo.content,
        } : undefined,
      };

      await indexedDBService.saveMessageToIndexedDB(messageData);

      addMessage(channel, {
        id: messageId,
        sender: userId,
        content: messageContent,
        timestamp: Date.now(),
        type: 'message',
        replyTo: replyingTo ? {
          id: replyingTo.id,
          sender: replyingTo.sender,
          content: replyingTo.content,
        } : undefined,
      });

      postgresService.saveMessageToPostgres(messageData)
        .catch(err => console.error('Error saving to PostgreSQL:', err));
    } catch (error) {
      console.error('Error saving message:', error);
    }

    onSendMessage(msg);
    setMessage('');
    setIsTyping(false);
    if (replyingTo) {
      clearReplyingTo();
    }
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);

    if (!isTyping && settings.showTypingIndicators) {
      setIsTyping(true);
      const isDirectMessage = channel.startsWith('dm_');
      onSendMessage({
        type: 'system:typing',
        sender: userId,
        channel: isDirectMessage ? undefined : channel,
        recipient: isDirectMessage ? channel.replace('dm_', '') : undefined,
        payload: { typing: true },
        timestamp: Date.now(),
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      const isDirectMessage = channel.startsWith('dm_');
      onSendMessage({
        type: 'system:typing',
        sender: userId,
        channel: isDirectMessage ? undefined : channel,
        recipient: isDirectMessage ? channel.replace('dm_', '') : undefined,
        payload: { typing: false },
        timestamp: Date.now(),
      });
    }, 3000);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="message-input">
      {/* Reply Preview */}
      {replyingTo && (
        <div className="reply-preview">
          <div className="reply-preview-content">
            <span className="reply-preview-icon">↩</span>
            <span className="reply-preview-label">Replying to</span>
            <span className="reply-preview-sender">{replyingTo.sender}</span>
            <span className="reply-preview-text">
              {replyingTo.content?.substring(0, 60)}{replyingTo.content?.length > 60 ? '...' : ''}
            </span>
          </div>
          <button className="reply-cancel-btn" onClick={clearReplyingTo} title="Cancel reply">
            ✕
          </button>
        </div>
      )}

      <div className="input-wrapper">
        <textarea
          ref={inputRef}
          value={message}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={replyingTo ? `Reply to ${replyingTo.sender}...` : (isConnected ? 'Type a message...' : 'Connecting...')}
          disabled={!isConnected}
          rows="1"
          className="input-field"
        />
        <button
          onClick={handleSendMessage}
          disabled={!isConnected || !message.trim()}
          className="send-button"
          title="Send message (Enter)"
        >
          Send
        </button>
      </div>
      {!isConnected && (
        <div className="connection-warning">
          ⚠️ Not connected to server
        </div>
      )}
    </div>
  );
}

export default MessageInput;
