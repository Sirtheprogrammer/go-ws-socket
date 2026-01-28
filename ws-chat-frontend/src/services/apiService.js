// API service for backend communication
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export const apiService = {
  // Get channel message history
  async getChannelMessages(channelId, limit = 50, offset = 0) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/channel?channel=${channelId}&limit=${limit}&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      console.error('Error fetching channel messages:', error);
      return [];
    }
  },

  // Get direct message history between two users
  async getDirectMessages(userId1, userId2, limit = 50, offset = 0) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/direct?user_id_1=${userId1}&user_id_2=${userId2}&limit=${limit}&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      return [];
    }
  },

  // Get unread messages for a user
  async getUnreadMessages(userId) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/unread?user_id=${userId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch unread messages: ${response.statusText}`);
      }

      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      console.error('Error fetching unread messages:', error);
      return [];
    }
  },

  // Health check
  async healthCheck() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  },
};

export default apiService;
