import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "shared";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
}

export default function App() {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [lobby, setLobby] = useState<LobbyPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);

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

  if (!connected) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif", textAlign: "center" }}>
        <h1>🦄 Unstable Unicorns</h1>
        <p>Conectando al servidor...</p>
      </div>
    );
  }

  if (!joined) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif", textAlign: "center" }}>
        <h1>🦄 Unstable Unicorns</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          style={{ padding: 8, fontSize: 16, marginRight: 8 }}
        />
        <button onClick={handleJoin} style={{ padding: "8px 16px", fontSize: 16 }}>
          Unirse
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", textAlign: "center" }}>
      <h1>🦄 Lobby</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {lobby.map((p) => (
          <li key={p.id} style={{ margin: 8 }}>
            {p.name} {p.isHost ? "👑" : ""}
          </li>
        ))}
      </ul>
      {isHost && (
        <button onClick={handleStart} style={{ padding: "12px 24px", fontSize: 18, marginTop: 16 }}>
          Empezar partida
        </button>
      )}
    </div>
  );
}
