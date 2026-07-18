import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { ALL_CARDS, BABY_UNICORNS, getCardById } from "../../shared/src/cards.ts";
import type { Card, GameState, Player, LobbyPlayer } from "../../shared/src/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT ?? 3000;

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// ─── Game Types ─────────────────────────────────────────────
interface Room {
  hostId: string;
  players: Map<string, string>;
  babies: Map<string, string | null>; // socketId -> baby card id
  gameState: GameState | null;
}

const rooms = new Map<string, Room>();

// ─── Helpers ────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLobbyPlayers(room: Room): LobbyPlayer[] {
  return Array.from(room.players.entries()).map(([id, name]) => ({
    id,
    name,
    isHost: id === room.hostId,
    babyId: room.babies.get(id) ?? null,
  }));
}

// CARTAS A QUITAR EN MODO 2 JUGADORES
const TWO_PLAYER_REMOVE_NAMES = [
  "Unicornio Básico (Rojo)", "Unicornio Básico (Naranja)", "Unicornio Básico (Amarillo)",
  "Unicornio Básico (Verde)", "Unicornio Básico (Azul)", "Unicornio Básico (Índigo)",
  "Unicornio Básico (Púrpura)", "Narval",
  "Unicornio Reina del Baile", "Unicornio Seductor", "Unicornio Arcoíris",
  "Cámara para la Niñera", "Ritual Sádico", "Ralentización",
  "¡Hurra!", "Unicornio Mamá Ganso", "Unicornio Nigromante",
];

function createDeck(playerCount: number): Card[] {
  let deck = ALL_CARDS.filter((c) => !c.isBabyUnicorn);
  if (playerCount === 2) {
    deck = deck.filter((c) => !TWO_PLAYER_REMOVE_NAMES.includes(c.name));
  }
  return shuffle(deck);
}

function startGame(room: Room, playerIds: string[]): GameState {
  const playerCount = playerIds.length;
  let deck = createDeck(playerCount);
  const nursery = shuffle([...BABY_UNICORNS]);
  const discardPile: Card[] = [];

  const players: Player[] = playerIds.map((id) => {
    const name = room.players.get(id)!;
    const hand = deck.splice(0, 5);
    // Give a baby unicorn based on selection
    const babyId = room.babies.get(id) ?? null;
    const baby = babyId ? nursery.find((b) => b.id === babyId)! : nursery.shift()!;
    return {
      id,
      name,
      hand,
      stable: [baby],
      isHost: id === room.hostId,
      hasPickedBaby: true,
    };
  });

  // Remove selected babies from nursery
  const selectedIds = new Set(playerIds.map((id) => room.babies.get(id)).filter(Boolean));
  room.nursery = nursery.filter((b) => !selectedIds.has(b.id));

  // 2-player: give each player an extra Neigh card
  if (playerCount === 2) {
    const neighs = deck.filter((c) => c.name === "Relincho");
    for (const p of players) {
      const neigh = neighs.shift();
      if (neigh) p.hand.push(neigh);
    }
    // Remove the dealt neighs from deck
    deck = deck.filter((c) => c.name !== "Relincho" || !neighs.includes(c));
    deck = shuffle([...deck, ...neighs]);
  }

  return {
    players,
    deck,
    discardPile,
    nursery: [...room.nursery],
    currentPlayerIndex: 0,
    phase: "beginning",
    winner: null,
    turnCount: 0,
  };
}

function checkWinner(state: GameState): string | null {
  const required = state.players.length >= 6 ? 6 : 7;
  for (const p of state.players) {
    const count = p.stable.filter((c) =>
      c.type === "baby_unicorn" || c.type === "basic_unicorn" || c.type === "magical_unicorn"
    ).length;
    if (count >= required) return p.id;
  }
  return null;
}

function nextTurn(state: GameState): GameState {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.phase = "beginning";
  state.turnCount++;
  return { ...state };
}

// ─── Socket.IO ──────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("join_lobby", ({ name }) => {
    const roomId = "main";
    socket.join(roomId);
    socket.data.name = name;
    socket.data.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { hostId: socket.id, players: new Map(), babies: new Map(), gameState: null, nursery: [] });
    }

    const room = rooms.get(roomId)!;
    room.players.set(socket.id, name);
    room.babies.set(socket.id, null);

    io.to(roomId).emit("lobby_update", getLobbyPlayers(room));
  });

  // ─── Host starts game: begin baby selection ──────────────
  socket.on("start_game", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || socket.id !== room.hostId) return;

    const availableBabies = shuffle([...BABY_UNICORNS]);

    // Reset baby selections
    for (const id of room.players.keys()) {
      room.babies.set(id, null);
    }

    io.to(roomId).emit("baby_selection_start", { availableBabies });
  });

  // ─── Player selects a baby unicorn ───────────────────────
  socket.on("select_baby", ({ cardId }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    // Check if baby is already taken
    const taken = Array.from(room.babies.values()).includes(cardId);
    if (taken) {
      socket.emit("error", { message: "Ese Bebé Unicornio ya ha sido elegido" });
      return;
    }

    room.babies.set(socket.id, cardId);
    io.to(roomId).emit("baby_selection_update", getLobbyPlayers(room));

    // Check if all players have selected
    const allSelected = Array.from(room.players.keys()).every((id) => room.babies.get(id) !== null);
    if (allSelected) {
      const playerIds = Array.from(room.players.keys());
      const state = startGame(room, playerIds);
      room.gameState = state;

      playerIds.forEach((id, index) => {
        const playerState = {
          ...state,
          players: state.players.map((p, i) => ({
            ...p,
            hand: i === index ? p.hand : p.hand.map(() => ({ id: "hidden", name: "Carta oculta", type: "magic", effect: "" } as Card)),
          })),
        };
        io.to(id).emit("game_start", { state: playerState, yourIndex: index });
      });
    }
  });

  // ─── Play a card ─────────────────────────────────────────
  socket.on("play_card", ({ cardId }) => {
    // TODO: implement in Phase 3
  });

  // ─── End turn ────────────────────────────────────────────
  socket.on("end_turn", () => {
    // TODO: implement in Phase 3
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId)!;
      room.players.delete(socket.id);
      room.babies.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit("lobby_update", getLobbyPlayers(room));
      }
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🦄 Unstable Unicorns - Servidor iniciado en http://localhost:${PORT}`);
  console.log(`   Abre http://localhost:${PORT} desde tu navegador`);
});
