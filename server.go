package main

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Server is a stateless websocket server
type Server struct {
	mu                sync.RWMutex
	connections       map[string]*Connection
	connectionWSMap   map[string]*websocket.Conn
	channels          map[string]map[string]bool // channel -> {connID -> true}
	handlers          map[MessageType]Handler
	beforeMessageHook func(*Connection, *Message) error
	afterMessageHook  func(*Connection, *Message) error
	onConnectHook     func(*Connection) error
	onDisconnectHook  func(*Connection) error
	config            ServerConfig
	upgrader          websocket.Upgrader
	messageQueue      chan *internalMessage
	done              chan struct{}
	maxConnections    int
}

type internalMessage struct {
	conn *Connection
	msg  *Message
}

// NewServer creates a new WebSocket server instance
func NewServer(config ServerConfig) *Server {
	if config.ReadBufferSize == 0 {
		config.ReadBufferSize = 1024
	}
	if config.WriteBufferSize == 0 {
		config.WriteBufferSize = 1024
	}
	if config.PingInterval == 0 {
		config.PingInterval = 30 * time.Second
	}
	if config.PongWait == 0 {
		config.PongWait = 60 * time.Second
	}
	if config.MaxConnections == 0 {
		config.MaxConnections = 10000
	}

	return &Server{
		connections:     make(map[string]*Connection),
		connectionWSMap: make(map[string]*websocket.Conn),
		channels:        make(map[string]map[string]bool),
		handlers:        make(map[MessageType]Handler),
		config:          config,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  config.ReadBufferSize,
			WriteBufferSize: config.WriteBufferSize,
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins in this implementation
			},
		},
		messageQueue:   make(chan *internalMessage, 10000),
		done:           make(chan struct{}),
		maxConnections: config.MaxConnections,
	}
}

// RegisterHandler registers a handler for a specific message type
func (s *Server) RegisterHandler(msgType MessageType, handler Handler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers[msgType] = handler
}

// RegisterBeforeMessageHook registers a hook that runs before message processing
func (s *Server) RegisterBeforeMessageHook(fn func(*Connection, *Message) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.beforeMessageHook = fn
}

// RegisterAfterMessageHook registers a hook that runs after message processing
func (s *Server) RegisterAfterMessageHook(fn func(*Connection, *Message) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.afterMessageHook = fn
}

// RegisterOnConnectHook registers a hook that runs when a client connects
func (s *Server) RegisterOnConnectHook(fn func(*Connection) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onConnectHook = fn
}

// RegisterOnDisconnectHook registers a hook that runs when a client disconnects
func (s *Server) RegisterOnDisconnectHook(fn func(*Connection) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onDisconnectHook = fn
}

// HandleConnection upgrades an HTTP connection to WebSocket and handles it
func (s *Server) HandleConnection(w http.ResponseWriter, r *http.Request, connID, userID string) error {
	ws, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return fmt.Errorf("upgrade error: %w", err)
	}

	s.mu.Lock()
	if len(s.connections) >= s.maxConnections {
		s.mu.Unlock()
		ws.Close()
		return fmt.Errorf("max connections reached")
	}
	s.mu.Unlock()

	conn := &Connection{
		ID:        connID,
		UserID:    userID,
		Channels:  make(map[string]bool),
		ExtraData: make(map[string]interface{}),
		CreatedAt: time.Now(),
		LastSeen:  time.Now(),
		outChan:   make(chan *Message, 100),
	}

	s.mu.Lock()
	s.connections[connID] = conn
	s.connectionWSMap[connID] = ws
	s.mu.Unlock()

	// Call on connect hook
	if s.onConnectHook != nil {
		if err := s.onConnectHook(conn); err != nil {
			s.removeConnection(connID)
			ws.Close()
			return fmt.Errorf("on connect hook error: %w", err)
		}
	}

	// Start reading messages from this connection
	go s.readMessages(conn, ws)
	go s.writeMessages(conn, ws)

	return nil
}

// readMessages reads incoming messages from a connection
func (s *Server) readMessages(conn *Connection, ws *websocket.Conn) {
	defer func() {
		s.removeConnection(conn.ID)
		ws.Close()
	}()

	ws.SetReadDeadline(time.Now().Add(s.config.PongWait))
	ws.SetPongHandler(func(string) error {
		ws.SetReadDeadline(time.Now().Add(s.config.PongWait))
		return nil
	})

	for {
		var msg Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket error: %v", err)
			}
			return
		}

		if msg.ID == "" {
			msg.ID = generateMessageID()
		}
		if msg.Timestamp == 0 {
			msg.Timestamp = time.Now().Unix()
		}
		if msg.Sender == "" {
			msg.Sender = conn.UserID
		}

		conn.LastSeen = time.Now()

		// Call before hook
		if s.beforeMessageHook != nil {
			if err := s.beforeMessageHook(conn, &msg); err != nil {
				log.Printf("before message hook error: %v", err)
				continue
			}
		}

		s.messageQueue <- &internalMessage{conn: conn, msg: &msg}
	}
}

// writeMessages handles outgoing messages to a connection
func (s *Server) writeMessages(conn *Connection, ws *websocket.Conn) {
	ticker := time.NewTicker(s.config.PingInterval)
	defer ticker.Stop()
	defer close(conn.outChan)

	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := ws.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				return
			}
		case msg := <-conn.outChan:
			if msg == nil {
				return
			}
			ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := ws.WriteJSON(msg); err != nil {
				return
			}
		}
	}
}

// ProcessMessages is the main message processing loop
func (s *Server) ProcessMessages() {
	for {
		select {
		case <-s.done:
			return
		case inMsg := <-s.messageQueue:
			s.processMessage(inMsg.conn, inMsg.msg)
		}
	}
}

// processMessage handles the routing and processing of a message
func (s *Server) processMessage(conn *Connection, msg *Message) {
	s.mu.RLock()
	handler, exists := s.handlers[msg.Type]
	s.mu.RUnlock()

	if exists {
		if err := handler(conn, msg); err != nil {
			log.Printf("handler error for type %s: %v", msg.Type, err)
		}
	} else {
		// Default handling - route to recipient or channel
		s.routeMessage(conn, msg)
	}

	// Call after hook
	if s.afterMessageHook != nil {
		if err := s.afterMessageHook(conn, msg); err != nil {
			log.Printf("after message hook error: %v", err)
		}
	}
}

// routeMessage routes a message to its destination
func (s *Server) routeMessage(conn *Connection, msg *Message) {
	if msg.Recipient != "" {
		// Direct message
		s.sendToUser(msg.Recipient, msg)
	} else if msg.Channel != "" {
		// Channel broadcast
		s.broadcastToChannel(msg.Channel, msg, &BroadcastOptions{ExcludeConnID: true})
	} else {
		// Broadcast to all
		s.broadcastAll(msg, &BroadcastOptions{})
	}
}

// SendToConnection sends a message to a specific connection
func (s *Server) SendToConnection(connID string, msg *Message) error {
	s.mu.RLock()
	conn, exists := s.connections[connID]
	s.mu.RUnlock()

	if !exists {
		return fmt.Errorf("connection not found: %s", connID)
	}
	// Use a non-blocking send with recover for safety
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered from panic sending to connection %s: %v", connID, r)
		}
	}()
	select {
	case conn.outChan <- msg:
		return nil
	default:
		return fmt.Errorf("outgoing message channel full for connection: %s", connID)
	}
}

// sendToUser sends a message to a specific user (to all their connections)
func (s *Server) sendToUser(userID string, msg *Message) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for connID, conn := range s.connections {
		if conn.UserID == userID {
			ws := s.connectionWSMap[connID]
			if ws != nil {
				ws.WriteJSON(msg)
			}
		}
	}
	return nil
}

// BroadcastToChannel sends a message to all connections in a channel
func (s *Server) broadcastToChannel(channel string, msg *Message, opts *BroadcastOptions) error {
	s.mu.RLock()
	connIDs, exists := s.channels[channel]
	if !exists {
		s.mu.RUnlock()
		return fmt.Errorf("channel not found: %s", channel)
	}

	// Create a copy of connection IDs to avoid holding lock during sends
	connsToSend := make([]string, 0, len(connIDs))
	for connID := range connIDs {
		connsToSend = append(connsToSend, connID)
	}
	s.mu.RUnlock()

	for _, connID := range connsToSend {
		s.SendToConnection(connID, msg)
	}

	return nil
}

// BroadcastAll sends a message to all connected clients
func (s *Server) broadcastAll(msg *Message, opts *BroadcastOptions) error {
	s.mu.RLock()
	connIDs := make([]string, 0, len(s.connections))
	for connID := range s.connections {
		connIDs = append(connIDs, connID)
	}
	s.mu.RUnlock()

	for _, connID := range connIDs {
		s.SendToConnection(connID, msg)
	}

	return nil
}

// SubscribeToChannel subscribes a connection to a channel
func (s *Server) SubscribeToChannel(connID, channel string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	conn, exists := s.connections[connID]
	if !exists {
		return fmt.Errorf("connection not found: %s", connID)
	}

	conn.Channels[channel] = true

	if _, exists := s.channels[channel]; !exists {
		s.channels[channel] = make(map[string]bool)
	}
	s.channels[channel][connID] = true

	return nil
}

// UnsubscribeFromChannel unsubscribes a connection from a channel
func (s *Server) UnsubscribeFromChannel(connID, channel string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	conn, exists := s.connections[connID]
	if !exists {
		return fmt.Errorf("connection not found: %s", connID)
	}

	delete(conn.Channels, channel)

	if chans, exists := s.channels[channel]; exists {
		delete(chans, connID)
		if len(chans) == 0 {
			delete(s.channels, channel)
		}
	}

	return nil
}

// GetConnection returns a connection by ID
func (s *Server) GetConnection(connID string) (*Connection, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	conn, exists := s.connections[connID]
	return conn, exists
}

// GetConnections returns all active connections
func (s *Server) GetConnections() []ConnectionInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	conns := make([]ConnectionInfo, 0, len(s.connections))
	for _, conn := range s.connections {
		channels := make([]string, 0, len(conn.Channels))
		for ch := range conn.Channels {
			channels = append(channels, ch)
		}

		conns = append(conns, ConnectionInfo{
			ID:       conn.ID,
			UserID:   conn.UserID,
			Status:   "active",
			Channels: channels,
		})
	}

	return conns
}

// GetActiveUsersInChannel returns all active users in a specific channel
func (s *Server) GetActiveUsersInChannel(channel string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	users := make([]string, 0)
	connIDs, exists := s.channels[channel]
	if !exists {
		return users
	}

	seen := make(map[string]bool)
	for connID := range connIDs {
		conn, exists := s.connections[connID]
		if exists && !seen[conn.UserID] {
			users = append(users, conn.UserID)
			seen[conn.UserID] = true
		}
	}

	return users
}

// removeConnection removes a connection and cleans up
func (s *Server) removeConnection(connID string) {
	s.mu.Lock()
	conn, exists := s.connections[connID]
	if !exists {
		s.mu.Unlock()
		return
	}

	// Call on disconnect hook
	if s.onDisconnectHook != nil {
		s.onDisconnectHook(conn)
	}

	delete(s.connections, connID)
	delete(s.connectionWSMap, connID)

	// Remove from all channels
	for channel := range conn.Channels {
		if chans, exists := s.channels[channel]; exists {
			delete(chans, connID)
			if len(chans) == 0 {
				delete(s.channels, channel)
			}
		}
	}

	s.mu.Unlock()
}

// Stop gracefully stops the server
func (s *Server) Stop() {
	close(s.done)
	s.mu.Lock()
	for _, ws := range s.connectionWSMap {
		ws.Close()
	}
	s.mu.Unlock()
}

// generateMessageID generates a unique message ID
func generateMessageID() string {
	return fmt.Sprintf("msg_%d", time.Now().UnixNano())
}
