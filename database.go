package main

import (
	"database/sql"
	"time"

	_ "github.com/lib/pq"
)

// Database handles PostgreSQL operations
type Database struct {
	conn *sql.DB
}

// NewDatabase creates a new database connection
func NewDatabase(connStr string) (*Database, error) {
	if connStr == "" {
		connStr = "postgresql://innervoicechat:VGXSZ6Chh47hASufcxKANXCYIoTXJyln@dpg-d5skjn5actks73bl0o60-a.virginia-postgres.render.com/innervoicechat"
	}

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(time.Hour)

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return &Database{conn: db}, nil
}

// InitSchema creates the database tables
func (db *Database) InitSchema() error {
	// Create messages table and indexes if they do not already exist.
	// Avoid dropping existing objects here to prevent accidental cascades
	// or conflicts in shared databases. Keep schema creation idempotent.
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		sender TEXT NOT NULL,
		channel TEXT NOT NULL,
		content TEXT NOT NULL,
		type TEXT NOT NULL DEFAULT 'chat',
		timestamp BIGINT NOT NULL,
		recipient TEXT,
		nickname TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
	CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
	CREATE INDEX IF NOT EXISTS idx_messages_channel_timestamp ON messages(channel, timestamp);
	CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient);

	-- Add nickname column to existing tables that lack it
	DO $$ BEGIN
		ALTER TABLE messages ADD COLUMN IF NOT EXISTS nickname TEXT;
	EXCEPTION WHEN duplicate_column THEN NULL;
	END $$;

	-- Read status table: tracks the last-read timestamp per user per channel
	CREATE TABLE IF NOT EXISTS read_status (
		user_id TEXT NOT NULL,
		channel TEXT NOT NULL,
		last_read_timestamp BIGINT NOT NULL DEFAULT 0,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, channel)
	);
	`

	_, err := db.conn.Exec(createTableSQL)
	return err
}

// SaveMessage saves a message to the database
func (db *Database) SaveMessage(id, sender, channel, content, msgType string, timestamp int64, recipient *string, nickname *string) error {
	query := `
	INSERT INTO messages (id, sender, channel, content, type, timestamp, recipient, nickname)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT (id) DO NOTHING
	`
	_, err := db.conn.Exec(query, id, sender, channel, content, msgType, timestamp, recipient, nickname)
	return err
}

// SaveMessages saves multiple messages in batch
func (db *Database) SaveMessages(messages []map[string]interface{}) (int, error) {
	if len(messages) == 0 {
		return 0, nil
	}

	tx, err := db.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	inserted := 0
	for _, msg := range messages {
		query := `
		INSERT INTO messages (id, sender, channel, content, type, timestamp, recipient, nickname)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO NOTHING
		`
		result, err := tx.Exec(query,
			msg["id"],
			msg["sender"],
			msg["channel"],
			msg["content"],
			msg["type"],
			msg["timestamp"],
			msg["recipient"],
			msg["nickname"],
		)
		if err != nil {
			return 0, err
		}

		rows, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		inserted += int(rows)
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return inserted, nil
}

// GetChannelMessages retrieves messages for a channel
func (db *Database) GetChannelMessages(channel string, limit int) ([]map[string]interface{}, error) {
	query := `
	SELECT id, sender, channel, content, type, timestamp, recipient, nickname
	FROM messages
	WHERE channel = $1
	ORDER BY timestamp ASC
	LIMIT $2
	OFFSET (
		SELECT GREATEST(COUNT(*) - $2, 0)
		FROM messages
		WHERE channel = $1
	)
	`

	rows, err := db.conn.Query(query, channel, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sender, ch, content, msgType string
		var timestamp int64
		var recipient, nickname *string

		if err := rows.Scan(&id, &sender, &ch, &content, &msgType, &timestamp, &recipient, &nickname); err != nil {
			return nil, err
		}

		msg := map[string]interface{}{
			"id":        id,
			"sender":    sender,
			"channel":   ch,
			"content":   content,
			"type":      msgType,
			"timestamp": timestamp,
			"recipient": recipient,
			"nickname":  nickname,
		}
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// GetDMMessages retrieves direct messages between two users
func (db *Database) GetDMMessages(userId1, userId2 string, limit int) ([]map[string]interface{}, error) {
	query := `
	SELECT id, sender, channel, content, type, timestamp, recipient, nickname
	FROM messages
	WHERE (
		(sender = $1 AND recipient = $2)
		OR (sender = $2 AND recipient = $1)
	)
	ORDER BY timestamp ASC
	LIMIT $3
	OFFSET (
		SELECT GREATEST(COUNT(*) - $3, 0)
		FROM messages
		WHERE (
			(sender = $1 AND recipient = $2)
			OR (sender = $2 AND recipient = $1)
		)
	)
	`

	rows, err := db.conn.Query(query, userId1, userId2, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sender, ch, content, msgType string
		var timestamp int64
		var recipient, nickname *string

		if err := rows.Scan(&id, &sender, &ch, &content, &msgType, &timestamp, &recipient, &nickname); err != nil {
			return nil, err
		}

		msg := map[string]interface{}{
			"id":        id,
			"sender":    sender,
			"channel":   ch,
			"content":   content,
			"type":      msgType,
			"timestamp": timestamp,
			"recipient": recipient,
			"nickname":  nickname,
		}
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// GetUserMessages retrieves all messages for a user
func (db *Database) GetUserMessages(userId string) ([]map[string]interface{}, error) {
	query := `
	SELECT id, sender, channel, content, type, timestamp, recipient, nickname
	FROM messages
	WHERE sender = $1 OR recipient = $1
	ORDER BY timestamp ASC
	`

	rows, err := db.conn.Query(query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sender, ch, content, msgType string
		var timestamp int64
		var recipient, nickname *string

		if err := rows.Scan(&id, &sender, &ch, &content, &msgType, &timestamp, &recipient, &nickname); err != nil {
			return nil, err
		}

		msg := map[string]interface{}{
			"id":        id,
			"sender":    sender,
			"channel":   ch,
			"content":   content,
			"type":      msgType,
			"timestamp": timestamp,
			"recipient": recipient,
			"nickname":  nickname,
		}
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// GetMessageCount returns the count of messages in a channel
func (db *Database) GetMessageCount(channel string) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM messages WHERE channel = $1`
	err := db.conn.QueryRow(query, channel).Scan(&count)
	return count, err
}

// DeleteMessage deletes a message by ID
func (db *Database) DeleteMessage(id string) error {
	query := `DELETE FROM messages WHERE id = $1`
	_, err := db.conn.Exec(query, id)
	return err
}

// ClearChannel clears all messages in a channel
func (db *Database) ClearChannel(channel string) error {
	query := `DELETE FROM messages WHERE channel = $1`
	_, err := db.conn.Exec(query, channel)
	return err
}

// SaveReadStatus upserts the last-read timestamp for a user in a channel
func (db *Database) SaveReadStatus(userID, channel string, lastReadTimestamp int64) error {
	query := `
	INSERT INTO read_status (user_id, channel, last_read_timestamp, updated_at)
	VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
	ON CONFLICT (user_id, channel) DO UPDATE
		SET last_read_timestamp = EXCLUDED.last_read_timestamp,
		    updated_at = CURRENT_TIMESTAMP
	`
	_, err := db.conn.Exec(query, userID, channel, lastReadTimestamp)
	return err
}

// GetReadStatus returns the last-read timestamp for a user in a channel
func (db *Database) GetReadStatus(userID, channel string) (int64, error) {
	var ts int64
	query := `SELECT last_read_timestamp FROM read_status WHERE user_id = $1 AND channel = $2`
	err := db.conn.QueryRow(query, userID, channel).Scan(&ts)
	if err != nil {
		return 0, err // returns 0 if no row (user never read this channel)
	}
	return ts, nil
}

// GetAllReadStatus returns all read statuses for a user (all channels)
func (db *Database) GetAllReadStatus(userID string) (map[string]int64, error) {
	query := `SELECT channel, last_read_timestamp FROM read_status WHERE user_id = $1`
	rows, err := db.conn.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]int64)
	for rows.Next() {
		var channel string
		var ts int64
		if err := rows.Scan(&channel, &ts); err != nil {
			return nil, err
		}
		result[channel] = ts
	}
	return result, rows.Err()
}

// GetUnreadCounts returns unread message counts per channel for a user
func (db *Database) GetUnreadCounts(userID string) (map[string]int, error) {
	// For each channel/DM, count messages newer than the user's last-read timestamp
	// Messages sent by the user themselves are excluded
	query := `
	SELECT m.channel, COUNT(*) as unread
	FROM messages m
	LEFT JOIN read_status rs ON rs.user_id = $1 AND rs.channel = m.channel
	WHERE m.sender != $1
	  AND m.timestamp > COALESCE(rs.last_read_timestamp, 0)
	GROUP BY m.channel
	`
	rows, err := db.conn.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]int)
	for rows.Next() {
		var channel string
		var count int
		if err := rows.Scan(&channel, &count); err != nil {
			return nil, err
		}
		result[channel] = count
	}
	return result, rows.Err()
}

// GetTotalUnreadCount returns the total unread message count across all channels for a user
func (db *Database) GetTotalUnreadCount(userID string) (int, error) {
	query := `
	SELECT COUNT(*) as total_unread
	FROM messages m
	LEFT JOIN read_status rs ON rs.user_id = $1 AND rs.channel = m.channel
	WHERE m.sender != $1
	  AND m.timestamp > COALESCE(rs.last_read_timestamp, 0)
	`
	var count int
	err := db.conn.QueryRow(query, userID).Scan(&count)
	return count, err
}

// Close closes the database connection
func (db *Database) Close() error {
	if db.conn != nil {
		return db.conn.Close()
	}
	return nil
}
