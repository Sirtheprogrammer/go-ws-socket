package main

// ADVANCED USAGE EXAMPLES
// This file shows advanced patterns for using the WebSocket server

import (
	"fmt"
	"log"
	"time"
)

// ===============================================
// Example 1: Rate Limiting Handler
// ===============================================

type RateLimiter struct {
	limits map[string]int
	window time.Duration
}

func NewRateLimiter(window time.Duration) *RateLimiter {
	return &RateLimiter{
		limits: make(map[string]int),
		window: window,
	}
}

func RateLimitingBeforeHook(limiter *RateLimiter, messagesPerSecond int) func(*Connection, *Message) error {
	return func(conn *Connection, msg *Message) error {
		userID := conn.UserID
		current := limiter.limits[userID]

		if current >= messagesPerSecond {
			return fmt.Errorf("rate limit exceeded for user %s", userID)
		}

		limiter.limits[userID]++

		// Reset counter after window
		time.AfterFunc(limiter.window, func() {
			limiter.limits[userID]--
		})

		return nil
	}
}

// ===============================================
// Example 2: Message Encryption/Decryption
// ===============================================

type SecureMessageHandler struct {
	encryptionKey string
}

func NewSecureMessageHandler(key string) *SecureMessageHandler {
	return &SecureMessageHandler{encryptionKey: key}
}

func (h *SecureMessageHandler) BeforeHook(conn *Connection, msg *Message) error {
	// Decrypt message payload
	if encrypted, ok := msg.Payload["encrypted"].(bool); ok && encrypted {
		// TODO: Implement decryption logic
		log.Printf("Decrypting message from %s", msg.Sender)
	}
	return nil
}

func (h *SecureMessageHandler) AfterHook(conn *Connection, msg *Message) error {
	// Encrypt message before sending
	// TODO: Implement encryption logic
	log.Printf("Message will be encrypted before sending")
	return nil
}

// ===============================================
// Example 3: User Status Tracker
// ===============================================

type UserStatus struct {
	UserID    string
	Status    string
	LastSeen  time.Time
	Channels  []string
}

type UserStatusTracker struct {
	statuses map[string]*UserStatus
}

func NewUserStatusTracker() *UserStatusTracker {
	return &UserStatusTracker{
		statuses: make(map[string]*UserStatus),
	}
}

func (t *UserStatusTracker) TrackConnection(conn *Connection) error {
	t.statuses[conn.UserID] = &UserStatus{
		UserID:   conn.UserID,
		Status:   "online",
		LastSeen: time.Now(),
		Channels: make([]string, 0),
	}
	log.Printf("User %s is online", conn.UserID)
	return nil
}

func (t *UserStatusTracker) TrackDisconnection(conn *Connection) error {
	if status, exists := t.statuses[conn.UserID]; exists {
		status.Status = "offline"
		status.LastSeen = time.Now()
	}
	log.Printf("User %s is offline", conn.UserID)
	return nil
}

// ===============================================
// Example 4: Message Persistence
// ===============================================

type MessageStore interface {
	SaveMessage(msg *Message) error
	GetMessagesByChannel(channel string, limit int) ([]*Message, error)
	GetMessagesByUser(userID string, limit int) ([]*Message, error)
}

type InMemoryMessageStore struct {
	messages []*Message
}

func NewInMemoryMessageStore() *InMemoryMessageStore {
	return &InMemoryMessageStore{
		messages: make([]*Message, 0),
	}
}

func (s *InMemoryMessageStore) SaveMessage(msg *Message) error {
	s.messages = append(s.messages, msg)
	// In production, use database
	log.Printf("Message %s persisted", msg.ID)
	return nil
}

func (s *InMemoryMessageStore) GetMessagesByChannel(channel string, limit int) ([]*Message, error) {
	result := make([]*Message, 0)
	for _, msg := range s.messages {
		if msg.Channel == channel {
			result = append(result, msg)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

func (s *InMemoryMessageStore) GetMessagesByUser(userID string, limit int) ([]*Message, error) {
	result := make([]*Message, 0)
	for _, msg := range s.messages {
		if msg.Sender == userID || msg.Recipient == userID {
			result = append(result, msg)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

// ===============================================
// Example 5: Multi-Channel Router
// ===============================================

type ChannelRouter struct {
	routes map[string]Handler
}

func NewChannelRouter() *ChannelRouter {
	return &ChannelRouter{
		routes: make(map[string]Handler),
	}
}

func (r *ChannelRouter) RegisterChannelHandler(channel string, handler Handler) {
	r.routes[channel] = handler
}

func (r *ChannelRouter) RouteByChannel(conn *Connection, msg *Message) error {
	if msg.Channel == "" {
		return fmt.Errorf("channel is required for channel routing")
	}

	if handler, exists := r.routes[msg.Channel]; exists {
		return handler(conn, msg)
	}

	log.Printf("No specific handler for channel %s, using default", msg.Channel)
	return nil
}

// ===============================================
// Example 6: Connection Metadata Manager
// ===============================================

type MetadataManager struct {
	metadata map[string]map[string]interface{}
}

func NewMetadataManager() *MetadataManager {
	return &MetadataManager{
		metadata: make(map[string]map[string]interface{}),
	}
}

func (m *MetadataManager) SetMetadata(connID, key string, value interface{}) {
	if _, exists := m.metadata[connID]; !exists {
		m.metadata[connID] = make(map[string]interface{})
	}
	m.metadata[connID][key] = value
}

func (m *MetadataManager) GetMetadata(connID, key string) (interface{}, bool) {
	if meta, exists := m.metadata[connID]; exists {
		val, ok := meta[key]
		return val, ok
	}
	return nil, false
}

func (m *MetadataManager) CleanMetadata(connID string) {
	delete(m.metadata, connID)
}

// ===============================================
// Example 7: Event Bus Pattern
// ===============================================

type EventBus struct {
	subscribers map[string][]func(*Event)
}

func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[string][]func(*Event)),
	}
}

func (b *EventBus) Subscribe(eventName string, handler func(*Event)) {
	b.subscribers[eventName] = append(b.subscribers[eventName], handler)
}

func (b *EventBus) Publish(event *Event) {
	if handlers, exists := b.subscribers[event.Name]; exists {
		for _, handler := range handlers {
			go handler(event)
		}
	}
}

// ===============================================
// Example 8: Distributed Session Manager
// ===============================================

type SessionInfo struct {
	ConnID       string
	UserID       string
	CreatedAt    time.Time
	LastActivity time.Time
	Data         map[string]interface{}
}

type SessionManager struct {
	sessions map[string]*SessionInfo
}

func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*SessionInfo),
	}
}

func (s *SessionManager) CreateSession(connID, userID string) *SessionInfo {
	session := &SessionInfo{
		ConnID:       connID,
		UserID:       userID,
		CreatedAt:    time.Now(),
		LastActivity: time.Now(),
		Data:         make(map[string]interface{}),
	}
	s.sessions[connID] = session
	return session
}

func (s *SessionManager) GetSession(connID string) (*SessionInfo, bool) {
	session, exists := s.sessions[connID]
	if exists {
		session.LastActivity = time.Now()
	}
	return session, exists
}

func (s *SessionManager) CloseSession(connID string) {
	delete(s.sessions, connID)
}

// ===============================================
// Example 9: Message Middleware Chain
// ===============================================

type Middleware func(*Connection, *Message) error

type MiddlewareChain struct {
	middlewares []Middleware
}

func NewMiddlewareChain() *MiddlewareChain {
	return &MiddlewareChain{
		middlewares: make([]Middleware, 0),
	}
}

func (mc *MiddlewareChain) Use(m Middleware) *MiddlewareChain {
	mc.middlewares = append(mc.middlewares, m)
	return mc
}

func (mc *MiddlewareChain) Execute(conn *Connection, msg *Message) error {
	for _, m := range mc.middlewares {
		if err := m(conn, msg); err != nil {
			return err
		}
	}
	return nil
}

// ===============================================
// Example Usage
// ===============================================

/*

Example setup with all advanced features:

func setupAdvancedServer() *Server {
    server := NewServer(ServerConfig{})
    
    // Setup rate limiter
    limiter := NewRateLimiter(time.Second)
    server.RegisterBeforeMessageHook(
        RateLimitingBeforeHook(limiter, 10),
    )
    
    // Setup user status tracking
    tracker := NewUserStatusTracker()
    server.RegisterOnConnectHook(tracker.TrackConnection)
    server.RegisterOnDisconnectHook(tracker.TrackDisconnection)
    
    // Setup message persistence
    store := NewInMemoryMessageStore()
    server.RegisterAfterMessageHook(func(conn *Connection, msg *Message) error {
        return store.SaveMessage(msg)
    })
    
    // Setup event bus
    eventBus := NewEventBus()
    eventBus.Subscribe("message:sent", func(evt *Event) {
        log.Printf("Event: %v", evt)
    })
    
    // Setup session manager
    sessionMgr := NewSessionManager()
    server.RegisterOnConnectHook(func(conn *Connection) error {
        sessionMgr.CreateSession(conn.ID, conn.UserID)
        return nil
    })
    
    return server
}

*/
