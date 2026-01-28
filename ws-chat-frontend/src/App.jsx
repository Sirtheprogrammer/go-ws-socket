import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useChat } from './context/ChatContext';
import { useWebSocket } from './hooks/useWebSocket';
import apiService from './services/apiService';
import indexedDBService from './services/indexedDBService';
import postgresService from './services/postgresService';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import NotificationPanel from './components/NotificationPanel';
import './App.css';

function App() {
  const {
    userId,
    setUserId,
    setConnected,
    isConnected,
    currentChannel,
    messages,
    addMessage,
    removeMessage,
    setChannelMessages,
    updateActiveUsers,
    setTypingUsers,
    setCurrentChannel,
    isDarkTheme,
    addDmUser,
    addNotification,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [typingUsersState, setTypingUsersState] = useState({});
  const [dbInitialized, setDbInitialized] = useState(false);
  const [postgresConnected, setPostgresConnected] = useState(false);

  // Refs for managing typing indicators
  const typingTimeoutsRef = useRef({});
  // Ref for accessing latest messages in effects without dependency loops
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initialize IndexedDB and PostgreSQL on app load
  useEffect(() => {
    const initializeDatabases = async () => {
      try {
        // Initialize IndexedDB
        await indexedDBService.initIndexedDB();
        setDbInitialized(true);
        console.log('✅ IndexedDB initialized');

        // Initialize PostgreSQL API
        try {
          await postgresService.initPostgres();
          setPostgresConnected(true);
          console.log('✅ PostgreSQL API initialized');
        } catch (pgError) {
          console.warn('⚠️ PostgreSQL API connection failed, using IndexedDB only:', pgError.message);
          setPostgresConnected(false);
        }

        // Request browser notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then(permission => {
            console.log(`🔔 Notification permission: ${permission}`);
          });
        }
      } catch (error) {
        console.error('❌ Database initialization failed:', error);
      }
    };

    initializeDatabases();

    // No cleanup needed - REST API doesn't maintain direct connection
    return () => { };
  }, []);

  // Update typing users when channel changes
  useEffect(() => {
    if (currentChannel && typingUsersState[currentChannel]) {
      setTypingUsers(typingUsersState[currentChannel]);
    } else {
      setTypingUsers(new Set());
    }
  }, [currentChannel, typingUsersState, setTypingUsers]);

  // Initialize user ID
  useEffect(() => {
    if (!userId) {
      const saved = localStorage.getItem('userId');
      const newUserId = saved || `user_${Math.random().toString(36).substr(2, 9)}`;
      setUserId(newUserId);
    }
  }, [userId, setUserId]);

  // Memoize WebSocket message handler to prevent recreation
  const handleWebSocketMessage = useCallback((message) => {
    const { type, sender, channel, payload, timestamp } = message;

    switch (type) {
      case 'chat:group':
      case 'chat':
        if (channel) {
          const msgData = {
            id: message.id,
            sender,
            content: payload?.content || payload,
            timestamp,
            type: 'message',
            replyTo: payload?.replyTo || undefined,
          };
          // Reducer handles duplicate prevention
          addMessage(channel, msgData);

          // Save to IndexedDB for local caching
          if (dbInitialized) {
            indexedDBService.saveMessageToIndexedDB({
              id: message.id,
              sender,
              channel,
              content: payload?.content || payload,
              timestamp,
              type: message.type,
              replyTo: payload?.replyTo || undefined,
            }).catch(err => console.error('Error saving to IndexedDB:', err));
          }

          // Save to PostgreSQL for global storage (async, don't block UI)
          if (postgresConnected) {
            postgresService.saveMessageToPostgres({
              id: message.id,
              sender,
              channel,
              content: payload?.content || payload,
              timestamp,
              type: message.type,
            }).catch(err => console.error('Error saving to PostgreSQL:', err));
          }
        }
        break;

      case 'chat:private':
        const dmKey = `dm_${sender}`;
        if (sender !== userId) {
          addDmUser(sender);
          const msgData = {
            id: message.id,
            sender,
            content: payload?.content || payload,
            timestamp,
            type: 'message',
            replyTo: payload?.replyTo || undefined,
          };
          // Reducer handles duplicate prevention
          addMessage(dmKey, msgData);

          // Show notification for incoming DM
          const messagePreview = (payload?.content || payload || '').substring(0, 50);
          addNotification({
            type: 'message',
            title: `New DM from ${sender}`,
            message: messagePreview + (messagePreview.length >= 50 ? '...' : ''),
            duration: 5000,
          });

          // Browser notification if tab is not focused
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`New message from ${sender}`, {
              body: messagePreview,
              icon: '/favicon.ico',
            });
          }

          // The sender already saved this message to PostgreSQL, 
          // but we should also cache it to IndexedDB with the correct recipient
          // The actual recipient is the current user (who received the message)
          const actualRecipient = message.recipient || userId;

          // Save to IndexedDB for local caching
          if (dbInitialized) {
            indexedDBService.saveMessageToIndexedDB({
              id: message.id,
              sender,
              channel: dmKey,
              content: payload?.content || payload,
              timestamp,
              type: message.type,
              recipient: actualRecipient,
            }).catch(err => console.error('Error saving DM to IndexedDB:', err));
          }

          // Save to PostgreSQL for global storage
          // Use the same recipient as in the original message
          if (postgresConnected) {
            postgresService.saveMessageToPostgres({
              id: message.id,
              sender,
              channel: dmKey,
              content: payload?.content || payload,
              timestamp,
              type: message.type,
              recipient: actualRecipient,
            }).catch(err => console.error('Error saving DM to PostgreSQL:', err));
          }
        }
        break;

      case 'system:typing':
        // For DMs, we construct the channel key from the sender
        // For regular channels, we use the channel field directly
        const typingChannel = channel || (sender ? `dm_${sender}` : null);
        if (payload?.typing && typingChannel) {
          // Update typing users for this channel
          setTypingUsersState((prev) => {
            const channelTyping = new Set(prev[typingChannel] || []);
            channelTyping.add(sender);

            return {
              ...prev,
              [typingChannel]: channelTyping,
            };
          });

          // Clear existing timeout for this user
          const timeoutKey = `${typingChannel}:${sender}`;
          if (typingTimeoutsRef.current[timeoutKey]) {
            clearTimeout(typingTimeoutsRef.current[timeoutKey]);
          }

          // Set new timeout to clear typing indicator
          typingTimeoutsRef.current[timeoutKey] = setTimeout(() => {
            setTypingUsersState((prev) => {
              const channelTyping = new Set(prev[typingChannel] || []);
              channelTyping.delete(sender);

              return {
                ...prev,
                [typingChannel]: channelTyping,
              };
            });
            delete typingTimeoutsRef.current[timeoutKey];
          }, 3000);
        }
        break;

      case 'system:presence':
        if (payload?.users) {
          const userList = Array.isArray(payload.users) ? payload.users : [];
          updateActiveUsers(userList);
        }
        break;

      case 'system:message_history':
        // Handle message history sent when user joins a channel
        if (payload?.messages && channel) {
          const historyMessages = payload.messages.map((msg) => ({
            id: msg.id || msg.ID,
            sender: msg.sender || msg.Sender,
            content: msg.content || msg.Payload || msg.payload,
            timestamp: msg.timestamp || msg.Timestamp,
            type: 'message',
          }));

          // Deduplicate by ID and sort by timestamp
          const deduped = Array.from(
            new Map(historyMessages.map((m) => [m.id, m])).values()
          ).sort((a, b) => a.timestamp - b.timestamp);

          // Save all history messages to IndexedDB
          if (dbInitialized) {
            Promise.all(
              deduped.map(msg =>
                indexedDBService.saveMessageToIndexedDB({
                  id: msg.id,
                  sender: msg.sender,
                  channel,
                  content: msg.content,
                  timestamp: msg.timestamp,
                  type: 'message',
                })
              )
            ).catch(err => console.error('Error saving history to IndexedDB:', err));
          }

          // Defer state update to next event loop to avoid updating parent during render
          setTimeout(() => {
            setChannelMessages(channel, deduped);
            console.log(`✅ Loaded ${deduped.length} messages from history for #${channel}`);
          }, 0);
        }
        break;

      case 'system:user_joined':
        addNotification({
          type: 'info',
          title: 'User Joined',
          message: `${sender} joined #${channel}`,
          duration: 3000,
        });
        break;

      case 'system:user_left':
        addNotification({
          type: 'info',
          title: 'User Left',
          message: `${sender} left #${channel}`,
          duration: 3000,
        });
        break;

      case 'message:delete':
        if (payload?.message_id) {
          const messageId = payload.message_id;
          const deleteChannel = channel || (sender ? `dm_${sender}` : currentChannel);

          // Remove from local state
          removeMessage(deleteChannel, messageId);

          // Delete from IndexedDB
          if (dbInitialized) {
            indexedDBService.deleteMessageFromIndexedDB(messageId)
              .catch(err => console.error('Error deleting from IndexedDB:', err));
          }

          // Delete from PostgreSQL
          if (postgresConnected) {
            postgresService.deleteMessageFromPostgres(messageId)
              .catch(err => console.error('Error deleting from PostgreSQL:', err));
          }
        }
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }, [userId, addMessage, removeMessage, addDmUser, addNotification, updateActiveUsers, setTypingUsers, setChannelMessages, dbInitialized, postgresConnected]);

  const { send, isConnected: wsConnected } = useWebSocket(
    userId,
    handleWebSocketMessage,
    () => {
      console.log('✅ WebSocket connected');
      setConnected(true);
    },
    () => {
      console.log('❌ WebSocket disconnected');
      setConnected(false);
    }
  );

  // Handle message deletion (must be after useWebSocket to access 'send')
  const handleDeleteMessage = useCallback((messageId) => {
    if (!userId || !isConnected) {
      console.warn('Cannot delete message: not connected');
      return;
    }

    const deleteMsg = {
      type: 'message:delete',
      sender: userId,
      channel: currentChannel && !currentChannel.startsWith('dm_') ? currentChannel : undefined,
      recipient: currentChannel && currentChannel.startsWith('dm_') ? currentChannel.replace('dm_', '') : undefined,
      payload: { message_id: messageId },
      timestamp: Date.now(),
      id: `del_${Date.now()}`,
    };

    send(deleteMsg);
  }, [userId, isConnected, currentChannel, send]);

  // Load messages from PostgreSQL when channel changes
  useEffect(() => {
    if (currentChannel && postgresConnected && wsConnected) {
      const loadPostgresMessages = async () => {
        try {
          let pgMessages = [];

          if (currentChannel.startsWith('dm_')) {
            // Load DM messages
            const otherUserId = currentChannel.replace('dm_', '');
            pgMessages = await postgresService.getDMMessagesFromPostgres(userId, otherUserId, 50);
          } else {
            // Load channel messages
            pgMessages = await postgresService.getChannelMessagesFromPostgres(currentChannel, 50);
          }

          if (pgMessages.length > 0) {
            const formattedMessages = pgMessages.map((msg) => ({
              id: msg.id,
              sender: msg.sender,
              content: msg.content,
              timestamp: msg.timestamp,
              type: 'message',
            }));

            // Get existing messages from ref to ensure we don't lose real-time messages
            // that might not be in the DB yet or were just received
            const existingMessages = messagesRef.current[currentChannel] || [];

            // Combine and deduplicate
            const allMessages = [...existingMessages, ...formattedMessages];
            const deduped = Array.from(
              new Map(allMessages.map((m) => [m.id, m])).values()
            ).sort((a, b) => a.timestamp - b.timestamp);

            // Save to IndexedDB
            if (dbInitialized) {
              Promise.all(
                deduped.map(msg =>
                  indexedDBService.saveMessageToIndexedDB({
                    id: msg.id,
                    sender: msg.sender,
                    channel: currentChannel,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    type: 'message',
                  })
                )
              ).catch(err => console.error('Error caching messages to IndexedDB:', err));
            }

            // Update state
            setTimeout(() => {
              setChannelMessages(currentChannel, deduped);
              console.log(`✅ Loaded ${deduped.length} messages from PostgreSQL for ${currentChannel}`);
            }, 0);
          }
        } catch (error) {
          console.error('Error loading messages from PostgreSQL:', error);
        }
      };

      loadPostgresMessages();
    }
  }, [currentChannel, postgresConnected, wsConnected, userId, dbInitialized, setChannelMessages]);

  // Auto-join default channel when connected
  useEffect(() => {
    if (wsConnected && userId) {
      console.log('📤 Sending join message for general channel');
      const joinMsg = {
        type: 'system:presence',
        sender: userId,
        channel: 'general',
        payload: { action: 'join' },
        timestamp: Date.now(),
      };
      send(joinMsg);
    }
  }, [wsConnected, userId, send]);

  return (
    <div className={`app ${isDarkTheme ? 'dark-theme' : ''}`}>
      {/* Mobile toggle button */}
      <button
        className="mobile-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      <div className="app-container">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onSendMessage={send}
        />
        <ChatWindow onSendMessage={send} onDeleteMessage={handleDeleteMessage} />
      </div>
      <NotificationPanel />
    </div>
  );
}

export default App;
