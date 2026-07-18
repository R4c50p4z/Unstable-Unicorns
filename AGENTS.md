# Unstable Unicorns - Contexto del proyecto

## Stack
- **Cliente**: React + TypeScript + Vite (web app responsive, PWA-ready)
- **Servidor**: Node.js + Express + Socket.IO + TypeScript
- **Compartido**: Módulo `shared/` con tipos TypeScript
- **Monorepo**: npm workspaces (shared, server, client)

## Arquitectura
- El servidor se ejecuta en el portátil del host (localhost:3000)
- En desarrollo: client en localhost:5173 con proxy a server
- En producción: `npm run build -w client` + server sirve archivos estáticos
- Los jugadores se conectan desde el móvil a `http://IP_LOCAL:3000`
- Comunicación en tiempo real via Socket.IO

## Estado actual - Fase 1 completada
Estructura del proyecto creada y funcionando:
- Server básico con Express + Socket.IO + lobby
- Client con React + Vite conectado al server via Socket.IO
- Tipos compartidos (Card, Player, GameState, eventos)
- Repo en GitHub: https://github.com/R4c50p4z/Unstable-Unicorns.git

## Próxima fase (Fase 2)
- Datos completos de las ~135 cartas del Base Deck 2nd Edition en JSON
- Descargar imágenes de cartas de Unstable Games Wiki
- Sistema de efectos de cartas (pendiente de diseñar)

## Decisiones tomadas
- Juego base solamente (sin expansiones)
- Multijugador local via red WiFi (LAN party)
- Imágenes de cartas desde Unstable Games Wiki (uso personal)
- Modo hot-seat NO, cada jugador desde su propio móvil

## Cómo arrancar
```bash
npm run dev    # Server:3000 + Client:5173
```
