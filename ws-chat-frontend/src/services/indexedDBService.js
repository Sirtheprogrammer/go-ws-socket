// IndexedDB Service for local message caching
const DB_NAME = 'InnerVoiceChat';
const DB_VERSION = 1;
const STORE_NAME = 'messages';
const CHANNELS_STORE = 'channels';

let db = null;

// Initialize IndexedDB
export const initIndexedDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('✅ IndexedDB initialized');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create messages store with indexes
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const messagesStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        messagesStore.createIndex('channel', 'channel', { unique: false });
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        messagesStore.createIndex('channelTimestamp', ['channel', 'timestamp'], { unique: false });
      }

      // Create channels store
      if (!database.objectStoreNames.contains(CHANNELS_STORE)) {
        database.createObjectStore(CHANNELS_STORE, { keyPath: 'id' });
      }
    };
  });
};

// Save message to IndexedDB
export const saveMessageToIndexedDB = async (message) => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      id: message.id,
      sender: message.sender,
      channel: message.channel || message.recipient,
      content: message.content || message.payload,
      timestamp: message.timestamp,
      type: message.type,
      recipient: message.recipient,
      createdAt: new Date().toISOString(),
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

// Get messages for a channel from IndexedDB
export const getChannelMessagesFromIndexedDB = async (channelId, limit = 50) => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return [];
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('channel');
    const request = index.getAll(channelId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const messages = request.result
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-limit);
      resolve(messages);
    };
  });
};

// Get DM messages from IndexedDB
export const getDMMessagesFromIndexedDB = async (userId1, userId2, limit = 50) => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return [];
  }

  const dmKey = `dm_${userId1}_${userId2}`;
  const dmKeyReverse = `dm_${userId2}_${userId1}`;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const allMessages = request.result;
      const dmMessages = allMessages.filter(
        (msg) =>
          msg.channel === dmKey ||
          msg.channel === dmKeyReverse ||
          (msg.recipient === userId1 && msg.sender === userId2) ||
          (msg.recipient === userId2 && msg.sender === userId1)
      );

      const sorted = dmMessages
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-limit);

      resolve(sorted);
    };
  });
};

// Clear messages for a channel
export const clearChannelMessagesFromIndexedDB = async (channelId) => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('channel');
    const request = index.openCursor(IDBKeyRange.only(channelId));

    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
};

// Save channel info
export const saveChannelToIndexedDB = async (channel) => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHANNELS_STORE], 'readwrite');
    const store = transaction.objectStore(CHANNELS_STORE);
    const request = store.put({
      id: channel.id || channel,
      name: channel.name || channel,
      createdAt: new Date().toISOString(),
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

// Get all messages count for a channel
export const getMessageCountForChannel = async (channelId) => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return 0;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('channel');
    const request = index.count(channelId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

// Delete a specific message from IndexedDB
export const deleteMessageFromIndexedDB = async (messageId) => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(messageId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      console.log(`✅ Message ${messageId} deleted from IndexedDB`);
      resolve();
    };
  });
};

// Clear all data from IndexedDB
export const clearAllIndexedDB = async () => {
  if (!db) {
    console.warn('IndexedDB not initialized');
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, CHANNELS_STORE], 'readwrite');
    const messagesRequest = transaction.objectStore(STORE_NAME).clear();
    const channelsRequest = transaction.objectStore(CHANNELS_STORE).clear();

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      console.log('✅ IndexedDB cleared');
      resolve();
    };
  });
};

export default {
  initIndexedDB,
  saveMessageToIndexedDB,
  getChannelMessagesFromIndexedDB,
  getDMMessagesFromIndexedDB,
  clearChannelMessagesFromIndexedDB,
  deleteMessageFromIndexedDB,
  saveChannelToIndexedDB,
  getMessageCountForChannel,
  clearAllIndexedDB,
};
