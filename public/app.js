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
const chatScreen = document.getElementById('chat-screen');
const nicknameInput = document.getElementById('nickname-input');
const joinBtn = document.getElementById('join-btn');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const userCountEl = document.getElementById('user-count');
const connectionStatus = document.getElementById('connection-status');
const typingIndicator = document.getElementById('typing-indicator');

// State
let socket;
let myNickname = '';
let typingTimeout;

// Initialize Socket.IO
function initSocket() {
    // Use window.location.origin for the socket connection
    socket = io(window.location.origin, {
        transports: ['websocket', 'polling']
    });

    // Connection status
    socket.on('connect', () => {
        console.log('Connected to server');
        connectionStatus.classList.remove('offline');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        connectionStatus.classList.add('offline');
    });

    // Load existing messages
    socket.on('load_messages', (messages) => {
        messages.forEach(msg => {
            addMessage(msg, msg.nickname === myNickname);
        });
        scrollToBottom();
    });

    // New message
    socket.on('new_message', (message) => {
        addMessage(message, message.nickname === myNickname);
        scrollToBottom();
    });

    // User joined
    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.nickname} joined the chat`);
        userCountEl.textContent = data.userCount;
        scrollToBottom();
    });

    // User left
    socket.on('user_left', (data) => {
        addSystemMessage(`${data.nickname} left the chat`);
        userCountEl.textContent = data.userCount;
        scrollToBottom();
    });

    // User count update
    socket.on('user_count', (count) => {
        userCountEl.textContent = count;
    });

    // Nickname taken
    socket.on('nickname_taken', () => {
        alert('This nickname is already taken. Please choose another one.');
        joinBtn.disabled = false;
    });

    // Typing indicator
    socket.on('user_typing', (data) => {
        if (data.isTyping) {
            typingIndicator.querySelector('span').textContent = data.nickname;
            typingIndicator.style.display = 'block';
        } else {
            typingIndicator.style.display = 'none';
        }
    });

    // Error
    socket.on('error', (message) => {
        console.error('Socket error:', message);
    });
}

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

    // Emit join event
    socket.emit('join_chat', nickname);

    // Switch to chat screen
    setTimeout(() => {
        welcomeScreen.classList.remove('active');
        chatScreen.classList.add('active');
        messageInput.focus();
    }, 500);
});

// Send message
function sendMessage() {
    const text = messageInput.value.trim();

    if (!text) return;

    socket.emit('send_message', text);
    messageInput.value = '';

    // Stop typing indicator
    socket.emit('typing', false);
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Typing indicator
messageInput.addEventListener('input', () => {
    socket.emit('typing', true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
});

// Add message to UI
function addMessage(message, isOwn) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isOwn ? 'own' : 'other'}`;

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
    messagesContainer.appendChild(messageEl);
}

// Add system message
function addSystemMessage(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    messageEl.textContent = text;
    messagesContainer.appendChild(messageEl);
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
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Enter nickname on Enter key
nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});
