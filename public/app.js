// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed'));
    });
}

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const adminPasswordScreen = document.getElementById('admin-password-screen');
const chatScreen = document.getElementById('chat-screen');
const adminScreen = document.getElementById('admin-screen');
const kickedScreen = document.getElementById('kicked-screen');

const nicknameInput = document.getElementById('nickname-input');
const joinBtn = document.getElementById('join-btn');
const adminPasswordInput = document.getElementById('admin-password-input');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminError = document.getElementById('admin-error');

const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const userCountEl = document.getElementById('user-count');
const connectionStatus = document.getElementById('connection-status');
const typingIndicator = document.getElementById('typing-indicator');

// Admin elements
const usersList = document.getElementById('users-list');
const adminUserCount = document.getElementById('admin-user-count');
const adminMessagesContainer = document.getElementById('admin-messages-container');
const adminMessageInput = document.getElementById('admin-message-input');
const adminSendBtn = document.getElementById('admin-send-btn');
const adminOnlineCount = document.getElementById('admin-online-count');
const adminConnectionStatus = document.getElementById('admin-connection-status');
const adminTypingIndicator = document.getElementById('admin-typing-indicator');

// State
let socket;
let myNickname = '';
let isAdmin = false;
let typingTimeout;
const ADMIN_NICKNAME = 'dipuda181205';

// Initialize Socket.IO
function initSocket() {
    socket = io(window.location.origin, {
        transports: ['websocket', 'polling']
    });

    // Connection status
    socket.on('connect', () => {
        console.log('Connected to server');
        if (isAdmin) {
            adminConnectionStatus.classList.remove('offline');
        } else {
            connectionStatus.classList.remove('offline');
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        if (isAdmin) {
            adminConnectionStatus.classList.add('offline');
        } else {
            connectionStatus.classList.add('offline');
        }
    });

    // Admin password required
    socket.on('admin_password_required', () => {
        welcomeScreen.classList.remove('active');
        adminPasswordScreen.classList.add('active');
        adminPasswordInput.focus();
    });

    // Not admin
    socket.on('not_admin', () => {
        socket.emit('join_chat', myNickname);
    });

    // Admin login success
    socket.on('admin_login_success', () => {
        isAdmin = true;
        adminPasswordScreen.classList.remove('active');
        adminScreen.classList.add('active');
        adminMessageInput.focus();
    });

    // Admin login failed
    socket.on('admin_login_failed', () => {
        adminError.style.display = 'block';
        adminLoginBtn.disabled = false;
    });

    // Load existing messages
    socket.on('load_messages', (messages) => {
        messages.forEach(msg => {
            addMessage(msg, msg.nickname === (isAdmin ? 'Admin' : myNickname));
        });
        scrollToBottom();
    });

    // New message
    socket.on('new_message', (message) => {
        addMessage(message, message.nickname === (isAdmin ? 'Admin' : myNickname));
        scrollToBottom();
    });

    // Message deleted
    socket.on('message_deleted', (messageId) => {
        const msgEl = document.querySelector(`[data-id="${messageId}"]`);
        if (msgEl) {
            msgEl.remove();
        }
    });

    // Message edited
    socket.on('message_edited', (data) => {
        const msgEl = document.querySelector(`[data-id="${data.id}"]`);
        if (msgEl) {
            const contentEl = msgEl.querySelector('.message-content');
            if (contentEl) {
                contentEl.textContent = data.newText;
            }
            // Add edited indicator if not exists
            if (!msgEl.querySelector('.message-edited')) {
                const editedEl = document.createElement('span');
                editedEl.className = 'message-edited';
                editedEl.textContent = '(edited)';
                msgEl.appendChild(editedEl);
            }
        }
    });

    // User renamed
    socket.on('user_renamed', (data) => {
        addSystemMessage(`${data.oldNickname} is now ${data.newNickname}`);
    });

    // User joined
    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.nickname} joined the chat`);
        updateUserCount(data.userCount);
        scrollToBottom();
    });

    // User left
    socket.on('user_left', (data) => {
        addSystemMessage(`${data.nickname} left the chat`);
        updateUserCount(data.userCount);
        scrollToBottom();
    });

    // User count update
    socket.on('user_count', (count) => {
        updateUserCount(count);
    });

    // Nickname taken
    socket.on('nickname_taken', () => {
        alert('This nickname is already taken. Please choose another one.');
        joinBtn.disabled = false;
    });

    // Typing indicator
    socket.on('user_typing', (data) => {
        const indicator = isAdmin ? adminTypingIndicator : typingIndicator;
        if (data.isTyping) {
            indicator.querySelector('span').textContent = data.nickname;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    });

    // Kicked
    socket.on('kicked', () => {
        chatScreen.classList.remove('active');
        adminScreen.classList.remove('active');
        kickedScreen.classList.add('active');
    });

    // Admin: Users list
    socket.on('users_list', (users) => {
        renderUsersList(users);
    });

    // Admin: User connected
    socket.on('user_connected', (user) => {
        socket.emit('get_users');
    });

    // Admin: User disconnected
    socket.on('user_disconnected', (data) => {
        socket.emit('get_users');
    });

    // Error
    socket.on('error', (message) => {
        console.error('Socket error:', message);
    });
}

// Update user count
function updateUserCount(count) {
    if (userCountEl) userCountEl.textContent = count;
    if (adminOnlineCount) adminOnlineCount.textContent = count;
    if (adminUserCount) adminUserCount.textContent = `${count} users`;
}

// Render users list (admin only)
function renderUsersList(users) {
    if (!usersList) return;

    usersList.innerHTML = '';
    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'user-item';
        userEl.innerHTML = `
            <div class="user-info">
                <div class="user-nickname" style="color: ${user.color}">${user.nickname}</div>
                <div class="user-ip">${user.ip}</div>
            </div>
            ${!user.isAdmin ? `
            <div class="user-actions">
                <button class="action-btn rename" onclick="renameUser('${user.id}', '${user.nickname}')">Rename</button>
                <button class="action-btn kick" onclick="kickUser('${user.id}')">Kick</button>
            </div>
            ` : '<span style="color: #ffd700; font-size: 0.75rem;">ADMIN</span>'}
        `;
        usersList.appendChild(userEl);
    });
}

// Admin: Rename user
window.renameUser = function (oderId, currentName) {
    const newName = prompt('Enter new nickname:', currentName);
    if (newName && newName.trim() && newName !== currentName) {
        socket.emit('rename_user', { oderId, newNickname: newName.trim() });
        socket.emit('get_users');
    }
};

// Admin: Kick user
window.kickUser = function (oderId) {
    if (confirm('Are you sure you want to kick this user?')) {
        socket.emit('kick_user', oderId);
    }
};

// Admin: Delete message
window.deleteMessage = function (messageId) {
    if (confirm('Delete this message?')) {
        socket.emit('delete_message', messageId);
    }
};

// Admin: Edit message
window.editMessage = function (messageId) {
    const msgEl = document.querySelector(`[data-id="${messageId}"]`);
    if (msgEl) {
        const contentEl = msgEl.querySelector('.message-content');
        const currentText = contentEl.textContent;
        const newText = prompt('Edit message:', currentText);
        if (newText && newText.trim() && newText !== currentText) {
            socket.emit('edit_message', { messageId, newText: newText.trim() });
        }
    }
};

// Join chat
joinBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();

    if (nickname.length < 3) {
        alert('Nickname must be at least 3 characters');
        return;
    }

    myNickname = nickname;
    joinBtn.disabled = true;

    // Initialize socket if not already
    if (!socket) {
        initSocket();
    }

    // Check if admin nickname
    if (nickname === ADMIN_NICKNAME) {
        socket.emit('check_admin', nickname);
    } else {
        socket.emit('join_chat', nickname);

        // Switch to chat screen
        setTimeout(() => {
            welcomeScreen.classList.remove('active');
            chatScreen.classList.add('active');
            messageInput.focus();
        }, 300);
    }
});

// Admin login
adminLoginBtn.addEventListener('click', () => {
    const password = adminPasswordInput.value;
    adminLoginBtn.disabled = true;
    adminError.style.display = 'none';

    socket.emit('admin_login', {
        nickname: ADMIN_NICKNAME,
        password: password
    });
});

adminPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        adminLoginBtn.click();
    }
});

// Send message (regular user)
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    socket.emit('send_message', text);
    messageInput.value = '';
    socket.emit('typing', false);
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Send message (admin)
function sendAdminMessage() {
    const text = adminMessageInput.value.trim();
    if (!text) return;

    socket.emit('send_message', text);
    adminMessageInput.value = '';
    socket.emit('typing', false);
}

adminSendBtn.addEventListener('click', sendAdminMessage);
adminMessageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAdminMessage();
});

// Typing indicator
messageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
});

adminMessageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
});

// Add message to UI
function addMessage(message, isOwn) {
    const container = isAdmin ? adminMessagesContainer : messagesContainer;

    const messageEl = document.createElement('div');
    messageEl.className = `message ${isOwn ? 'own' : 'other'}`;
    messageEl.setAttribute('data-id', message.id);

    const header = document.createElement('div');
    header.className = 'message-header';

    const nickname = document.createElement('span');
    nickname.className = 'message-nickname';
    nickname.textContent = message.nickname;
    nickname.style.color = message.color;

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime(message.timestamp);

    header.appendChild(nickname);
    header.appendChild(time);

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message.text;

    messageEl.appendChild(header);
    messageEl.appendChild(content);

    // Add edited indicator if message was edited
    if (message.edited) {
        const editedEl = document.createElement('span');
        editedEl.className = 'message-edited';
        editedEl.textContent = '(edited)';
        messageEl.appendChild(editedEl);
    }

    // Admin: Add action buttons
    if (isAdmin && !isOwn) {
        const actions = document.createElement('div');
        actions.className = 'admin-msg-actions';
        actions.innerHTML = `
            <button class="admin-msg-btn edit" onclick="editMessage('${message.id}')">Edit</button>
            <button class="admin-msg-btn delete" onclick="deleteMessage('${message.id}')">Delete</button>
        `;
        messageEl.appendChild(actions);
    }

    container.appendChild(messageEl);
}

// Add system message
function addSystemMessage(text) {
    const container = isAdmin ? adminMessagesContainer : messagesContainer;

    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    messageEl.textContent = text;
    container.appendChild(messageEl);
}

// Format timestamp
function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;

    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Scroll to bottom
function scrollToBottom() {
    const container = isAdmin ? adminMessagesContainer : messagesContainer;
    container.scrollTop = container.scrollHeight;
}

// Enter nickname on Enter key
nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});
