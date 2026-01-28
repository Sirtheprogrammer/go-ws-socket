package main

import (
	"time"
)

// MessageType defines the type of message being sent
type MessageType string

const (
	// Chat message types
	MessageTypeChat        MessageType = "chat"
	MessageTypeChatGroup   MessageType = "chat:group"
	MessageTypeChatPrivate MessageType = "chat:private"

	// Notification types
	MessageTypeNotification MessageType = "notification"
	MessageTypeAlert        MessageType = "alert"

	// Event types
	MessageTypeEvent       MessageType = "event"
	MessageTypeCustomEvent MessageType = "event:custom"

	// System messages
	MessageTypeUserJoined MessageType = "system:user_joined"
	MessageTypeUserLeft   MessageType = "system:user_left"
	MessageTypeTyping     MessageType = "system:typing"
	MessageTypePresence   MessageType = "system:presence"
	MessageTypeMessageDelete MessageType = "message:delete"

	// Acknowledgment
	MessageTypeAck MessageType = "ack"
)

// Message represents a websocket message structure
type Message struct {
	ID        string                 `json:"id"`
	Type      MessageType            `json:"type"`
	Sender    string                 `json:"sender"`
	Recipient string                 `json:"recipient,omitempty"`
	Channel   string                 `json:"channel,omitempty"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp int64                  `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// Connection represents a client websocket connection
type Connection struct {
	ID        string
	UserID    string
	Channels  map[string]bool
	ExtraData map[string]interface{}
	CreatedAt time.Time
	LastSeen  time.Time
	outChan   chan *Message
}

// ConnectionInfo holds metadata about active connections
type ConnectionInfo struct {
	ID       string
	UserID   string
	Status   string
	Channels []string
}

// Event represents a system or custom event
type Event struct {
	Name    string
	Payload map[string]interface{}
	Sender  string
}

// BroadcastOptions defines options for broadcasting messages
type BroadcastOptions struct {
	ExcludeConnID bool   // Exclude the sender connection
	Channel       string // Broadcast to specific channel only
	UserID        string // Broadcast to specific user only
}

// Handler defines a message handler function signature
type Handler func(*Connection, *Message) error

// ServerConfig holds configuration for the websocket server
type ServerConfig struct {
	ReadBufferSize  int
	WriteBufferSize int
	MaxConnections  int
	PingInterval    time.Duration
	PongWait        time.Duration
}
