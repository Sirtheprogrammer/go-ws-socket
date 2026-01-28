package main

import (
	"fmt"
	"log"
)

// Global server reference for handlers (set during init)
var globalServer *Server

// ChatHandler handles chat messages
func ChatHandler(conn *Connection, msg *Message) error {
	if msg.Payload == nil {
		return fmt.Errorf("payload is required for chat messages")
	}

	// Messages are persisted client-side with IndexedDB
	// Server just routes real-time messages
	if msg.Recipient != "" {
		globalServer.sendToUser(msg.Recipient, msg)
	} else if msg.Channel != "" {
		globalServer.broadcastToChannel(msg.Channel, msg, &BroadcastOptions{ExcludeConnID: true})
	}

	log.Printf("Chat message from %s to %s: %v", msg.Sender, msg.Recipient, msg.Payload)
	return nil
}

// NotificationHandler handles notification messages
func NotificationHandler(conn *Connection, msg *Message) error {
	if msg.Payload == nil {
		return fmt.Errorf("payload is required for notifications")
	}

	log.Printf("Notification from %s: %v", msg.Sender, msg.Payload)
	return nil
}

// EventHandler handles custom events
func EventHandler(conn *Connection, msg *Message) error {
	if msg.Payload == nil {
		return fmt.Errorf("payload is required for events")
	}

	log.Printf("Event from %s: %v", msg.Sender, msg.Payload)
	return nil
}

// AckHandler handles acknowledgment messages
func AckHandler(conn *Connection, msg *Message) error {
	log.Printf("Acknowledgment for message %s", msg.ID)
	return nil
}

// UserJoinedHandler handles user joined events
func UserJoinedHandler(conn *Connection, msg *Message) error {
	log.Printf("User %s joined from connection %s", conn.UserID, conn.ID)
	return nil
}

// UserLeftHandler handles user left events
func UserLeftHandler(conn *Connection, msg *Message) error {
	log.Printf("User %s left", conn.UserID)
	return nil
}

// TypingHandler handles typing indicators
func TypingHandler(conn *Connection, msg *Message) error {
	// Broadcast typing indicator to channel or recipient
	if msg.Channel != "" {
		globalServer.broadcastToChannel(msg.Channel, msg, &BroadcastOptions{ExcludeConnID: false})
		log.Printf("User %s is typing in channel %s", msg.Sender, msg.Channel)
	} else if msg.Recipient != "" {
		globalServer.sendToUser(msg.Recipient, msg)
		log.Printf("User %s is typing to %s", msg.Sender, msg.Recipient)
	}
	return nil
}

// PresenceHandler handles presence updates and channel joins
func PresenceHandler(conn *Connection, msg *Message) error {
	log.Printf("Presence update from %s in channel %s: %v", msg.Sender, msg.Channel, msg.Payload)

	// Handle join action
	if action, ok := msg.Payload["action"].(string); ok && action == "join" && msg.Channel != "" {
		// Subscribe connection to channel
		if err := globalServer.SubscribeToChannel(conn.ID, msg.Channel); err != nil {
			log.Printf("Failed to subscribe %s to channel %s: %v", conn.ID, msg.Channel, err)
			return err
		}

		log.Printf("User %s (%s) subscribed to channel %s", msg.Sender, conn.ID, msg.Channel)

		// Message history is now loaded from IndexedDB on client side
		// Server no longer manages message persistence

		// Notify others in channel that user joined
		joinMsg := &Message{
			ID:        generateMessageID(),
			Type:      MessageTypeUserJoined,
			Sender:    "system",
			Channel:   msg.Channel,
			Timestamp: msg.Timestamp,
			Payload: map[string]interface{}{
				"user": msg.Sender,
			},
		}
		globalServer.broadcastToChannel(msg.Channel, joinMsg, &BroadcastOptions{})
	}

	// Broadcast presence update (list of active users)
	users := globalServer.GetActiveUsersInChannel(msg.Channel)
	presenceMsg := &Message{
		ID:        generateMessageID(),
		Type:      MessageTypePresence,
		Sender:    "system",
		Channel:   msg.Channel,
		Timestamp: msg.Timestamp,
		Payload: map[string]interface{}{
			"users": users,
		},
	}
	globalServer.broadcastToChannel(msg.Channel, presenceMsg, &BroadcastOptions{})

	return nil
}

// GroupChatHandler handles group chat messages
func GroupChatHandler(conn *Connection, msg *Message) error {
	if msg.Channel == "" {
		return fmt.Errorf("channel is required for group chat messages")
	}

	// Messages are persisted client-side with IndexedDB
	// Server just routes real-time messages
	globalServer.broadcastToChannel(msg.Channel, msg, &BroadcastOptions{ExcludeConnID: true})
	log.Printf("Group chat message from %s in channel %s: %v", msg.Sender, msg.Channel, msg.Payload)
	return nil
}

// PrivateChatHandler handles private chat messages
func PrivateChatHandler(conn *Connection, msg *Message) error {
	if msg.Recipient == "" {
		return fmt.Errorf("recipient is required for private chat messages")
	}

	// Messages are persisted client-side with IndexedDB
	// Server just routes real-time messages
	globalServer.sendToUser(msg.Recipient, msg)
	log.Printf("Private chat message from %s to %s: %v", msg.Sender, msg.Recipient, msg.Payload)
	return nil
}

// AlertHandler handles alert notifications
func AlertHandler(conn *Connection, msg *Message) error {
	if severity, ok := msg.Payload["severity"].(string); ok {
		log.Printf("Alert with severity %s: %v", severity, msg.Payload)
	}
	return nil
}

// DefaultBeforeHook provides validation and preprocessing
func DefaultBeforeHook(conn *Connection, msg *Message) error {
	if msg.Type == "" {
		return fmt.Errorf("message type is required")
	}

	if msg.Sender == "" {
		msg.Sender = conn.UserID
	}

	return nil
}

// DefaultAfterHook provides logging and cleanup
func DefaultAfterHook(conn *Connection, msg *Message) error {
	log.Printf("[AFTER] Message %s processed from %s (type: %s)", msg.ID, msg.Sender, msg.Type)
	return nil
}

// OnConnect is called when a client connects
func OnConnect(conn *Connection) error {
	log.Printf("Client connected: ID=%s, UserID=%s", conn.ID, conn.UserID)
	return nil
}

// OnDisconnect is called when a client disconnects
func OnDisconnect(conn *Connection) error {
	log.Printf("Client disconnected: ID=%s, UserID=%s", conn.ID, conn.UserID)
	return nil
}
