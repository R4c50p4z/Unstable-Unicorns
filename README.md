# Unstable Unicorns

Versión web multijugador del juego de cartas **Unstable Unicorns (Base Deck 2nd Edition)** para jugar por LAN.

Cada jugador se conecta desde el navegador de su móvil a la IP del host. Ideal para jugar en casa sin instalar nada.

## Stack

- **Cliente:** React + TypeScript + Vite (responsive, PWA-ready)
- **Servidor:** Node.js + Express + Socket.IO + TypeScript
- **Compartido:** Módulo `shared/` con tipos y datos de cartas
- **Monorepo:** npm workspaces (shared, server, client)

## Cómo arrancar

```bash
npm run dev
```

Esto levanta el servidor en `localhost:3000` y el cliente en `localhost:5173` con proxy al servidor.

Para que otros jugadores se conecten desde sus móviles:

1. Averigua la IP local del host (`ipconfig` en Windows, `ifconfig` en Linux/Mac)
2. Los jugadores abren `http://IP_LOCAL:3000` en su navegador
3. Cada uno escribe su nombre y pulsa "Unirse"
4. El anfitrión pulsa "Empezar partida" cuando estén todos

## Cómo se juega

1. Cada jugador elige un **Bebé Unicornio** único
2. El juego reparte 5 cartas a cada uno y un Relincho extra en partidas de 2 jugadores
3. Por turnos: **Inicio** → **Robo** (robar 1 carta) → **Acción** (jugar cartas) → **Final** (descartar a 7 cartas)
4. Para jugar una carta, púlsala en tu mano durante tu fase de Acción
5. Los rivales pueden **Relinchar** tus cartas para anularlas
6. Gana el primero en tener **7 Unicornios** en su establo (6 si hay 6+ jugadores)

## Estado actual (Fase 3 — completa)

- **Fase 1:** Estructura del proyecto, tipos compartidos, 127 cartas en español
- **Fase 2:** Lobby con sockets, selección de bebés, imágenes descargadas, UI completa
- **Fase 3:** Game engine completo con fases de turno, sistema de Relinchos, y efectos de cartas:
  - Turnos automáticos (Inicio → Robo → Acción → Final)
  - Jugar cartas desde la mano (click en la carta)
  - Sistema de Relincho en tiempo real (otros jugadores pueden anular tu carta)
  - Efectos de cartas básicos (robar, destruir, descartar, sacrificar) con selección de objetivos
  - Límite de mano (máximo 7 cartas al final del turno)
  - Condición de victoria automática (7 unicornios en establo)
  - Notificaciones en pantalla de cada acción

## Estructura del proyecto

```
shared/src/index.ts  # Tipos TypeScript (Card, Player, GameState, eventos Socket.IO)
shared/src/cards.ts  # Array con las 127 cartas del Base Deck 2nd Edition en español
server/src/index.ts  # Express + Socket.IO + game engine completo (fases, efectos, relinchos)
client/src/App.tsx   # React + Vite (pantallas: unirse, lobby, bebés, tablero con juego completo)
client/public/cards/ # 84 imágenes de cartas descargadas de Unstable Games Wiki
```

## Licencia

**Código:** MIT — el código fuente de este proyecto (React, Express, Socket.IO) es libre de usar, modificar y distribuir.

**Contenido:** Unstable Unicorns es propiedad de **Unstable Games**. Las imágenes de las cartas, nombres y marca pertenecen a Unstable Games y se incluyen únicamente para uso personal/educativo. No se concede permiso para uso comercial de estos assets.

## Legal

Proyecto sin ánimo de lucro para uso personal/local. Unstable Unicorns es propiedad de **Unstable Games**. Las imágenes de las cartas pertenecen a Unstable Games y se usan únicamente con fines educativos y de juego privado.
