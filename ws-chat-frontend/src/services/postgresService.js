/**
 * PostgreSQL Service via REST API
 * Frontend communicates with the Go server which proxies to PostgreSQL
 * Server only handles the HTTP routing - data persistence logic is in the frontend
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Initialize database (ensure tables exist)
export const initPostgres = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/db/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      console.log('✅ PostgreSQL initialized via API');
      return true;
    } else {
      console.warn('⚠️ PostgreSQL initialization via API returned:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to initialize PostgreSQL via API:', error);
    return false;
  }
};

// Save message to PostgreSQL
export const saveMessageToPostgres = async (message) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/db/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: message.id,
        sender: message.sender,
        channel: message.channel || message.recipient || 'general',
        content: message.content || message.payload || '',
        type: message.type || 'chat',
        timestamp: message.timestamp,
        recipient: message.recipient || null,
      }),
    });

    if (response.ok) {
      console.log(`✅ Message saved to PostgreSQL: ${message.id}`);
      return await response.json();
    } else {
      console.warn(`⚠️ Failed to save message: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error('Error saving message to PostgreSQL:', error);
    return null;
  }
};

// Save multiple messages to PostgreSQL
export const saveMessagesToPostgres = async (messages) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/db/messages/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        messages.map((msg) => ({
          id: msg.id,
          sender: msg.sender,
          channel: msg.channel || msg.recipient || 'general',
          content: msg.content || msg.payload || '',
          type: msg.type || 'chat',
          timestamp: msg.timestamp,
          recipient: msg.recipient || null,
        }))
      ),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Saved ${result.count} messages to PostgreSQL`);
      return result;
    } else {
      console.warn(`⚠️ Failed to save messages: ${response.status}`);
      return { count: 0 };
    }
  } catch (error) {
    console.error('Error saving messages to PostgreSQL:', error);
    return { count: 0 };
  }
};

// Get messages for a channel from PostgreSQL
export const getChannelMessagesFromPostgres = async (channelId, limit = 50) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/db/messages/channel?channel=${encodeURIComponent(channelId)}&limit=${limit}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Loaded ${data.messages.length} messages for channel ${channelId}`);
      return data.messages || [];
    } else {
      console.warn(`⚠️ Failed to load channel messages: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error('Error loading channel messages from PostgreSQL:', error);
    return [];
  }
};

// Get DM messages from PostgreSQL
export const getDMMessagesFromPostgres = async (userId1, userId2, limit = 50) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/db/messages/dm?user1=${encodeURIComponent(userId1)}&user2=${encodeURIComponent(userId2)}&limit=${limit}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Loaded ${data.messages.length} DM messages between ${userId1} and ${userId2}`);
      return data.messages || [];
    } else {
      console.warn(`⚠️ Failed to load DM messages: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error('Error loading DM messages from PostgreSQL:', error);
    return [];
  }
};

// Get all messages for a user
export const getAllMessagesForUser = async (userId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/db/messages/user?user_id=${encodeURIComponent(userId)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Loaded ${data.messages.length} messages for user ${userId}`);
      return data.messages || [];
    } else {
      console.warn(`⚠️ Failed to load user messages: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error('Error loading messages for user:', error);
    return [];
  }
};

// Get message count for a channel
export const getMessageCountForChannel = async (channelId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/db/messages/count?channel=${encodeURIComponent(channelId)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (response.ok) {
      const data = await response.json();
      return data.count || 0;
    } else {
      return 0;
    }
  } catch (error) {
    console.error('Error getting message count:', error);
    return 0;
  }
};

// Delete a message from PostgreSQL
export const deleteMessageFromPostgres = async (messageId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/db/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      console.log(`✅ Message ${messageId} deleted from PostgreSQL`);
      return true;
    } else {
      console.warn(`⚠️ Failed to delete message: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    return false;
  }
};

// Clear all messages for a channel
export const clearChannelMessagesFromPostgres = async (channelId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/db/messages/channel/${encodeURIComponent(channelId)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.ok) {
      console.log(`✅ Cleared messages for channel ${channelId}`);
      return true;
    } else {
      console.warn(`⚠️ Failed to clear channel messages: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('Error clearing channel messages:', error);
    return false;
  }
};

// Connection status check
export const isPostgresConnected = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/db/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    return response.ok;
  } catch (error) {
    return false;
  }
};

export default {
  initPostgres,
  saveMessageToPostgres,
  saveMessagesToPostgres,
  getChannelMessagesFromPostgres,
  getDMMessagesFromPostgres,
  getAllMessagesForUser,
  getMessageCountForChannel,
  deleteMessageFromPostgres,
  clearChannelMessagesFromPostgres,
  isPostgresConnected,
};
