# Unstable Unicorns - Contexto del proyecto

## Stack
- **Cliente**: React + TypeScript + Vite (web app responsive, PWA-ready)
- **Servidor**: Node.js + Express + Socket.IO + TypeScript
- **Compartido**: Módulo `shared/` con tipos TypeScript + datos de cartas
- **Monorepo**: npm workspaces (shared, server, client)

## Arquitectura
- El servidor se ejecuta en el portátil del host (localhost:3000)
- En desarrollo: client en localhost:5173 con proxy a server
- En producción: `npm run build -w client` + server sirve archivos estáticos
- Los jugadores se conectan desde el móvil a `http://IP_LOCAL:3000`
- Comunicación en tiempo real via Socket.IO

## Estado actual - Fase 2 completada
Estructura del proyecto creada y funcionando:
- Server con Express + Socket.IO + lobby + selección de bebés + motor de juego básico
- Client con React + Vite (pantallas: unirse, lobby, elegir bebé, tablero de juego)
- Tipos compartidos (Card, Player, GameState, efectos, eventos)
- **127 cartas del Base Deck 2nd Edition** en español
- Sistema de efectos (al entrar, inicio de turno, continuo, instantáneo)
- Reglas para 2 jugadores (quitar cartas específicas, dar Relincho extra)
- Selección de Bebé Unicornio (cada jugador elige uno único)
- UI en español
- Repo en GitHub: https://github.com/R4c50p4z/Unstable-Unicorns.git

## Próximos pasos (Fase 3)
- Game Engine completo: jugar cartas, fases de turno, sistema de Relinchos
- Efectos de cartas Mágicas, Ventajas, Desventajas
- Condición de victoria + desempate
- Descargar imágenes de cartas de Unstable Games Wiki
- Mejoras de UI/UX

## Decisiones tomadas
- Juego base solamente (sin expansiones)
- Multijugador local via red WiFi (LAN party)
- Imágenes de cartas desde Unstable Games Wiki (uso personal)
- Todo el juego en español (nombres oficiales de la edición española)
- Selección de Bebé Unicornio al inicio (skin única por jugador)

## Cómo arrancar
```bash
npm run dev    # Server:3000 + Client:5173
```
