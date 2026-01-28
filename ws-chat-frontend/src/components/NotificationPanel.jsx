import React, { useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/NotificationPanel.css';

function NotificationPanel() {
  const { notifications, removeNotification, settings } = useChat();

  useEffect(() => {
    const playSound = () => {
      if (settings.enableSound) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      }
    };

    notifications.forEach((notification) => {
      if (notification.type !== 'typing') {
        playSound();
      }

      if (notification.duration) {
        const timer = setTimeout(() => {
          removeNotification(notification.id);
        }, notification.duration);

        return () => clearTimeout(timer);
      }
    });
  }, [notifications, removeNotification, settings]);

  return (
    <div className="notification-panel">
      {notifications
        .filter((notification) => notification.type !== 'typing')
        .map((notification) => (
          <div
            key={notification.id}
            className={`notification notification-${notification.type}`}
          >
            <div className="notification-content">
              {notification.title && (
                <div className="notification-title">{notification.title}</div>
              )}
              <div className="notification-message">{notification.message}</div>
            </div>
            <button
              className="notification-close"
              onClick={() => removeNotification(notification.id)}
            >
              ✕
            </button>
          </div>
        ))}
    </div>
  );
}

export default NotificationPanel;
