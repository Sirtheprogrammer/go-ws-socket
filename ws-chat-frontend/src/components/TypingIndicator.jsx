import React from 'react';
import '../styles/TypingIndicator.css';

function TypingIndicator({ typingUsers }) {
  if (!typingUsers || typingUsers.size === 0) {
    return null;
  }

  const typingUserList = Array.from(typingUsers);
  const typingText = typingUserList.length === 1
    ? `${typingUserList[0]} is typing`
    : `${typingUserList.join(', ')} are typing`;

  return (
    <div className="typing-indicator-container">
      <span className="typing-text">{typingText}</span>
      <div className="typing-dots">
        <span className="dot dot-1"></span>
        <span className="dot dot-2"></span>
        <span className="dot dot-3"></span>
      </div>
    </div>
  );
}

export default TypingIndicator;
