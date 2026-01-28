import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import indexedDBService from '../services/indexedDBService';
import postgresService from '../services/postgresService';
import '../styles/MessageInput.css';

function MessageInput({ channel, userId, onSendMessage, isConnected }) {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const { settings, addMessage } = useChat();

  const handleSendMessage = async () => {
    if (!message.trim() || !isConnected || !userId) {
      return;
    }

    const msgType = channel.startsWith('dm_')
      ? 'chat:private'
      : 'chat:group';

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageContent = message;

    const msg = {
      type: msgType,
      sender: userId,
      channel: channel.startsWith('dm_') ? undefined : channel,
      recipient: channel.startsWith('dm_') ? channel.replace('dm_', '') : undefined,
      payload: { content: messageContent },
      timestamp: Date.now(),
      id: messageId,
    };

    // Save to IndexedDB immediately (local cache)
    try {
      await indexedDBService.saveMessageToIndexedDB({
        id: messageId,
        sender: userId,
        channel: channel.startsWith('dm_') ? channel : channel,
        content: messageContent,
        timestamp: Date.now(),
        type: msgType,
        recipient: channel.startsWith('dm_') ? channel.replace('dm_', '') : undefined,
      });
      
      // Also add to local state immediately
      addMessage(channel, {
        id: messageId,
        sender: userId,
        content: messageContent,
        timestamp: Date.now(),
        type: 'message',
      });

      // Save to PostgreSQL (async, don't block UI)
      postgresService.saveMessageToPostgres({
        id: messageId,
        sender: userId,
        channel: channel.startsWith('dm_') ? channel : channel,
        content: messageContent,
        timestamp: Date.now(),
        type: msgType,
        recipient: channel.startsWith('dm_') ? channel.replace('dm_', '') : undefined,
      }).catch(err => console.error('Error saving to PostgreSQL:', err));
    } catch (error) {
      console.error('Error saving message to IndexedDB:', error);
    }

    // Send via WebSocket
    onSendMessage(msg);
    setMessage('');
    setIsTyping(false);
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);

    if (!isTyping && settings.showTypingIndicators) {
      setIsTyping(true);
      onSendMessage({
        type: 'system:typing',
        sender: userId,
        channel,
        payload: { typing: true },
        timestamp: Date.now(),
      });
    }

    // Reset typing indicator after 3 seconds
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      onSendMessage({
        type: 'system:typing',
        sender: userId,
        channel,
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
      <div className="input-wrapper">
        <textarea
          value={message}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={isConnected ? 'Type a message...' : 'Connecting...'}
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
