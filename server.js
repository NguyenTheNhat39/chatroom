const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms and users
const rooms = new Map();
const users = new Map();

// Handle socket connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room
  socket.on('join-room', (data) => {
    const { roomId, nickname } = data;
    
    // Leave previous room if any
    if (socket.roomId) {
      socket.leave(socket.roomId);
      removeUserFromRoom(socket.roomId, socket.id);
    }

    // Join new room
    socket.join(roomId);
    socket.roomId = roomId;
    socket.nickname = nickname;

    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        messages: []
      });
    }

    // Add user to room
    const room = rooms.get(roomId);
    room.users.set(socket.id, {
      nickname: nickname,
      joinTime: new Date()
    });
    users.set(socket.id, { roomId, nickname });

    // Notify room about new user
    socket.to(roomId).emit('user-joined', {
      nickname: nickname,
      userCount: room.users.size
    });

    // Send room info to the user
    socket.emit('room-joined', {
      roomId: roomId,
      users: Array.from(room.users.values()),
      messages: room.messages.slice(-50) // Send last 50 messages
    });

    console.log(`${nickname} joined room ${roomId}`);
  });

  // Handle new message
  socket.on('send-message', (data) => {
    const { message } = data;
    const roomId = socket.roomId;
    const nickname = socket.nickname;

    if (!roomId || !nickname) return;

    const messageData = {
      id: Date.now() + Math.random(),
      nickname: nickname,
      message: message,
      timestamp: new Date(),
      socketId: socket.id
    };

    // Store message in room
    const room = rooms.get(roomId);
    if (room) {
      room.messages.push(messageData);
      // Keep only last 100 messages
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }
    }

    // Broadcast message to room
    io.to(roomId).emit('new-message', messageData);
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    const { isTyping } = data;
    socket.to(socket.roomId).emit('user-typing', {
      nickname: socket.nickname,
      isTyping: isTyping
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.roomId) {
      removeUserFromRoom(socket.roomId, socket.id);
      socket.to(socket.roomId).emit('user-left', {
        nickname: socket.nickname,
        userCount: rooms.get(socket.roomId)?.users.size || 0
      });
    }

    users.delete(socket.id);
  });
});

// Helper function to remove user from room
function removeUserFromRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (room) {
    room.users.delete(socketId);
    // Clean up empty rooms
    if (room.users.size === 0) {
      rooms.delete(roomId);
    }
  }
}

// API endpoint to get room info
app.get('/api/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms.get(roomId);
  
  if (room) {
    res.json({
      roomId: roomId,
      userCount: room.users.size,
      users: Array.from(room.users.values())
    });
  } else {
    res.json({
      roomId: roomId,
      userCount: 0,
      users: []
    });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve room page
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
