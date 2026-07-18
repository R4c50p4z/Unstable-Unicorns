// ─── Card types ─────────────────────────────────────────────
export enum CardType {
  BabyUnicorn = "baby_unicorn",
  BasicUnicorn = "basic_unicorn",
  MagicalUnicorn = "magical_unicorn",
  Magic = "magic",
  Upgrade = "upgrade",
  Downgrade = "downgrade",
  Instant = "instant",
}

export const CardTypeLabel: Record<CardType, string> = {
  [CardType.BabyUnicorn]: "Bebé Unicornio",
  [CardType.BasicUnicorn]: "Unicornio Básico",
  [CardType.MagicalUnicorn]: "Unicornio Mágico",
  [CardType.Magic]: "Magia",
  [CardType.Upgrade]: "Ventaja",
  [CardType.Downgrade]: "Desventaja",
  [CardType.Instant]: "Instantánea",
};

// ─── Phases ─────────────────────────────────────────────────
export enum Phase {
  Beginning = "beginning",
  Draw = "draw",
  Action = "action",
  End = "end",
}

export const PhaseLabel: Record<Phase, string> = {
  [Phase.Beginning]: "Inicio de turno",
  [Phase.Draw]: "Robo",
  [Phase.Action]: "Acción",
  [Phase.End]: "Final de turno",
};

// ─── Effects ────────────────────────────────────────────────
export type EffectTarget =
  | { type: "none" }
  | { type: "any_player" }
  | { type: "other_player" }
  | { type: "all_players" }
  | { type: "self" }
  | { type: "any_stable_card" }
  | { type: "other_stable_card" }
  | { type: "any_upgrade" }
  | { type: "any_downgrade" }
  | { type: "any_unicorn" }
  | { type: "other_unicorn" }
  | { type: "nursery" };

export enum EffectTrigger {
  OnEnter = "al_entrar",           // When card enters stable
  BeginningOfTurn = "inicio_turno", // At beginning of turn
  Continuous = "continuo",         // Continuous passive effect
  OnLeave = "al_salir",            // When card leaves stable
  Instant = "instante",            // Can be played anytime
  OnPlay = "al_jugar",             // When card is played from hand
  Search = "buscar",               // Search deck/discard
}

export enum EffectAction {
  Draw = "robar",
  Discard = "descartar",
  Sacrifice = "sacrificar",
  Destroy = "destruir",
  Steal = "hurtar",
  ExtraAction = "accion_extra",
  GainBaby = "ganar_bebe",
  ReturnToHand = "volver_a_mano",
  PreventNeigh = "prevenir_relincho",
  PreventEntry = "prevenir_entrada",
  ShuffleIntoDeck = "barajar_al_mazo",
  None = "ninguno",
}

export interface CardEffect {
  trigger: EffectTrigger;
  action: EffectAction;
  target: EffectTarget;
  optional: boolean;
  amount?: number;
  cardTypeFilter?: CardType;
  then?: CardEffect;
}

// ─── Card ───────────────────────────────────────────────────
export interface Card {
  id: string;
  name: string;
  type: CardType;
  effect: string;             // Effect text in Spanish (for display)
  effectData?: CardEffect;    // Structured effect (for engine)
  image?: string;
  isBabyUnicorn?: boolean;    // True for baby unicorns (from nursery)
}

// ─── Player ─────────────────────────────────────────────────
export interface Player {
  id: string;
  name: string;
  hand: Card[];
  stable: Card[];
  isHost: boolean;
  hasPickedBaby: boolean;
}

// ─── Lobby state ────────────────────────────────────────────
export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  babyId: string | null;      // Selected baby unicorn id, null if not selected
}

// ─── Game state ─────────────────────────────────────────────
export interface GameState {
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  nursery: Card[];
  currentPlayerIndex: number;
  phase: Phase;
  winner: string | null;
  turnCount: number;
}

// ─── Pending card (for Neigh resolution) ───────────────────
export interface PendingCard {
  id: string;
  card: Card;
  playerIndex: number;
  neighResponded: Set<number>;
  neighResults: Map<number, boolean>; // playerIndex → whether they neighed
  resolved: boolean;
}

// ─── Socket.IO Events ───────────────────────────────────────
export interface ServerToClientEvents {
  lobby_update: (data: { players: LobbyPlayer[] }) => void;
  baby_selection_start: (data: { availableBabies: Card[] }) => void;
  baby_selection_update: (data: { players: LobbyPlayer[] }) => void;
  game_start: (data: { state: GameState; yourIndex: number }) => void;
  game_update: (data: { state: GameState }) => void;
  your_turn: (data: { phase: Phase }) => void;
  turn_phase: (data: { phase: Phase; playerIndex: number }) => void;
  draw_card: (data: { card: Card }) => void;
  neigh_required: (data: { pendingCardId: string; cardName: string; fromPlayer: string }) => void;
  card_resolved: (data: { pendingCardId: string; card: Card; playerIndex: number }) => void;
  card_neighed: (data: { pendingCardId: string; card: Card; playerIndex: number }) => void;
  target_required: (data: { pendingCardId: string; action: EffectAction; amount?: number; targets: any[] }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  join_lobby: (data: { name: string }) => void;
  start_game: () => void;
  select_baby: (data: { cardId: string }) => void;
  play_card: (data: { cardId: string }) => void;
  neigh_response: (data: { pendingCardId: string; pass: boolean; cardId?: string }) => void;
  target_selected: (data: { pendingCardId: string; targetId?: string; targetPlayerIndex?: number }) => void;
  end_turn: () => void;
}
