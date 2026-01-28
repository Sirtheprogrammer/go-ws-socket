import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/Sidebar.css';

function Sidebar({ isOpen, onToggle, onSendMessage }) {
  const {
    userId,
    channels,
    currentChannel,
    setCurrentChannel,
    dmUsers,
    addDmUser,
    toggleTheme,
    isDarkTheme,
    isConnected,
  } = useChat();

  const [showNewDM, setShowNewDM] = useState(false);
  const [dmInput, setDmInput] = useState('');

  const handleAddDM = () => {
    if (dmInput.trim()) {
      addDmUser(dmInput.trim());
      setDmInput('');
      setShowNewDM(false);
    }
  };

  const handleChannelClick = (channel) => {
    setCurrentChannel(channel);
    
    // Send join message
    if (userId) {
      onSendMessage({
        type: 'system:presence',
        sender: userId,
        channel,
        payload: { action: 'join' },
        timestamp: Date.now(),
      });
    }
  };

  return (
    <>
      <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="header-content">
            <button
              className="sidebar-toggle-btn"
              onClick={onToggle}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="sidebar-title">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Chat</span>
            </div>
          </div>

          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            {isDarkTheme ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>

        {/* Connection Status */}
        <div className="connection-badge">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">
            {isConnected ? 'Connected' : 'Reconnecting...'}
          </span>
        </div>

        {/* User Info */}
        <div className="user-section">
          <div className="user-card">
            <div className="user-avatar">{userId?.substring(0, 2).toUpperCase()}</div>
            <div className="user-info-content">
              <div className="user-label">You</div>
              <div className="user-name">{userId?.substring(0, 12)}</div>
            </div>
          </div>
        </div>

        {/* Channels Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }}>
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-4h4v2h-4zm0-3h4v2h-4zm0-3h4v2h-4zM4 5h4v2H4zm0 3h4v2H4zm0 3h4v2H4z"></path>
            </svg>
            Channels
          </h3>
          </div>
          <div className="channel-list">
            {channels.map((channel) => (
              <button
                key={channel}
                className={`channel-item ${currentChannel === channel ? 'active' : ''}`}
                onClick={() => handleChannelClick(channel)}
              >
                <span className="channel-icon">#</span>
                <span className="channel-name">{channel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Direct Messages Section */}
        <div className="sidebar-section dm-section">
          <div className="section-header">
            <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Direct Messages
          </h3>
            <button
              className={`add-dm-button ${showNewDM ? 'active' : ''}`}
              onClick={() => setShowNewDM(!showNewDM)}
              title="Start new conversation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          {showNewDM && (
            <div className="dm-input-wrapper">
              <input
                type="text"
                placeholder="Enter username..."
                value={dmInput}
                onChange={(e) => setDmInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddDM()}
                autoFocus
                className="dm-input"
              />
              <div className="dm-input-actions">
                <button onClick={handleAddDM} className="dm-add-btn">Add</button>
                <button onClick={() => setShowNewDM(false)} className="dm-cancel-btn">Cancel</button>
              </div>
            </div>
          )}

          <div className="dm-list">
            {dmUsers.length === 0 ? (
              <div className="empty-state">No conversations yet</div>
            ) : (
              dmUsers.map((user) => (
                <button
                  key={user}
                  className={`dm-item ${currentChannel === `dm_${user}` ? 'active' : ''}`}
                  onClick={() => setCurrentChannel(`dm_${user}`)}
                  title={user}
                >
                  <span className="dm-avatar">{user.substring(0, 1).toUpperCase()}</span>
                  <span className="dm-name">{user}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {isOpen && <div className="sidebar-overlay" onClick={onToggle}></div>}
    </>
  );
}

export default Sidebar;
