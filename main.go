package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
)

// Global database instance
var globalDB *Database

func main() {
	log.Println("✅ Initializing WebSocket server with PostgreSQL for API routes")

	// Initialize database for API routes (frontend controls persistence logic)
	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		dbConnStr = "postgresql://innervoicechat:VGXSZ6Chh47hASufcxKANXCYIoTXJyln@dpg-d5skjn5actks73bl0o60-a.virginia-postgres.render.com/innervoicechat"
	}

	db, err := NewDatabase(dbConnStr)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	if err := db.InitSchema(); err != nil {
		log.Fatalf("Failed to initialize database schema: %v", err)
	}

	globalDB = db
	log.Println("✅ PostgreSQL initialized for API routes")

	// Initialize server with custom configuration
	config := ServerConfig{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		MaxConnections:  10000,
		PingInterval:    30 * time.Second,
		PongWait:        60 * time.Second,
	}

	server := NewServer(config)

	// Set global server reference for handlers
	globalServer = server

	// Register message handlers
	server.RegisterHandler(MessageTypeChat, ChatHandler)
	server.RegisterHandler(MessageTypeChatGroup, GroupChatHandler)
	server.RegisterHandler(MessageTypeChatPrivate, PrivateChatHandler)
	server.RegisterHandler(MessageTypeNotification, NotificationHandler)
	server.RegisterHandler(MessageTypeAlert, AlertHandler)
	server.RegisterHandler(MessageTypeEvent, EventHandler)
	server.RegisterHandler(MessageTypeUserJoined, UserJoinedHandler)
	server.RegisterHandler(MessageTypeUserLeft, UserLeftHandler)
	server.RegisterHandler(MessageTypeTyping, TypingHandler)
	server.RegisterHandler(MessageTypePresence, PresenceHandler)
	server.RegisterHandler(MessageTypeAck, AckHandler)

	// Register hooks
	server.RegisterBeforeMessageHook(DefaultBeforeHook)
	server.RegisterAfterMessageHook(DefaultAfterHook)
	server.RegisterOnConnectHook(OnConnect)
	server.RegisterOnDisconnectHook(OnDisconnect)

	// Start message processing goroutine
	go server.ProcessMessages()

	// Setup HTTP routes with CORS
	setupRoutes(server)

	// Create CORS middleware
	corsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Continue to the actual handler
		http.DefaultServeMux.ServeHTTP(w, r)
	})

	// Start HTTP server with CORS wrapper
	port := ":8080"
	log.Printf("WebSocket server starting on http://localhost%s", port)
	if err := http.ListenAndServe(port, corsHandler); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// setupRoutes configures HTTP endpoints
func setupRoutes(server *Server) {
	// WebSocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers for WebSocket
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Get or generate user ID
		userID := r.URL.Query().Get("user_id")
		if userID == "" {
			userID = "user_" + uuid.New().String()[:8]
		}

		// Generate connection ID
		connID := "conn_" + uuid.New().String()[:12]

		// Handle the connection
		if err := server.HandleConnection(w, r, connID, userID); err != nil {
			log.Printf("Connection error: %v", err)
		}
	})

	// All message storage and retrieval now handled client-side with IndexedDB
	// Server only handles WebSocket connections and real-time messaging

	// Health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		conns := server.GetConnections()
		fmt.Fprintf(w, `{"status": "ok", "active_connections": %d}`, len(conns))
	})

	// Serve HTML test client
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, htmlClient)
	})
}

const htmlClient = `<!DOCTYPE html>
<html>
<head>
	<title>Go WebSocket Client</title>
	<style>
		body { font-family: Arial; max-width: 800px; margin: 50px auto; }
		#status { padding: 10px; margin: 10px 0; border-radius: 5px; }
		#status.connected { background: #d4edda; color: #155724; }
		#status.disconnected { background: #f8d7da; color: #721c24; }
		input[type="text"], textarea { width: 100%; padding: 8px; margin: 5px 0; }
		button { padding: 10px 20px; margin: 5px; cursor: pointer; }
		#messages { border: 1px solid #ccc; height: 300px; overflow-y: auto; padding: 10px; margin: 10px 0; }
		.message { padding: 5px; margin: 5px 0; border-left: 3px solid #007bff; padding-left: 10px; }
	</style>
</head>
<body>
	<h1>Go WebSocket Chat & Notifications Demo</h1>

	<div id="status" class="disconnected">Disconnected</div>

	<div>
		<label>User ID:</label>
		<input type="text" id="userId" placeholder="Enter your user ID (optional)" />
	</div>

	<div>
		<label>Message Type:</label>
		<select id="msgType">
			<option value="chat:private">Private Chat</option>
			<option value="chat:group">Group Chat</option>
			<option value="notification">Notification</option>
			<option value="event:custom">Custom Event</option>
			<option value="system:typing">Typing Indicator</option>
			<option value="system:presence">Presence</option>
		</select>
	</div>

	<div>
		<label>Channel (for group messages):</label>
		<input type="text" id="channel" placeholder="Channel name" />
	</div>

	<div>
		<label>Recipient (for private messages):</label>
		<input type="text" id="recipient" placeholder="User ID to send to" />
	</div>

	<div>
		<label>Message:</label>
		<textarea id="message" placeholder="Enter your message" rows="3"></textarea>
	</div>

	<button onclick="sendMessage()">Send</button>
	<button onclick="toggleConnection()">Connect/Disconnect</button>
	<button onclick="clearMessages()">Clear Messages</button>

	<h3>Messages:</h3>
	<div id="messages"></div>

	<script>
		let ws = null;
		let userId = '';

		function toggleConnection() {
			if (ws) {
				ws.close();
				ws = null;
			} else {
				connect();
			}
		}

		function connect() {
			userId = document.getElementById('userId').value || 'user_' + Math.random().toString(36).substr(2, 8);
			const wsUrl = 'ws://localhost:8080/ws?user_id=' + userId;
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				updateStatus(true);
				addMessage('System', 'Connected as: ' + userId, 'system');
			};

			ws.onmessage = (event) => {
				const msg = JSON.parse(event.data);
				addMessage(msg.sender, JSON.stringify(msg.payload), msg.type);
			};

			ws.onerror = (error) => {
				addMessage('Error', error.message, 'error');
			};

			ws.onclose = () => {
				updateStatus(false);
				addMessage('System', 'Disconnected', 'system');
			};
		}

		function sendMessage() {
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				alert('Not connected');
				return;
			}

			const msgType = document.getElementById('msgType').value;
			const message = document.getElementById('message').value;
			const channel = document.getElementById('channel').value;
			const recipient = document.getElementById('recipient').value;

			if (!message) {
				alert('Enter a message');
				return;
			}

			const msg = {
				id: 'msg_' + Date.now(),
				type: msgType,
				sender: userId,
				channel: channel || undefined,
				recipient: recipient || undefined,
				payload: { text: message },
				timestamp: Math.floor(Date.now() / 1000)
			};

			ws.send(JSON.stringify(msg));
			addMessage('You', message, msgType);
			document.getElementById('message').value = '';
		}

		function addMessage(sender, text, type) {
			const messagesDiv = document.getElementById('messages');
			const msgDiv = document.createElement('div');
			msgDiv.className = 'message';
			msgDiv.innerHTML = '<strong>' + sender + ' (' + type + '):</strong> ' + escapeHtml(text);
			messagesDiv.appendChild(msgDiv);
			messagesDiv.scrollTop = messagesDiv.scrollHeight;
		}

		function updateStatus(connected) {
			const status = document.getElementById('status');
			if (connected) {
				status.textContent = 'Connected';
				status.className = 'connected';
			} else {
				status.textContent = 'Disconnected';
				status.className = 'disconnected';
			}
		}

		function clearMessages() {
			document.getElementById('messages').innerHTML = '';
		}

		function escapeHtml(text) {
			const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
			return text.replace(/[&<>"']/g, m => map[m]);
		}

		// Auto-connect on page load
		window.onload = () => {
			addMessage('System', 'Click "Connect" to start', 'system');
		};
	</script>
</body>
</html>`
