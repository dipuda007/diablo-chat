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
const historyList = document.getElementById('history-list');
const adminUserCount = document.getElementById('admin-user-count');
const adminMessagesContainer = document.getElementById('admin-messages-container');
const adminMessageInput = document.getElementById('admin-message-input');
const adminSendBtn = document.getElementById('admin-send-btn');
const adminOnlineCount = document.getElementById('admin-online-count');
const adminConnectionStatus = document.getElementById('admin-connection-status');
const adminTypingIndicator = document.getElementById('admin-typing-indicator');
const adminTabs = document.querySelectorAll('.admin-tab');

// State
let socket;
let myNickname = '';
let mySocketId = '';
let isAdmin = false;
let typingTimeout;
const ADMIN_NICKNAME = 'dipuda181205';

// Initialize Socket.IO
function initSocket() {
    socket = io(window.location.origin, {
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        mySocketId = socket.id;
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

    socket.on('admin_password_required', () => {
        welcomeScreen.classList.remove('active');
        adminPasswordScreen.classList.add('active');
        adminPasswordInput.focus();
    });

    socket.on('not_admin', () => {
        socket.emit('join_chat', myNickname);
    });

    socket.on('admin_login_success', () => {
        isAdmin = true;
        mySocketId = socket.id;
        adminPasswordScreen.classList.remove('active');
        adminScreen.classList.add('active');
        adminMessageInput.focus();
    });

    socket.on('admin_login_failed', () => {
        adminError.style.display = 'block';
        adminLoginBtn.disabled = false;
    });

    socket.on('load_messages', (messages) => {
        messages.forEach(msg => {
            const isOwn = isAdmin ? msg.isAdmin : (msg.nickname === myNickname);
            addMessage(msg, isOwn);
        });
        scrollToBottom();
    });

    socket.on('new_message', (message) => {
        const isOwn = isAdmin ? message.isAdmin : (message.nickname === myNickname);
        addMessage(message, isOwn);
        scrollToBottom();
    });

    socket.on('message_deleted', (messageId) => {
        document.querySelectorAll(`[data-id="${messageId}"]`).forEach(el => el.remove());
    });

    socket.on('message_edited', (data) => {
        document.querySelectorAll(`[data-id="${data.id}"]`).forEach(msgEl => {
            const contentEl = msgEl.querySelector('.message-content');
            if (contentEl) {
                contentEl.textContent = data.newText;
            }
            if (!msgEl.querySelector('.message-edited')) {
                const editedEl = document.createElement('span');
                editedEl.className = 'message-edited';
                editedEl.textContent = '(edited)';
                msgEl.appendChild(editedEl);
            }
        });
    });

    socket.on('user_renamed', (data) => {
        addSystemMessage(`${data.oldNickname} is now ${data.newNickname}`);
        if (data.oderId === mySocketId) {
            myNickname = data.newNickname;
        }
    });

    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.nickname} joined`);
        updateUserCount(data.userCount);
        scrollToBottom();
    });

    socket.on('user_left', (data) => {
        addSystemMessage(`${data.nickname} left`);
        updateUserCount(data.userCount);
        scrollToBottom();
    });

    socket.on('user_count', (count) => {
        updateUserCount(count);
    });

    socket.on('nickname_taken', () => {
        alert('Nickname already taken. Choose another.');
        joinBtn.disabled = false;
    });

    socket.on('user_typing', (data) => {
        const indicator = isAdmin ? adminTypingIndicator : typingIndicator;
        if (data.isTyping) {
            indicator.querySelector('span').textContent = data.nickname;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    });

    socket.on('kicked', () => {
        chatScreen.classList.remove('active');
        adminScreen.classList.remove('active');
        kickedScreen.classList.add('active');
    });

    socket.on('users_list', (users) => {
        renderUsersList(users);
    });

    socket.on('user_history', (history) => {
        renderHistoryList(history);
    });

    socket.on('user_connected', () => {
        socket.emit('get_users');
        socket.emit('get_history');
    });

    socket.on('user_disconnected', () => {
        socket.emit('get_users');
        socket.emit('get_history');
    });

    socket.on('error', (message) => {
        console.error('Socket error:', message);
    });
}

function updateUserCount(count) {
    if (userCountEl) userCountEl.textContent = count;
    if (adminOnlineCount) adminOnlineCount.textContent = count;
    if (adminUserCount) adminUserCount.textContent = `${count} users online`;
}

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
            ${user.isAdmin ?
                '<span class="admin-badge">ADMIN</span>' :
                `<div class="user-actions">
                    <button class="action-btn rename" onclick="renameUser('${user.id}', '${user.nickname}')">Rename</button>
                    <button class="action-btn kick" onclick="kickUser('${user.id}')">Kick</button>
                </div>`
            }
        `;
        usersList.appendChild(userEl);
    });
}

function renderHistoryList(history) {
    if (!historyList) return;

    historyList.innerHTML = '';

    // Show most recent first
    const reversed = [...history].reverse();

    reversed.forEach(entry => {
        const historyEl = document.createElement('div');
        historyEl.className = 'history-item';

        const joinTime = new Date(entry.joinTime).toLocaleString();
        const leaveTime = entry.leaveTime ? new Date(entry.leaveTime).toLocaleString() : 'Online';
        const status = entry.leaveTime ? '🔴' : '🟢';

        historyEl.innerHTML = `
            <div class="user-info">
                <div class="user-nickname">${status} ${entry.nickname}</div>
                <div class="user-ip">${entry.ip}</div>
                <div class="user-time">Joined: ${joinTime}</div>
                <div class="user-time">Left: ${leaveTime}</div>
            </div>
        `;
        historyList.appendChild(historyEl);
    });
}

// Admin tabs
adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        adminTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabName = tab.dataset.tab;
        if (tabName === 'online') {
            usersList.classList.add('active');
            historyList.classList.remove('active');
            socket.emit('get_users');
        } else {
            usersList.classList.remove('active');
            historyList.classList.add('active');
            socket.emit('get_history');
        }
    });
});

window.renameUser = function (oderId, currentName) {
    const newName = prompt('Enter new nickname:', currentName);
    if (newName && newName.trim() && newName !== currentName) {
        socket.emit('rename_user', { oderId, newNickname: newName.trim() });
        setTimeout(() => socket.emit('get_users'), 100);
    }
};

window.kickUser = function (oderId) {
    if (confirm('Kick this user?')) {
        socket.emit('kick_user', oderId);
    }
};

window.deleteMessage = function (messageId) {
    socket.emit('delete_message', messageId);
};

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

joinBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();

    if (nickname.length < 3) {
        alert('Nickname must be at least 3 characters');
        return;
    }

    myNickname = nickname;
    joinBtn.disabled = true;

    if (!socket) {
        initSocket();
    }

    if (nickname === ADMIN_NICKNAME) {
        socket.emit('check_admin', nickname);
    } else {
        socket.emit('join_chat', nickname);

        setTimeout(() => {
            welcomeScreen.classList.remove('active');
            chatScreen.classList.add('active');
            messageInput.focus();
        }, 300);
    }
});

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
    if (e.key === 'Enter') adminLoginBtn.click();
});

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

messageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 1000);
});

adminMessageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 1000);
});

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

    if (message.edited) {
        const editedEl = document.createElement('span');
        editedEl.className = 'message-edited';
        editedEl.textContent = '(edited)';
        messageEl.appendChild(editedEl);
    }

    // Admin can edit/delete ALL messages including own
    if (isAdmin) {
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

function addSystemMessage(text) {
    const container = isAdmin ? adminMessagesContainer : messagesContainer;

    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    messageEl.textContent = text;
    container.appendChild(messageEl);
}

function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;

    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
    const container = isAdmin ? adminMessagesContainer : messagesContainer;
    container.scrollTop = container.scrollHeight;
}

nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});
