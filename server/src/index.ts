import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT ?? 3000;

// Serve client build in production
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Fallback to index.html for SPA
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// ─── Socket.IO ──────────────────────────────────────────────

const rooms = new Map<string, { hostId: string; players: Map<string, string> }>();

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("join_lobby", ({ name }) => {
    const roomId = "main"; // single room for now
    socket.join(roomId);
    socket.data.name = name;
    socket.data.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { hostId: socket.id, players: new Map() });
    }

    const room = rooms.get(roomId)!;
    room.players.set(socket.id, name);

    io.to(roomId).emit("lobby_update", {
      players: Array.from(room.players.entries()).map(([id, n]) => ({
        id,
        name: n,
        isHost: id === room.hostId,
      })),
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId)!;
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit("lobby_update", {
          players: Array.from(room.players.entries()).map(([id, n]) => ({
            id,
            name: n,
            isHost: id === room.hostId,
          })),
        });
      }
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🦄 Server running on http://localhost:${PORT}`);
});
