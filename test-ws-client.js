#!/usr/bin/env node

const WebSocket = require('ws');

async function test() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8080/ws?user_id=test_user_123');
    
    const timeout = setTimeout(() => {
      console.log('❌ Connection timed out after 10 seconds');
      ws.close();
      resolve();
    }, 10000);

    ws.onopen = () => {
      console.log('✅ Connected!');
      clearTimeout(timeout);
      
      // Send a join message
      const msg = {
        type: 'system:presence',
        sender: 'test_user_123',
        channel: 'general',
        payload: { action: 'join' },
        timestamp: Date.now(),
      };
      
      console.log('Sending join message:', msg);
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      console.log('📨 Received:', event.data);
    };

    ws.onerror = (error) => {
      console.error('❌ Error:', error);
      clearTimeout(timeout);
      resolve();
    };

    ws.onclose = () => {
      console.log('❌ Connection closed');
      clearTimeout(timeout);
      resolve();
    };
  });
}

test();
