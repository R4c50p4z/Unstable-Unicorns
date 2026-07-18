import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents, Card, GameState, LobbyPlayer, Phase } from "shared";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ─── Styles ─────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  app: { fontFamily: "system-ui, sans-serif", maxWidth: 600, margin: "0 auto", padding: 16 },
  title: { textAlign: "center" as const, fontSize: 24, color: "white" },
  input: { padding: 10, fontSize: 16, borderRadius: 8, border: "2px solid #ccc", width: "60%", marginRight: 8 },
  btn: { padding: "10px 20px", fontSize: 16, borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" as const },
  btnPrimary: { background: "#7c3aed", color: "white" },
  btnSuccess: { background: "#10b981", color: "white" },
  btnDisabled: { background: "#6b7280", color: "#9ca3af", cursor: "not-allowed" },
  card: { display: "inline-block", width: 100, margin: 4, padding: 8, borderRadius: 8, border: "2px solid #ddd", background: "white", textAlign: "center" as const, cursor: "pointer", verticalAlign: "top" as const },
  cardSelected: { border: "3px solid #7c3aed", boxShadow: "0 0 8px #7c3aed" },
  cardImg: { width: "100%", height: 80, objectFit: "contain" as const },
  cardName: { fontSize: 11, fontWeight: "bold" as const, marginTop: 4 },
  cardEffect: { fontSize: 9, color: "#555", marginTop: 2 },
  section: { background: "#1e1e2e", borderRadius: 12, padding: 16, margin: "12px 0" },
  sectionTitle: { color: "white", fontSize: 14, fontWeight: "bold" as const, marginBottom: 8 },
  hand: { display: "flex", flexWrap: "wrap" as const, gap: 4, justifyContent: "center" as const },
  stable: { display: "flex", flexWrap: "wrap" as const, gap: 4, justifyContent: "center" as const },
  playerRow: { color: "#94a3b8", fontSize: 13, margin: "4px 0" },
  phase: { color: "#fbbf24", fontSize: 13, fontWeight: "bold" as const },
  babyOption: { display: "inline-block", width: 120, margin: 8, cursor: "pointer", textAlign: "center" as const },
  babyImg: { width: 80, height: 80, borderRadius: 8, border: "3px solid transparent" },
  babyName: { color: "white", fontSize: 12, marginTop: 4 },
};

const cardTypeColors: Record<string, string> = {
  baby_unicorn: "#a855f7",
  basic_unicorn: "#6366f1",
  magical_unicorn: "#3b82f6",
  magic: "#22c55e",
  upgrade: "#f97316",
  downgrade: "#eab308",
  instant: "#ef4444",
};

// ─── Components ─────────────────────────────────────────────

function Loading({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <h1 style={{ color: "white" }}>🦄 Unstable Unicorns</h1>
      <p style={{ color: "#94a3b8" }}>{message}</p>
    </div>
  );
}

function CardView({ card, selected, onClick }: { card: Card; selected?: boolean; onClick?: () => void }) {
  const borderColor = card.id === "hidden" ? "#666" : cardTypeColors[card.type] || "#ddd";
  return (
    <div
      style={{ ...styles.card, borderColor, ...(selected ? styles.cardSelected : {}) }}
      onClick={onClick}
    >
      {card.id !== "hidden" && card.image && (
        <img src={`/cards/${card.image}`} alt={card.name} style={styles.cardImg} />
      )}
      <div style={styles.cardName}>{card.name}</div>
      {card.effect && <div style={styles.cardEffect}>{card.effect}</div>}
    </div>
  );
}

function PlayerHand({ cards }: { cards: Card[] }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>✋ Tu mano ({cards.length})</div>
      <div style={styles.hand}>
        {cards.map((c) => (
          <CardView key={c.id} card={c} />
        ))}
      </div>
    </div>
  );
}

function PlayerStable({ player, isMe }: { player: { id: string; name: string; stable: Card[] }; isMe: boolean }) {
  return (
    <div style={{ ...styles.section, opacity: isMe ? 1 : 0.8 }}>
      <div style={styles.sectionTitle}>
        🏠 Establo de {player.name} {isMe ? "(tú)" : ""} ({player.stable.length})
      </div>
      <div style={styles.stable}>
        {player.stable.map((c) => (
          <CardView key={c.id} card={c} />
        ))}
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────
export default function App() {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [lobby, setLobby] = useState<LobbyPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);

  // Baby selection
  const [availableBabies, setAvailableBabies] = useState<Card[]>([]);
  const [isSelectingBaby, setIsSelectingBaby] = useState(false);

  // Game
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myIndex, setMyIndex] = useState(-1);

  useEffect(() => {
    const s: TypedSocket = io();
    setSocket(s);

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    s.on("lobby_update", (data) => {
      setLobby(data.players);
      const me = data.players.find((p) => p.id === s.id);
      if (me) setIsHost(me.isHost);
    });

    s.on("baby_selection_start", ({ availableBabies }) => {
      setAvailableBabies(availableBabies);
      setIsSelectingBaby(true);
    });

    s.on("baby_selection_update", (data) => {
      setLobby(data.players);
    });

    s.on("game_start", ({ state, yourIndex }) => {
      setIsSelectingBaby(false);
      setGameState(state);
      setMyIndex(yourIndex);
    });

    s.on("game_update", ({ state }) => {
      setGameState(state);
    });

    s.on("error", ({ message }) => {
      alert(message);
    });

    return () => { s.close(); };
  }, []);

  function handleJoin() {
    if (!socket || !name.trim()) return;
    socket.emit("join_lobby", { name: name.trim() });
    setJoined(true);
  }

  function handleStart() {
    if (socket) socket.emit("start_game");
  }

  function handleSelectBaby(cardId: string) {
    if (socket) socket.emit("select_baby", { cardId });
  }

  const myPlayer = gameState ? gameState.players[myIndex] : null;
  const currentPlayer = gameState ? gameState.players[gameState.currentPlayerIndex] : null;
  const isMyTurn = myPlayer && currentPlayer && myPlayer.id === currentPlayer.id;
  const selectedBabyIds = lobby.filter((p) => p.babyId).map((p) => p.babyId);

  if (!connected) return <Loading message="Conectando al servidor..." />;

  // ─── Join screen ─────────────────────────────────────────
  if (!joined) {
    return (
      <div style={{ background: "#0f172a", minHeight: "100vh", paddingTop: 80 }}>
        <div style={styles.app}>
          <div style={{ ...styles.title, fontSize: 40, marginBottom: 16 }}>🦄</div>
          <h1 style={{ ...styles.title, fontSize: 28 }}>Unstable Unicorns</h1>
          <p style={{ textAlign: "center", color: "#64748b", marginBottom: 24 }}>
            Juego de cartas estratégico
          </p>
          <div style={{ textAlign: "center" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              style={styles.input}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button onClick={handleJoin} style={{ ...styles.btn, ...styles.btnPrimary }}>
              Unirse
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Baby Selection ──────────────────────────────────────
  if (isSelectingBaby) {
    return (
      <div style={{ background: "#0f172a", minHeight: "100vh", paddingTop: 40 }}>
        <div style={styles.app}>
          <h2 style={{ ...styles.title, marginBottom: 8 }}>🦄 Elige tu Bebé Unicornio</h2>
          <p style={{ textAlign: "center", color: "#94a3b8", marginBottom: 16 }}>
            Cada jugador elige un bebé único
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {availableBabies.map((baby) => {
              const taken = selectedBabyIds.includes(baby.id);
              const selectedByMe = lobby.find((p) => p.id === socket?.id)?.babyId === baby.id;
              return (
                <div
                  key={baby.id}
                  style={{
                    ...styles.babyOption,
                    opacity: taken && !selectedByMe ? 0.3 : 1,
                    ...(selectedByMe ? { transform: "scale(1.1)" } : {}),
                  }}
                  onClick={() => !taken && handleSelectBaby(baby.id)}
                >
                  {baby.image && (
                    <img
                      src={`/cards/${baby.image}`}
                      alt={baby.name}
                      style={{
                        ...styles.babyImg,
                        borderColor: selectedByMe ? "#7c3aed" : taken ? "#666" : "#333",
                      }}
                    />
                  )}
                  <div style={styles.babyName}>{baby.name}</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <p style={{ color: "#64748b", fontSize: 13 }}>
              {lobby.filter((p) => p.babyId).length} de {lobby.length} jugadores listos
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
              {lobby.map((p) => (
                <span key={p.id} style={{ color: p.babyId ? "#22c55e" : "#64748b", fontSize: 12 }}>
                  {p.name} {p.babyId ? "✅" : "⏳"}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Game Board ──────────────────────────────────────────
  if (gameState) {
    return (
      <div style={{ background: "#0f172a", minHeight: "100vh", paddingTop: 16 }}>
        <div style={styles.app}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={styles.title}>🦄 Unstable Unicorns</div>
            <div style={styles.phase}>
              Turno de: {currentPlayer?.name} {isMyTurn ? "(tú)" : ""}
              {" · "}
              {gameState.phase === "beginning" ? "Inicio" :
               gameState.phase === "draw" ? "Robo" :
               gameState.phase === "action" ? "Acción" :
               "Final"}
            </div>
          </div>

          {/* Other players */}
          {gameState.players
            .filter((p) => p.id !== myPlayer?.id)
            .map((p) => (
              <PlayerStable key={p.id} player={p} isMe={false} />
            ))}

          {/* My stable */}
          {myPlayer && <PlayerStable player={myPlayer} isMe={true} />}

          {/* My hand */}
          {myPlayer && <PlayerHand cards={myPlayer.hand} />}

          {/* End turn button */}
          {isMyTurn && gameState.phase === "action" && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button
                onClick={() => socket?.emit("end_turn")}
                style={{ ...styles.btn, ...styles.btnSuccess, fontSize: 18, padding: "12px 32px" }}
              >
                Terminar turno
              </button>
            </div>
          )}

          {/* Winner */}
          {gameState.winner && (
            <div style={{ ...styles.section, textAlign: "center" }}>
              <div style={{ color: "#fbbf24", fontSize: 20, fontWeight: "bold" }}>
                🏆 ¡{gameState.players.find((p) => p.id === gameState.winner)?.name} gana!
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Lobby ───────────────────────────────────────────────
  return (
    <div style={{ background: "#0f172a", minHeight: "100vh", paddingTop: 40 }}>
      <div style={styles.app}>
        <div style={{ ...styles.title, fontSize: 40, marginBottom: 8 }}>🦄</div>
        <h2 style={{ ...styles.title, marginBottom: 16 }}>Sala de espera</h2>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Jugadores ({lobby.length})</div>
          {lobby.map((p) => (
            <div key={p.id} style={styles.playerRow}>
              {p.isHost ? "👑 " : ""}{p.name}
            </div>
          ))}
        </div>

        {isHost && (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button
              onClick={handleStart}
              style={{ ...styles.btn, ...(lobby.length < 2 ? styles.btnDisabled : styles.btnPrimary), fontSize: 18 }}
              disabled={lobby.length < 2}
            >
              {lobby.length < 2 ? "Esperando jugadores..." : "¡Empezar partida!"}
            </button>
          </div>
        )}

        {!isHost && (
          <p style={{ textAlign: "center", color: "#64748b", marginTop: 16 }}>
            Esperando a que el anfitrión inicie la partida...
          </p>
        )}
      </div>
    </div>
  );
}
