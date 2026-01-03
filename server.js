const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static('public'));

// In-memory storage
const users = new Map(); // socket.id -> {nickname, color}
const messages = []; // Array of messages (keep last 100)
const MAX_MESSAGES = 100;

// Generate random color for user
function getRandomColor() {
    const colors = [
        '#e94560', '#ff6b6b', '#4ecdc4', '#45b7d1',
        '#96ceb4', '#ffeaa7', '#dfe6e9', '#a29bfe',
        '#fd79a8', '#fdcb6e', '#6c5ce7', '#00b894'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User joins with nickname
    socket.on('join_chat', (nickname) => {
        // Sanitize nickname
        nickname = nickname.trim().substring(0, 20);

        if (!nickname) {
            socket.emit('error', 'Nickname required');
            return;
        }

        // Check if nickname is taken
        const nicknames = Array.from(users.values()).map(u => u.nickname.toLowerCase());
        if (nicknames.includes(nickname.toLowerCase())) {
            socket.emit('nickname_taken');
            return;
        }

        const userColor = getRandomColor();
        users.set(socket.id, { nickname, color: userColor });

        // Send existing messages to new user
        socket.emit('load_messages', messages);

        // Broadcast user joined
        io.emit('user_joined', {
            nickname,
            userCount: users.size
        });

        // Send user count update
        io.emit('user_count', users.size);

        console.log(`${nickname} joined. Total users: ${users.size}`);
    });

    // Handle new message
    socket.on('send_message', (text) => {
        const user = users.get(socket.id);

        if (!user) {
            socket.emit('error', 'Not joined');
            return;
        }

        // Sanitize message
        text = text.trim().substring(0, 500);

        if (!text) return;

        const message = {
            id: Date.now() + Math.random(),
            nickname: user.nickname,
            color: user.color,
            text,
            timestamp: Date.now()
        };

        // Add to messages array
        messages.push(message);

        // Keep only last 100 messages
        if (messages.length > MAX_MESSAGES) {
            messages.shift();
        }

        // Broadcast to all clients
        io.emit('new_message', message);
    });

    // Handle typing indicator
    socket.on('typing', (isTyping) => {
        const user = users.get(socket.id);
        if (user) {
            socket.broadcast.emit('user_typing', {
                nickname: user.nickname,
                isTyping
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);

        if (user) {
            users.delete(socket.id);

            // Broadcast user left
            io.emit('user_left', {
                nickname: user.nickname,
                userCount: users.size
            });

            // Send user count update
            io.emit('user_count', users.size);

            console.log(`${user.nickname} left. Total users: ${users.size}`);
        }
    });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`🔥 Diablo Chat server running on port ${PORT}`);
});
