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

// Admin credentials
const ADMIN_NICKNAME = 'dipuda181205';
const ADMIN_PASSWORD = 'Dg@18122005';

// In-memory storage
const users = new Map(); // socket.id -> {nickname, color, ip, isAdmin}
const userHistory = []; // Array of all users who ever connected {nickname, ip, joinTime, leaveTime}
const messages = []; // Array of messages (keep last 100)
const MAX_MESSAGES = 100;
const MAX_HISTORY = 500;

// Generate random color for user
function getRandomColor() {
    const colors = [
        '#8b5cf6', '#a78bfa', '#7c3aed', '#6366f1',
        '#818cf8', '#67e8f9', '#22d3ee', '#06b6d4',
        '#14b8a6', '#2dd4bf', '#a5b4fc', '#c4b5fd'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Get client IP address
function getClientIP(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return socket.handshake.address || 'Unknown';
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    const clientIP = getClientIP(socket);
    console.log('User connected:', socket.id, 'IP:', clientIP);

    // Check if nickname is admin
    socket.on('check_admin', (nickname) => {
        if (nickname === ADMIN_NICKNAME) {
            socket.emit('admin_password_required');
        } else {
            socket.emit('not_admin');
        }
    });

    // Admin login
    socket.on('admin_login', (data) => {
        if (data.nickname === ADMIN_NICKNAME && data.password === ADMIN_PASSWORD) {
            const userColor = '#a855f7'; // Purple for admin
            users.set(socket.id, {
                nickname: 'Admin',
                color: userColor,
                ip: clientIP,
                isAdmin: true
            });

            // Add to history
            userHistory.push({
                nickname: 'Admin',
                ip: clientIP,
                joinTime: Date.now(),
                leaveTime: null,
                isAdmin: true
            });
            if (userHistory.length > MAX_HISTORY) userHistory.shift();

            socket.emit('admin_login_success');
            socket.emit('load_messages', messages);

            // Send current users list to admin
            const usersList = Array.from(users.entries()).map(([id, user]) => ({
                id,
                nickname: user.nickname,
                ip: user.ip,
                color: user.color,
                isAdmin: user.isAdmin
            }));
            socket.emit('users_list', usersList);

            // Send user history
            socket.emit('user_history', userHistory);

            io.emit('user_joined', {
                nickname: 'Admin',
                userCount: users.size
            });
            io.emit('user_count', users.size);

            console.log('Admin logged in. IP:', clientIP);
        } else {
            socket.emit('admin_login_failed');
        }
    });

    // User joins with nickname
    socket.on('join_chat', (nickname) => {
        // Sanitize nickname
        nickname = nickname.trim().substring(0, 20);

        if (!nickname) {
            socket.emit('error', 'Nickname required');
            return;
        }

        // Block admin nickname from regular join
        if (nickname === ADMIN_NICKNAME) {
            socket.emit('error', 'Invalid nickname');
            return;
        }

        // Check if nickname is taken
        const nicknames = Array.from(users.values()).map(u => u.nickname.toLowerCase());
        if (nicknames.includes(nickname.toLowerCase())) {
            socket.emit('nickname_taken');
            return;
        }

        const userColor = getRandomColor();
        users.set(socket.id, {
            nickname,
            color: userColor,
            ip: clientIP,
            isAdmin: false
        });

        // Add to history
        userHistory.push({
            nickname,
            ip: clientIP,
            joinTime: Date.now(),
            leaveTime: null,
            isAdmin: false
        });
        if (userHistory.length > MAX_HISTORY) userHistory.shift();

        // Send existing messages to new user
        socket.emit('load_messages', messages);

        // Broadcast user joined
        io.emit('user_joined', {
            nickname,
            userCount: users.size
        });

        // Send user count update
        io.emit('user_count', users.size);

        // Notify admins of new user
        broadcastToAdmins('user_connected', {
            id: socket.id,
            nickname,
            ip: clientIP,
            color: userColor
        });

        console.log(`${nickname} joined. IP: ${clientIP}. Total users: ${users.size}`);
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
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            oderId: socket.id,
            nickname: user.nickname,
            color: user.color,
            text,
            timestamp: Date.now(),
            isAdmin: user.isAdmin
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

    // Admin: Get all users
    socket.on('get_users', () => {
        const user = users.get(socket.id);
        if (user && user.isAdmin) {
            const usersList = Array.from(users.entries()).map(([id, u]) => ({
                id,
                nickname: u.nickname,
                ip: u.ip,
                color: u.color,
                isAdmin: u.isAdmin
            }));
            socket.emit('users_list', usersList);
        }
    });

    // Admin: Get user history
    socket.on('get_history', () => {
        const user = users.get(socket.id);
        if (user && user.isAdmin) {
            socket.emit('user_history', userHistory);
        }
    });

    // Admin: Delete message (can delete any message including own)
    socket.on('delete_message', (messageId) => {
        const user = users.get(socket.id);
        if (user && user.isAdmin) {
            const index = messages.findIndex(m => m.id === messageId);
            if (index !== -1) {
                messages.splice(index, 1);
                io.emit('message_deleted', messageId);
                console.log('Admin deleted message:', messageId);
            }
        }
    });

    // Admin: Edit message
    socket.on('edit_message', (data) => {
        const user = users.get(socket.id);
        if (user && user.isAdmin) {
            const message = messages.find(m => m.id === data.messageId);
            if (message) {
                message.text = data.newText.trim().substring(0, 500);
                message.edited = true;
                io.emit('message_edited', {
                    id: message.id,
                    newText: message.text,
                    edited: true
                });
                console.log('Admin edited message:', data.messageId);
            }
        }
    });

    // Admin: Rename user (including self)
    socket.on('rename_user', (data) => {
        const adminUser = users.get(socket.id);
        if (adminUser && adminUser.isAdmin) {
            const targetUser = users.get(data.oderId);
            if (targetUser) {
                const oldNickname = targetUser.nickname;
                targetUser.nickname = data.newNickname.trim().substring(0, 20);
                io.emit('user_renamed', {
                    oderId: data.oderId,
                    oldNickname,
                    newNickname: targetUser.nickname
                });
                console.log('Admin renamed user:', oldNickname, '->', targetUser.nickname);
            }
        }
    });

    // Admin: Kick user
    socket.on('kick_user', (oderId) => {
        const adminUser = users.get(socket.id);
        if (adminUser && adminUser.isAdmin) {
            const targetSocket = io.sockets.sockets.get(oderId);
            if (targetSocket) {
                const targetUser = users.get(oderId);
                targetSocket.emit('kicked');
                targetSocket.disconnect(true);
                console.log('Admin kicked user:', targetUser?.nickname);
            }
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);

        if (user) {
            // Update history with leave time
            const historyEntry = userHistory.find(h =>
                h.nickname === user.nickname &&
                h.ip === user.ip &&
                h.leaveTime === null
            );
            if (historyEntry) {
                historyEntry.leaveTime = Date.now();
            }

            users.delete(socket.id);

            // Broadcast user left
            io.emit('user_left', {
                nickname: user.nickname,
                userCount: users.size
            });

            // Send user count update
            io.emit('user_count', users.size);

            // Notify admins
            broadcastToAdmins('user_disconnected', {
                id: socket.id,
                nickname: user.nickname
            });

            console.log(`${user.nickname} left. Total users: ${users.size}`);
        }
    });
});

// Helper to broadcast to admins only
function broadcastToAdmins(event, data) {
    users.forEach((user, oderId) => {
        if (user.isAdmin) {
            const adminSocket = io.sockets.sockets.get(oderId);
            if (adminSocket) {
                adminSocket.emit(event, data);
            }
        }
    });
}

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`🔥 Daddy Diablo Chatroom server running on port ${PORT}`);
});
