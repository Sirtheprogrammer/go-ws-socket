import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import UserList from './UserList';
import TypingIndicator from './TypingIndicator';
import '../styles/ChatWindow.css';

function ChatWindow({ onSendMessage }) {
  const {
    userId,
    currentChannel,
    messages,
    activeUsers,
    isConnected,
    typingUsers,
  } = useChat();

  const [showUserList, setShowUserList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const channelMessages = messages[currentChannel] || [];
  const isDirectMessage = currentChannel.startsWith('dm_');
  const displayName = isDirectMessage
    ? `@${currentChannel.replace('dm_', '')}`
    : `#${currentChannel}`;

  const filteredMessages = searchQuery
    ? channelMessages.filter((msg) =>
        msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : channelMessages;

  return (
    <div className="chat-window">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="header-left">
          <div className="channel-info">
            <span className="channel-badge">
              {isDirectMessage ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"></path>
                </svg>
              )}
            </span>
            <div className="channel-details">
              <h2>{displayName}</h2>
              {!isDirectMessage && activeUsers.length > 0 && (
                <span className="user-count">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'middle' }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} online
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              aria-label="Search messages"
            />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          {!isDirectMessage && (
            <button
              className={`header-action-btn ${showUserList ? 'active' : ''}`}
              onClick={() => setShowUserList(!showUserList)}
              title="Show online users"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span className="user-badge">{activeUsers.length}</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Container */}
      <div className="chat-content">
        {channelMessages.length === 0 && !searchQuery ? (
          <div className="empty-chat">
            <div className="empty-icon">
              {isDirectMessage ? (
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              ) : (
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14h8M10 10h4M8 10h.01M14 10h.01"></path>
                </svg>
              )}
            </div>
            <h3>No messages yet</h3>
            <p>Start a {isDirectMessage ? 'conversation' : 'discussion'}!</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <h3>No results found</h3>
            <p>Try different search terms</p>
          </div>
        ) : (
          <MessageList messages={filteredMessages} userId={userId} />
        )}
      </div>

      {/* Typing Indicator */}
      {typingUsers && typingUsers.size > 0 && (
        <div style={{ padding: '0 1rem 0.5rem 1rem' }}>
          <TypingIndicator typingUsers={typingUsers} />
        </div>
      )}

      {/* Message Input */}
      <MessageInput
        channel={currentChannel}
        userId={userId}
        onSendMessage={onSendMessage}
        isConnected={isConnected}
      />

      {/* User List Sidebar */}
      {showUserList && !isDirectMessage && (
        <UserList users={activeUsers} onClose={() => setShowUserList(false)} />
      )}
    </div>
  );
}

export default ChatWindow;
