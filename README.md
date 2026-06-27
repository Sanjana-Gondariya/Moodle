# Moodle

**Moodle** is a real-time pixel-art drawing and guessing game. Players create private or public rooms, draw mystery words, chat, score points, or compete against server-controlled AI players. It supports mouse, touch, hand gestures, spectators, reconnects, and mobile screens without requiring an account.

## Demo

Install dependencies and create the local environment file.

```bash
npm install
cp .env.example .env
```

Add `OPENAI_API_KEY` to `.env` for AI canvas guesses. Then run the API and frontend in separate terminals.

```bash
npm run dev:api
npm run dev
```

```text
http://127.0.0.1:5173/
```

## Project Structure

```mermaid
flowchart TD
  A["React Client"] <-->|"WebSocket events"| B["Node Game Server"]
  A --> C["Lobby, Canvas, Chat"]
  A --> D["Mouse, Touch, Hand Input"]
  B --> E["Rooms, Turns, Timers"]
  B --> F["Words, Guesses, Scores"]
  B --> G["Server AI Players"]
  B --> H["Validation and Rate Limits"]
  B --> I["Room Snapshots"]
  G --> J["OpenAI Vision"]
  I --> K["Persistent Disk"]
```

```text
src/
  components/     Canvas, cursor, toolbar, and interface panels
  hooks/          Drawing, pointer, gesture, and hand-tracking logic
  utils/          Detection, coordinate mapping, and stroke rendering
  App.tsx         Homepage, lobby, game, chat, and real-time room client
  App.css         Responsive pixel-art interface
server/
  index.js        HTTP, WebSocket, rooms, AI, timers, and persistence
  index.test.js   Protocol, validation, and sanitization tests
```

## Frontend

| Area | Purpose |
| --- | --- |
| Homepage | Creates, joins, watches, or browses rooms |
| Lobby | Configures rounds, timer, words, AI, and room visibility |
| Drawing room | Shows the canvas, hints, timer, players, scores, and chat |
| Canvas | Supports mouse, touch, and hand-based drawing |
| End screen | Displays rankings and supports another game |

## Special Features

- Real-time private and public rooms
- Server-controlled words, timer, guesses, and scores
- AI guessing and gradual AI drawing
- Three-word drawer choice with automatic selection
- Spectator links and reconnect recovery
- Progressive word hints and drawing replay
- Chat filtering, rate limits, reports, and vote-kick
- Custom words, difficulty levels, themes, and sound

## How It Works

1. A player creates, joins, or watches a room from the homepage.
2. The server chooses the drawer and privately offers three words for five seconds.
3. The drawer sends validated stroke events through a WebSocket connection.
4. Guessers receive progressive hints and submit answers through real-time chat.
5. The server validates guesses, awards points, advances rounds, and persists room history.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Drawing | HTML Canvas |
| Hand tracking | MediaPipe Tasks Vision |
| Server | Node.js HTTP and WebSockets |
| AI | OpenAI Responses API |
| Persistence | Atomic JSON snapshots |
| Testing | Node test runner, ESLint |
| Deployment | Docker, Render blueprint |
| Styling | CSS |
