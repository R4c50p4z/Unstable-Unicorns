import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { ALL_CARDS, BABY_UNICORNS, getCardById } from "../../shared/src/cards.ts";
import type { Card, GameState, Player, LobbyPlayer, PendingCard } from "../../shared/src/index.ts";
import { Phase, EffectTrigger, EffectAction } from "../../shared/src/index.ts";

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
  babies: Map<string, string | null>;
  nursery: Card[];
  gameState: GameState | null;
  pendingCards: Map<string, PendingCard>;
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

  const selectedIds = new Set(playerIds.map((id) => room.babies.get(id)).filter(Boolean));
  room.nursery = nursery.filter((b) => !selectedIds.has(b.id));

  if (playerCount === 2) {
    const neighs = deck.filter((c) => c.name === "Relincho");
    for (const p of players) {
      const neigh = neighs.shift();
      if (neigh) p.hand.push(neigh);
    }
    deck = deck.filter((c) => c.name !== "Relincho" || !neighs.includes(c));
    deck = shuffle([...deck, ...neighs]);
  }

  return {
    players,
    deck,
    discardPile,
    nursery: [...room.nursery],
    currentPlayerIndex: 0,
    phase: Phase.Beginning,
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

// ─── Game Engine ─────────────────────────────────────────────

function findPlayerIndex(room: Room, socketId: string): number {
  const ids = Array.from(room.players.keys());
  return ids.indexOf(socketId);
}

function getCardInHand(state: GameState, playerIndex: number, cardId: string): Card | undefined {
  return state.players[playerIndex].hand.find((c) => c.id === cardId);
}

function removeFromHand(state: GameState, playerIndex: number, cardId: string): void {
  state.players[playerIndex].hand = state.players[playerIndex].hand.filter((c) => c.id !== cardId);
}

function discardCard(state: GameState, card: Card): void {
  state.discardPile.push(card);
}

function toStable(state: GameState, playerIndex: number, card: Card): void {
  state.players[playerIndex].stable.push(card);
}

function broadcastGame(room: Room, state: GameState): void {
  const roomId = Array.from(room.players.keys())[0] ? "" : "";
  for (const [id, _] of room.players) {
    const playerIndex = findPlayerIndex(room, id);
    const playerState = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        hand: i === playerIndex ? p.hand : p.hand.map(() => ({ id: "hidden", name: "Carta oculta", type: "magic" as const, effect: "" } as Card)),
      })),
    };
    io.to(id).emit("game_update", { state: playerState });
  }
}

function isNeighCard(card: Card): boolean {
  return card.type === "instant" && card.name === "Relincho";
}

function createPendingCardId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ─── Turn Progression ────────────────────────────────────────

function startTurn(room: Room, state: GameState): void {
  state.phase = Phase.Beginning;
  state.turnCount++;
  const pi = state.currentPlayerIndex;
  const playerId = state.players[pi].id;

  // Run Beginning-of-turn effects
  runBeginningEffects(state, pi);

  // Advance to Draw phase
  state.phase = Phase.Draw;

  // Draw a card
  drawCardForPlayer(state, pi);

  // Advance to Action
  state.phase = Phase.Action;

  broadcastGame(room, state);

  // Notify the active player
  io.to(playerId).emit("your_turn", { phase: Phase.Action });
}

function drawCardForPlayer(state: GameState, playerIndex: number): void {
  if (state.deck.length === 0) {
    if (state.discardPile.length > 0) {
      state.deck = shuffle([...state.discardPile]);
      state.discardPile = [];
    } else {
      return;
    }
  }
  const card = state.deck.shift()!;
  state.players[playerIndex].hand.push(card);
}

function runBeginningEffects(state: GameState, playerIndex: number): void {
  const stables = state.players[playerIndex].stable;
  for (const card of stables) {
    if (card.effectData?.trigger === EffectTrigger.BeginningOfTurn) {
      // For simple draw effects, auto-resolve
      if (card.effectData.action === EffectAction.Draw && !card.effectData.optional) {
        drawCardForPlayer(state, playerIndex);
      }
    }
  }
}

// ─── Play Card Flow ──────────────────────────────────────────

function handlePlayCard(
  room: Room,
  state: GameState,
  playerIndex: number,
  cardId: string,
  socketId: string
): boolean {
  const card = getCardInHand(state, playerIndex, cardId);
  if (!card) return false;

  // Remove card from hand
  removeFromHand(state, playerIndex, cardId);

  // Create pending card
  const pendingId = createPendingCardId();
  const otherIndices = state.players.map((_, i) => i).filter((i) => i !== playerIndex);

  const pc: PendingCard = {
    id: pendingId,
    card,
    playerIndex,
    neighQueue: [...otherIndices],
    neighResults: new Map(),
    resolved: false,
  };
  room.pendingCards.set(pendingId, pc);

  if (otherIndices.length === 0) {
    // Solo game? Just resolve
    resolveCard(room, state, pendingId, socketId);
  } else {
    // Ask first player to neigh
    askNextNeigh(room, state, pendingId);
  }

  return true;
}

function askNextNeigh(room: Room, state: GameState, pendingId: string): void {
  const pc = room.pendingCards.get(pendingId);
  if (!pc || pc.resolved) return;

  const nextIdx = pc.neighQueue.shift();
  if (nextIdx === undefined) {
    // All have passed → resolve card
    resolveCard(room, state, pendingId, Array.from(room.players.keys())[0]);
    return;
  }

  const playerId = state.players[nextIdx].id;
  const fromPlayerName = state.players[pc.playerIndex].name;
  io.to(playerId).emit("neigh_required", {
    pendingCardId: pendingId,
    cardName: pc.card.name,
    fromPlayer: fromPlayerName,
  });
}

function handleNeighResponse(
  room: Room,
  state: GameState,
  socketId: string,
  pendingId: string,
  pass: boolean,
  cardId?: string
): void {
  const pc = room.pendingCards.get(pendingId);
  if (!pc || pc.resolved) return;

  const playerIndex = findPlayerIndex(room, socketId);
  pc.neighResults.set(playerIndex, !pass);

  if (!pass && cardId) {
    // Player played a Neigh
    const neighCard = getCardInHand(state, playerIndex, cardId);
    if (!neighCard || !isNeighCard(neighCard)) {
      io.to(socketId).emit("error", { message: "Solo puedes usar Relincho" });
      askNextNeigh(room, state, pendingId);
      return;
    }
    removeFromHand(state, playerIndex, cardId);
    discardCard(state, neighCard);
    discardCard(state, pc.card);
    pc.resolved = true;
    room.pendingCards.delete(pendingId);

    broadcastGame(room, state);
    io.to(room.players.keys().next().value).emit("card_neighed", {
      pendingCardId: pendingId,
      card: pc.card,
      playerIndex: pc.playerIndex,
    });
    return;
  }

  // Passed
  askNextNeigh(room, state, pendingId);
}

function resolveCard(room: Room, state: GameState, pendingId: string, socketId: string): void {
  const pc = room.pendingCards.get(pendingId);
  if (!pc || pc.resolved) return;

  const card = pc.card;
  const pi = pc.playerIndex;
  const playerSocketId = Array.from(room.players.keys())[pi];

  // Apply card based on type
  if (card.type === "baby_unicorn" || card.type === "basic_unicorn" || card.type === "magical_unicorn") {
    toStable(state, pi, card);
    applyEffect(room, state, pendingId, card, pi, socketId);
    return;
  }

  if (card.type === "upgrade") {
    toStable(state, pi, card);
    applyEffect(room, state, pendingId, card, pi, socketId);
    return;
  }

  if (card.type === "downgrade") {
    // Need target player
    const targets = state.players.map((p, i) => ({ playerIndex: i, name: p.name, id: p.id })).filter((t) => t.playerIndex !== pi);
    io.to(socketId).emit("target_required", {
      pendingCardId: pendingId,
      action: EffectAction.Destroy,
      amount: 1,
      targets,
    });
    // Store context that this is a downgrade placement
    const pc2 = room.pendingCards.get(pendingId);
    if (pc2) pc2.effectStep = 10; // special marker for downgrade
    return;
  }

  if (card.type === "magic") {
    applyEffect(room, state, pendingId, card, pi, socketId);
    return;
  }

  // Fallback: just discard
  discardCard(state, card);
  pc.resolved = true;
  room.pendingCards.delete(pendingId);
  broadcastGame(room, state);
  checkAndNotifyWinner(room, state);
}

function applyEffect(
  room: Room,
  state: GameState,
  pendingId: string,
  card: Card,
  pi: number,
  socketId: string
): void {
  const pc = room.pendingCards.get(pendingId);
  if (!pc) return;

  const effect = card.effectData;
  if (!effect) {
    // No structured effect → just done
    finalizeCard(room, state, pendingId, pi, socketId);
    return;
  }

  const step = pc.effectStep || 0;

  // Get current effect (support chained effects via `then`)
  let currentEffect = effect;
  if (step > 0 && effect.then) {
    currentEffect = effect.then;
  }

  if (currentEffect.action === EffectAction.Draw) {
    const amount = currentEffect.amount || 1;
    for (let i = 0; i < amount; i++) {
      drawCardForPlayer(state, pi);
    }
    finalizeCard(room, state, pendingId, pi, socketId);
    return;
  }

  if (currentEffect.action === EffectAction.Destroy && currentEffect.target.type !== "self") {
    // Need target selection
    const validTargets = getValidTargets(state, currentEffect.target, pi, card.type);
    if (validTargets.length === 0) {
      finalizeCard(room, state, pendingId, pi, socketId);
      return;
    }
    io.to(socketId).emit("target_required", {
      pendingCardId: pendingId,
      action: EffectAction.Destroy,
      amount: currentEffect.amount || 1,
      targets: validTargets,
    });
    return;
  }

  if (currentEffect.action === EffectAction.Sacrifice) {
    // Player must sacrifice their own card
    const ownCards = getOwnCards(state, pi);
    if (ownCards.length === 0) {
      finalizeCard(room, state, pendingId, pi, socketId);
      return;
    }
    io.to(socketId).emit("target_required", {
      pendingCardId: pendingId,
      action: EffectAction.Sacrifice,
      amount: 1,
      targets: ownCards,
    });
    return;
  }

  if (currentEffect.action === EffectAction.Discard) {
    const amount = currentEffect.amount || 1;
    const playerHand = state.players[pi].hand;
    if (currentEffect.target.type === "any_player" || currentEffect.target.type === "other_player") {
      // Need to choose a player, then they discard
      const targets = state.players.map((p, i) => ({ playerIndex: i, name: p.name, id: p.id })).filter((t) => t.playerIndex !== pi);
      io.to(socketId).emit("target_required", {
        pendingCardId: pendingId,
        action: EffectAction.Discard,
        amount,
        targets,
      });
      return;
    }
    // Self discard
    if (playerHand.length <= amount) {
      state.players[pi].hand = [];
    } else {
      io.to(socketId).emit("target_required", {
        pendingCardId: pendingId,
        action: EffectAction.Discard,
        amount,
        targets: playerHand.map((c) => ({ cardId: c.id, cardName: c.name, image: c.image })),
      });
      return;
    }
    finalizeCard(room, state, pendingId, pi, socketId);
    return;
  }

  // Effects with no pending target needed
  finalizeCard(room, state, pendingId, pi, socketId);
}

function getValidTargets(state: GameState, target: any, playerIndex: number, cardType: string): any[] {
  if (target.type === "any_unicorn") {
    return getCardsFromAllStables(state, (c) => c.type === "baby_unicorn" || c.type === "basic_unicorn" || c.type === "magical_unicorn", playerIndex);
  }
  if (target.type === "any_upgrade") {
    return getCardsFromAllStables(state, (c) => c.type === "upgrade", playerIndex);
  }
  if (target.type === "any_downgrade") {
    return getCardsFromAllStables(state, (c) => c.type === "downgrade", playerIndex);
  }
  if (target.type === "any_stable_card") {
    return getCardsFromAllStables(state, () => true, playerIndex);
  }
  if (target.type === "self") {
    return state.players[playerIndex].stable.map((c) => ({
      cardId: c.id,
      cardName: c.name,
      playerIndex,
      image: c.image,
    }));
  }
  if (target.type === "other_player") {
    return state.players.map((p, i) => ({ playerIndex: i, name: p.name, id: p.id })).filter((t) => t.playerIndex !== playerIndex);
  }
  if (target.type === "any_player") {
    return state.players.map((p, i) => ({ playerIndex: i, name: p.name, id: p.id }));
  }
  return [];
}

function getCardsFromAllStables(state: GameState, filter: (c: Card) => boolean, excludePlayer?: number): any[] {
  const result: any[] = [];
  for (let i = 0; i < state.players.length; i++) {
    if (i === excludePlayer) continue;
    for (const card of state.players[i].stable) {
      if (filter(card)) {
        result.push({ cardId: card.id, cardName: card.name, playerIndex: i, image: card.image });
      }
    }
  }
  return result;
}

function getOwnCards(state: GameState, playerIndex: number): any[] {
  return state.players[playerIndex].stable.map((c) => ({
    cardId: c.id,
    cardName: c.name,
    playerIndex,
    image: c.image,
  }));
}

function applyTargetEffect(
  room: Room,
  state: GameState,
  pendingId: string,
  targetId?: string,
  targetPlayerIndex?: number
): void {
  const pc = room.pendingCards.get(pendingId);
  if (!pc || pc.resolved) return;

  const card = pc.card;
  const pi = pc.playerIndex;
  const effect = card.effectData;
  const step = pc.effectStep || 0;

  let currentEffect = effect;
  if (step > 0 && effect?.then) {
    currentEffect = effect.then;
  }

  if (!currentEffect) {
    finalizeCard(room, state, pendingId, pi, Array.from(room.players.keys())[pi]);
    return;
  }

  // Handle downgrade placement (step 10 marker)
  if (step === 10) {
    if (targetPlayerIndex !== undefined) {
      toStable(state, targetPlayerIndex, card);
    }
    finalizeCard(room, state, pendingId, pi, Array.from(room.players.keys())[pi]);
    return;
  }

  const action = currentEffect.action;

  switch (action) {
    case EffectAction.Destroy: {
      if (targetId && targetPlayerIndex !== undefined) {
        const targetCards = state.players[targetPlayerIndex].stable;
        const idx = targetCards.findIndex((c) => c.id === targetId);
        if (idx !== -1) {
          const removed = targetCards.splice(idx, 1)[0];
          discardCard(state, removed);
        }
      }
      break;
    }
    case EffectAction.Sacrifice: {
      if (targetId && targetPlayerIndex !== undefined && targetPlayerIndex === pi) {
        const targetCards = state.players[pi].stable;
        const idx = targetCards.findIndex((c) => c.id === targetId);
        if (idx !== -1) {
          const removed = targetCards.splice(idx, 1)[0];
          discardCard(state, removed);
        }
      }
      break;
    }
    case EffectAction.Discard: {
      if (targetPlayerIndex !== undefined) {
        const amount = currentEffect.amount || 1;
        if (targetId) {
          removeFromHand(state, targetPlayerIndex, targetId);
        } else {
          // Discard X cards from target player
          const cardsToDiscard = state.players[targetPlayerIndex].hand.splice(0, amount);
          for (const c of cardsToDiscard) discardCard(state, c);
        }
      }
      break;
    }
  }

  // If chained effect exists and we've only done step 0, run the next step
  if (effect?.then && step === 0) {
    pc.effectStep = 1;
    // Re-run apply effect for the chained effect
    applyEffect(room, state, pendingId, card, pi, Array.from(room.players.keys())[pi]);
    return;
  }

  finalizeCard(room, state, pendingId, pi, Array.from(room.players.keys())[pi]);
}

function finalizeCard(room: Room, state: GameState, pendingId: string, pi: number, socketId: string): void {
  const pc = room.pendingCards.get(pendingId);
  if (!pc) return;

  const card = pc.card;

  // Discard magic cards after effect
  if (card.type === "magic") {
    discardCard(state, card);
  }

  pc.resolved = true;
  room.pendingCards.delete(pendingId);

  broadcastGame(room, state);
  io.to(room.players.keys().next().value).emit("card_resolved", {
    pendingCardId: pendingId,
    card,
    playerIndex: pi,
  });

  checkAndNotifyWinner(room, state);
}

function checkAndNotifyWinner(room: Room, state: GameState): void {
  const winnerId = checkWinner(state);
  if (winnerId) {
    state.winner = winnerId;
    broadcastGame(room, state);
  }
}

function handleEndTurn(room: Room, state: GameState, socketId: string): void {
  const pi = findPlayerIndex(room, socketId);

  // End phase: hand limit (max 7 cards)
  state.phase = Phase.End;
  const hand = state.players[pi].hand;
  if (hand.length > 7) {
    io.to(socketId).emit("target_required", {
      pendingCardId: "end_hand_" + pi,
      action: EffectAction.Discard,
      amount: hand.length - 7,
      targets: hand.map((c) => ({ cardId: c.id, cardName: c.name, image: c.image })),
    });
    return;
  }

  advanceToNextTurn(room, state);
}

function advanceToNextTurn(room: Room, state: GameState): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  startTurn(room, state);
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
      rooms.set(roomId, { hostId: socket.id, players: new Map(), babies: new Map(), gameState: null, nursery: [], pendingCards: new Map() });
    }

    const room = rooms.get(roomId)!;
    room.players.set(socket.id, name);
    room.babies.set(socket.id, null);

    io.to(roomId).emit("lobby_update", { players: getLobbyPlayers(room) });
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
    io.to(roomId).emit("baby_selection_update", { players: getLobbyPlayers(room) });

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

      // Start first turn
      setTimeout(() => startTurn(room, state), 500);
    }
  });

  // ─── Play a card ─────────────────────────────────────────
  socket.on("play_card", ({ cardId }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.gameState) return;

    const state = room.gameState;
    const pi = findPlayerIndex(room, socket.id);
    if (pi === -1) return;

    const player = state.players[pi];
    if (state.currentPlayerIndex !== pi) {
      socket.emit("error", { message: "No es tu turno" });
      return;
    }
    if (state.phase !== Phase.Action) {
      socket.emit("error", { message: "No estás en fase de acción" });
      return;
    }

    const card = player.hand.find((c) => c.id === cardId);
    if (!card) {
      socket.emit("error", { message: "No tienes esa carta" });
      return;
    }

    handlePlayCard(room, state, pi, cardId, socket.id);
  });

  // ─── Neigh response ─────────────────────────────────────
  socket.on("neigh_response", ({ pendingCardId, pass, cardId }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.gameState) return;

    handleNeighResponse(room, room.gameState, socket.id, pendingCardId, pass, cardId);
  });

  // ─── Target selection ───────────────────────────────────
  socket.on("target_selected", ({ pendingCardId, targetId, targetPlayerIndex }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.gameState) return;

    const state = room.gameState;

    // Handle end-of-hand discard
    if (pendingCardId.startsWith("end_hand_")) {
      if (targetId) {
        removeFromHand(state, findPlayerIndex(room, socket.id), targetId);
      }
      // Check if still over limit
      const pi = findPlayerIndex(room, socket.id);
      const hand = state.players[pi].hand;
      if (hand.length > 7) {
        io.to(socket.id).emit("target_required", {
          pendingCardId,
          action: EffectAction.Discard,
          amount: hand.length - 7,
          targets: hand.map((c) => ({ cardId: c.id, cardName: c.name, image: c.image })),
        });
        return;
      }
      broadcastGame(room, state);
      advanceToNextTurn(room, state);
      return;
    }

    applyTargetEffect(room, state, pendingCardId, targetId, targetPlayerIndex);
  });

  // ─── End turn ────────────────────────────────────────────
  socket.on("end_turn", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.gameState) return;

    const state = room.gameState;
    const pi = findPlayerIndex(room, socket.id);
    if (pi === -1) return;

    if (state.currentPlayerIndex !== pi) {
      socket.emit("error", { message: "No es tu turno" });
      return;
    }
    if (state.phase !== Phase.Action) {
      socket.emit("error", { message: "No estás en fase de acción" });
      return;
    }

    handleEndTurn(room, state, socket.id);
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
        io.to(roomId).emit("lobby_update", { players: getLobbyPlayers(room) });
      }
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🦄 Unstable Unicorns - Servidor iniciado en http://localhost:${PORT}`);
  console.log(`   Abre http://localhost:${PORT} desde tu navegador`);
});
