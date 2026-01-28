package main

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

// Database handles all database operations
type Database struct {
	conn *sql.DB
	mu   sync.RWMutex
}

// NewDatabase creates a new database connection
func NewDatabase(connStr string) (*Database, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	err = db.Ping()
	if err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	database := &Database{conn: db}

	// Initialize schema
	if err := database.InitSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	log.Println("✅ Database connected and schema initialized")
	return database, nil
}

// InitSchema creates the necessary tables if they don't exist
func (d *Database) InitSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id VARCHAR(255) PRIMARY KEY,
		username VARCHAR(255) UNIQUE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS channels (
		id VARCHAR(255) PRIMARY KEY,
		name VARCHAR(255) UNIQUE NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS messages (
		id VARCHAR(255) PRIMARY KEY,
		sender_id VARCHAR(255) NOT NULL,
		channel_id VARCHAR(255),
		recipient_id VARCHAR(255),
		content TEXT,
		message_type VARCHAR(50),
		payload JSONB,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS message_reads (
		id SERIAL PRIMARY KEY,
		user_id VARCHAR(255) NOT NULL,
		message_id VARCHAR(255) NOT NULL,
		read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
		UNIQUE(user_id, message_id)
	);

	CREATE TABLE IF NOT EXISTS channel_members (
		id SERIAL PRIMARY KEY,
		channel_id VARCHAR(255) NOT NULL,
		user_id VARCHAR(255) NOT NULL,
		joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(channel_id, user_id)
	);

	CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
	CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
	CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
	CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
	CREATE INDEX IF NOT EXISTS idx_message_reads_user ON message_reads(user_id);
	`

	_, err := d.conn.Exec(schema)
	return err
}

// SaveMessage saves a message to the database
func (d *Database) SaveMessage(msg *Message, senderID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	INSERT INTO messages (id, sender_id, channel_id, recipient_id, content, message_type, payload, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT (id) DO NOTHING
	`

	var channelID *string
	var recipientID *string

	if msg.Type == "chat:group" || msg.Type == "chat" {
		channelID = &msg.Channel
	} else if msg.Type == "chat:private" {
		recipientID = &msg.Recipient
	}

	_, err := d.conn.Exec(
		query,
		msg.ID,
		senderID,
		channelID,
		recipientID,
		msg.Payload,
		msg.Type,
		msg.Payload,
		time.Now(),
	)

	return err
}

// GetChannelMessages retrieves messages from a channel with pagination
func (d *Database) GetChannelMessages(channelID string, limit int, offset int) ([]*Message, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `
	SELECT id, sender_id, channel_id, recipient_id, content, message_type, payload, created_at
	FROM messages
	WHERE channel_id = $1
	ORDER BY created_at DESC
	LIMIT $2 OFFSET $3
	`

	rows, err := d.conn.Query(query, channelID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		msg := &Message{}
		var createdAt time.Time
		var payload sql.NullString

		err := rows.Scan(
			&msg.ID,
			&msg.Sender,
			&msg.Channel,
			&msg.Recipient,
			&msg.Payload,
			&msg.Type,
			&payload,
			&createdAt,
		)
		if err != nil {
			log.Printf("Error scanning message: %v", err)
			continue
		}

		msg.Timestamp = createdAt.UnixMilli()
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// GetDirectMessages retrieves direct messages between two users with pagination
func (d *Database) GetDirectMessages(userID1, userID2 string, limit int, offset int) ([]*Message, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `
	SELECT id, sender_id, channel_id, recipient_id, content, message_type, payload, created_at
	FROM messages
	WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
	ORDER BY created_at DESC
	LIMIT $3 OFFSET $4
	`

	rows, err := d.conn.Query(query, userID1, userID2, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		msg := &Message{}
		var createdAt time.Time
		var payload sql.NullString

		err := rows.Scan(
			&msg.ID,
			&msg.Sender,
			&msg.Channel,
			&msg.Recipient,
			&msg.Payload,
			&msg.Type,
			&payload,
			&createdAt,
		)
		if err != nil {
			log.Printf("Error scanning message: %v", err)
			continue
		}

		msg.Timestamp = createdAt.UnixMilli()
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// GetUser retrieves or creates a user
func (d *Database) GetUser(userID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Check if user exists
	query := `SELECT id FROM users WHERE id = $1`
	row := d.conn.QueryRow(query, userID)

	var id string
	err := row.Scan(&id)

	if err == sql.ErrNoRows {
		// User doesn't exist, create them
		insertQuery := `
		INSERT INTO users (id, created_at, updated_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (id) DO NOTHING
		`
		_, err := d.conn.Exec(insertQuery, userID, time.Now(), time.Now())
		return err
	}

	return err
}

// GetOrCreateChannel gets or creates a channel
func (d *Database) GetOrCreateChannel(channelID, channelName string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	INSERT INTO channels (id, name, created_at)
	VALUES ($1, $2, $3)
	ON CONFLICT (id) DO NOTHING
	`

	_, err := d.conn.Exec(query, channelID, channelName, time.Now())
	return err
}

// AddChannelMember adds a user to a channel
func (d *Database) AddChannelMember(channelID, userID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	INSERT INTO channel_members (channel_id, user_id, joined_at)
	VALUES ($1, $2, $3)
	ON CONFLICT (channel_id, user_id) DO NOTHING
	`

	_, err := d.conn.Exec(query, channelID, userID, time.Now())
	return err
}

// GetChannelMembers gets all members of a channel
func (d *Database) GetChannelMembers(channelID string) ([]string, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `SELECT user_id FROM channel_members WHERE channel_id = $1`
	rows, err := d.conn.Query(query, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		userIDs = append(userIDs, userID)
	}

	return userIDs, rows.Err()
}

// MarkMessageAsRead marks a message as read by a user
func (d *Database) MarkMessageAsRead(userID, messageID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	INSERT INTO message_reads (user_id, message_id, read_at)
	VALUES ($1, $2, $3)
	ON CONFLICT (user_id, message_id) DO NOTHING
	`

	_, err := d.conn.Exec(query, userID, messageID, time.Now())
	return err
}

// GetUnreadMessages gets unread messages for a user
func (d *Database) GetUnreadMessages(userID string) ([]*Message, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `
	SELECT m.id, m.sender_id, m.channel_id, m.recipient_id, m.content, m.message_type, m.payload, m.created_at
	FROM messages m
	WHERE m.recipient_id = $1 OR m.channel_id IN (
		SELECT channel_id FROM channel_members WHERE user_id = $1
	)
	AND m.id NOT IN (
		SELECT message_id FROM message_reads WHERE user_id = $1
	)
	ORDER BY m.created_at DESC
	`

	rows, err := d.conn.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		msg := &Message{}
		var createdAt time.Time
		var payload sql.NullString

		err := rows.Scan(
			&msg.ID,
			&msg.Sender,
			&msg.Channel,
			&msg.Recipient,
			&msg.Payload,
			&msg.Type,
			&payload,
			&createdAt,
		)
		if err != nil {
			log.Printf("Error scanning message: %v", err)
			continue
		}

		msg.Timestamp = createdAt.UnixMilli()
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// Close closes the database connection
func (d *Database) Close() error {
	return d.conn.Close()
}
