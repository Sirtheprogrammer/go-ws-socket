import React from 'react';
import '../styles/UserList.css';

function UserList({ users, onClose }) {
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
          users.map((user, index) => (
            <div key={index} className="user-item">
              <div className="user-avatar">{user.substring(0, 2).toUpperCase()}</div>
              <span className="user-name">{user}</span>
              <div className="status-indicator"></div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default UserList;
