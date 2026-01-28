import { useEffect, useCallback, useRef } from 'react';

export const useWebSocket = (userId, onMessage, onConnected, onDisconnected) => {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    // Prevent duplicate connection attempts
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnectingRef.current = true;

    try {
      const wsUrl = `${import.meta.env.VITE_WEBSOCKET_URL}?user_id=${userId}`;
      
      console.log('🔗 Connecting to WebSocket:', wsUrl);
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('✅ WebSocket connected');
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;
        onConnected?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 Message received:', message);
          onMessage?.(message);
        } catch (error) {
          console.error('❌ Failed to parse message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        isConnectingRef.current = false;
      };

      wsRef.current.onclose = () => {
        console.log('❌ Disconnected from WebSocket');
        isConnectingRef.current = false;
        onDisconnected?.();
        
        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`⏳ Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          console.error('❌ Max reconnection attempts reached');
        }
      };
    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      isConnectingRef.current = false;
    }
  }, [userId, onMessage, onConnected, onDisconnected]);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    console.warn('⚠️ WebSocket not connected, message not sent');
    return false;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Only connect if we have a userId
    if (!userId) {
      console.log('⏳ Waiting for userId...');
      return;
    }

    console.log('📦 Setting up WebSocket effect for user:', userId);
    connect();

    return () => {
      // Don't disconnect on unmount in development (React Strict Mode)
      // Just log it for debugging
      console.log('🧹 useWebSocket cleanup (React Strict Mode)');
    };
  }, [userId, connect]);

  return {
    send,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    disconnect,
    connect,
  };
};
