import React, { createContext, useContext, useReducer, useCallback } from 'react';

const ChatContext = createContext();

const initialState = {
  userId: null,
  channels: ['general', 'random', 'announcements'],
  currentChannel: 'general',
  messages: {},
  activeUsers: [],
  typingUsers: new Set(),
  dmUsers: [],
  notifications: [],
  replyingTo: null, // { id, sender, content, channel } - message being replied to
  isConnected: false,
  isDarkTheme: localStorage.getItem('darkTheme') === 'true',
  settings: {
    enableNotifications: true,
    enableSound: true,
    showTypingIndicators: true,
  },
};

const chatReducer = (state, action) => {
  switch (action.type) {
    case 'SET_USER_ID':
      return { ...state, userId: action.payload };

    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };

    case 'SET_CURRENT_CHANNEL':
      return { ...state, currentChannel: action.payload };

    case 'ADD_MESSAGE': {
      const { channel, message } = action.payload;
      const existingMessages = state.messages[channel] || [];
      // Check for duplicates using current state (not stale closure)
      if (existingMessages.some((m) => m.id === message.id)) {
        return state; // Skip duplicate
      }
      return {
        ...state,
        messages: {
          ...state.messages,
          [channel]: [...existingMessages, message],
        },
      };
    }

    case 'SET_CHANNEL_MESSAGES':
      const { channelId, messages: channelMessages } = action.payload;
      return {
        ...state,
        messages: {
          ...state.messages,
          [channelId]: channelMessages,
        },
      };

    case 'REMOVE_MESSAGE': {
      const { channel, messageId } = action.payload;
      const channelMessages = state.messages[channel] || [];
      return {
        ...state,
        messages: {
          ...state.messages,
          [channel]: channelMessages.filter((msg) => msg.id !== messageId),
        },
      };
    }

    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };

    case 'UPDATE_ACTIVE_USERS':
      return { ...state, activeUsers: action.payload };

    case 'SET_TYPING_USERS':
      return { ...state, typingUsers: action.payload };

    case 'ADD_DM_USER':
      const dmKey = `dm_${action.payload}`;
      return {
        ...state,
        dmUsers: state.dmUsers.includes(action.payload)
          ? state.dmUsers
          : [...state.dmUsers, action.payload],
        messages: {
          ...state.messages,
          [dmKey]: state.messages[dmKey] || [],
        },
      };

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          { id: Date.now(), ...action.payload },
        ],
      };

    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(
          (n) => n.id !== action.payload
        ),
      };

    case 'TOGGLE_THEME':
      const newTheme = !state.isDarkTheme;
      localStorage.setItem('darkTheme', newTheme);
      return { ...state, isDarkTheme: newTheme };

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'SET_REPLYING_TO':
      return { ...state, replyingTo: action.payload };

    case 'CLEAR_REPLYING_TO':
      return { ...state, replyingTo: null };

    default:
      return state;
  }
};

export const ChatProvider = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  const setUserId = useCallback((id) => {
    dispatch({ type: 'SET_USER_ID', payload: id });
    localStorage.setItem('userId', id);
  }, []);

  const setConnected = useCallback((connected) => {
    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }, []);

  const setCurrentChannel = useCallback((channel) => {
    dispatch({ type: 'SET_CURRENT_CHANNEL', payload: channel });
  }, []);

  const addMessage = useCallback((channel, message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { channel, message } });
  }, []);

  const removeMessage = useCallback((channel, messageId) => {
    dispatch({ type: 'REMOVE_MESSAGE', payload: { channel, messageId } });
  }, []);

  const setChannelMessages = useCallback((channelId, messages) => {
    dispatch({ type: 'SET_CHANNEL_MESSAGES', payload: { channelId, messages } });
  }, []);

  const updateActiveUsers = useCallback((users) => {
    dispatch({ type: 'UPDATE_ACTIVE_USERS', payload: users });
  }, []);

  const setTypingUsers = useCallback((users) => {
    dispatch({ type: 'SET_TYPING_USERS', payload: users });
  }, []);

  const addDmUser = useCallback((userId) => {
    dispatch({ type: 'ADD_DM_USER', payload: userId });
  }, []);

  const addNotification = useCallback((notification) => {
    dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
  }, []);

  const removeNotification = useCallback((id) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  }, []);

  const toggleTheme = useCallback(() => {
    dispatch({ type: 'TOGGLE_THEME' });
  }, []);

  const updateSettings = useCallback((settings) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: settings });
  }, []);

  const setReplyingTo = useCallback((message) => {
    dispatch({ type: 'SET_REPLYING_TO', payload: message });
  }, []);

  const clearReplyingTo = useCallback(() => {
    dispatch({ type: 'CLEAR_REPLYING_TO' });
  }, []);

  const value = {
    ...state,
    setUserId,
    setConnected,
    setCurrentChannel,
    addMessage,
    removeMessage,
    setChannelMessages,
    updateActiveUsers,
    setTypingUsers,
    addDmUser,
    addNotification,
    removeNotification,
    toggleTheme,
    updateSettings,
    setReplyingTo,
    clearReplyingTo,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
};
