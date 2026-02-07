import React from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/UserList.css';

function UserList({ users, onClose }) {
  const { userNicknameMap, userId, nickname } = useChat();

  const getDisplayName = (user) => {
    if (user === userId && nickname) return nickname;
    return userNicknameMap[user] || user;
  };

  return (
    <div className="user-list-panel">
      <div className="user-list-header">
        <h3>Online Users ({users.length})</h3>
        <button onClick={onClose} className="close-button">✕</button>
      </div>
      <div className="user-list-content">
        {users.length === 0 ? (
          <p className="empty-message">No users online</p>
        ) : (
          users.map((user, index) => {
            const displayName = getDisplayName(user);
            return (
              <div key={index} className="user-item">
                <div className="user-avatar">{displayName.substring(0, 2).toUpperCase()}</div>
                <span className="user-name">{displayName}{user === userId ? ' (You)' : ''}</span>
                <div className="status-indicator"></div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default UserList;
