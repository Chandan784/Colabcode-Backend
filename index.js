const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Room management
const rooms = {};

function createRoom(roomId, userId, username) {
  rooms[roomId] = {
    code: "// Start coding here...",
    users: [
      {
        id: userId,
        name: username,
        cursorPosition: null,
      },
    ],
  };
  return rooms[roomId];
}

function joinRoom(roomId, userId, username) {
  if (!rooms[roomId]) return null;

  const existingUser = rooms[roomId].users.find((u) => u.id === userId);
  if (!existingUser) {
    rooms[roomId].users.push({
      id: userId,
      name: username,
      cursorPosition: null,
    });
  }

  return rooms[roomId];
}

function leaveRoom(roomId, userId) {
  if (!rooms[roomId]) return;

  rooms[roomId].users = rooms[roomId].users.filter((u) => u.id !== userId);

  if (rooms[roomId].users.length === 0) {
    delete rooms[roomId];
  }
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Extract user info from auth
  const { uid, name, photoURL, email } = socket.handshake.auth;
  socket.userId = uid;
  socket.username = name || "Anonymous";

  // Room creation
  socket.on("create-room", (callback) => {
    try {
      if (!socket.userId) {
        return callback({ error: "User not authenticated" });
      }

      const roomId = `room-${socket.userId}-${Math.random()
        .toString(36)
        .substring(2, 8)}`;
      createRoom(roomId, socket.userId, socket.username);
      socket.join(roomId);

      console.log(`Room created: ${roomId} by ${socket.username}`);

      callback({ roomId });
    } catch (error) {
      console.error("Create room error:", error);
      callback({ error: "Failed to create room" });
    }
  });

  // Room joining
  socket.on("join-room", (roomId, callback) => {
    try {
      if (!socket.userId) {
        return callback({ error: "User not authenticated" });
      }

      const room = joinRoom(roomId, socket.userId, socket.username);
      if (!room) {
        return callback({ error: "Room not found" });
      }

      socket.join(roomId);
      socket.roomId = roomId;

      // Send current room data to the new user
      socket.emit("room-data", {
        code: room.code,
        users: room.users,
      });

      // Notify other users in the room
      socket.to(roomId).emit("user-list", room.users);

      console.log(`${socket.username} joined room ${roomId}`);

      callback({ success: true });
    } catch (error) {
      console.error("Join room error:", error);
      callback({ error: "Failed to join room" });
    }
  });

  // Leaving a room
  socket.on("leave-room", (roomId) => {
    leaveRoom(roomId, socket.userId);
    socket.leave(roomId);
    socket.to(roomId).emit("user-list", rooms[roomId]?.users || []);
    console.log(`${socket.username} left room ${roomId}`);
  });

  // Code changes
  socket.on("code-change", ({ roomId, code }) => {
    if (!rooms[roomId]) return;

    rooms[roomId].code = code;
    socket.to(roomId).emit("code-update", code);
  });

  // Cursor position updates
  socket.on("cursor-position", ({ roomId, position, userId, name }) => {
    if (!rooms[roomId]) return;

    // Update cursor position in room data
    const user = rooms[roomId].users.find((u) => u.id === userId);
    if (user) {
      user.cursorPosition = position;
    }

    // Broadcast to other users in the room
    socket.to(roomId).emit("cursor-position", {
      userId,
      position,
      name,
    });
  });

  // Typing indicators
  socket.on("user-typing", ({ roomId, userId, name }) => {
    socket.to(roomId).emit("user-typing", {
      userId,
      name,
    });
  });

  socket.on("user-stopped-typing", ({ roomId, userId }) => {
    socket.to(roomId).emit("user-stopped-typing", userId);
  });

  // Disconnection
  socket.on("disconnect", () => {
    if (socket.roomId) {
      leaveRoom(socket.roomId, socket.userId);
      socket
        .to(socket.roomId)
        .emit("user-list", rooms[socket.roomId]?.users || []);
      console.log(`${socket.username} disconnected from room ${socket.roomId}`);
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5006;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
