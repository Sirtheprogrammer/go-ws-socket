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
          };
          // Reducer handles duplicate prevention
          addMessage(dmKey, msgData);

          // Save to IndexedDB for local caching
          if (dbInitialized) {
            indexedDBService.saveMessageToIndexedDB({
              id: message.id,
              sender,
              channel: dmKey,
              content: payload?.content || payload,
              timestamp,
              type: message.type,
              recipient: sender,
            }).catch(err => console.error('Error saving DM to IndexedDB:', err));
          }

          // Save to PostgreSQL for global storage
          if (postgresConnected) {
            postgresService.saveMessageToPostgres({
              id: message.id,
              sender,
              channel: dmKey,
              content: payload?.content || payload,
              timestamp,
              type: message.type,
              recipient: sender,
            }).catch(err => console.error('Error saving DM to PostgreSQL:', err));
          }
        }
        break;

      case 'system:typing':
        if (payload?.typing && channel) {
          // Update typing users for this channel
          setTypingUsersState((prev) => {
            const channelTyping = new Set(prev[channel] || []);
            channelTyping.add(sender);

            return {
              ...prev,
              [channel]: channelTyping,
            };
          });

          // Clear existing timeout for this user
          const timeoutKey = `${channel}:${sender}`;
          if (typingTimeoutsRef.current[timeoutKey]) {
            clearTimeout(typingTimeoutsRef.current[timeoutKey]);
          }

          // Set new timeout to clear typing indicator
          typingTimeoutsRef.current[timeoutKey] = setTimeout(() => {
            setTypingUsersState((prev) => {
              const channelTyping = new Set(prev[channel] || []);
              channelTyping.delete(sender);

              return {
                ...prev,
                [channel]: channelTyping,
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

      default:
        console.log('Unknown message type:', type);
    }
  }, [userId, addMessage, addDmUser, addNotification, updateActiveUsers, setTypingUsers, setChannelMessages, dbInitialized, postgresConnected]);

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

            // Deduplicate by ID and sort by timestamp
            const deduped = Array.from(
              new Map(formattedMessages.map((m) => [m.id, m])).values()
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
        <ChatWindow onSendMessage={send} />
      </div>
      <NotificationPanel />
    </div>
  );
}

export default App;
