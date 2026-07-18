export enum CardType {
  BabyUnicorn = "baby_unicorn",
  BasicUnicorn = "basic_unicorn",
  MagicalUnicorn = "magical_unicorn",
  Magic = "magic",
  Upgrade = "upgrade",
  Downgrade = "downgrade",
  Instant = "instant",
}

export enum Phase {
  Beginning = "beginning",
  Draw = "draw",
  Action = "action",
  End = "end",
}

export interface Card {
  id: string;
  name: string;
  type: CardType;
  effect: string;
  image?: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  stable: Card[];
  isHost: boolean;
}

export interface GameState {
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  nursery: Card[];
  currentPlayerIndex: number;
  phase: Phase;
  winner: string | null;
}

export interface ServerToClientEvents {
  lobby_update: (data: { players: { id: string; name: string; isHost: boolean }[] }) => void;
  game_start: (data: { state: GameState; yourIndex: number }) => void;
  game_update: (data: { state: GameState }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  join_lobby: (data: { name: string }) => void;
  start_game: () => void;
  play_card: (data: { cardId: string; targetId?: string }) => void;
  end_turn: () => void;
}
