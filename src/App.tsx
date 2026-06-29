import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { DrawingCanvas } from './components/DrawingCanvas'
import { Toolbar } from './components/Toolbar'
import { useGestureInputController } from './hooks/useGestureInputController'
import { useDrawingState } from './hooks/useDrawingState'
import { useMediaPipeHandTracking } from './hooks/useMediaPipeHandTracking'
import { DEFAULT_BRUSH_COLOR, DEFAULT_BRUSH_SIZE } from './utils/constants'
import type { Stroke, ToolMode } from './types/drawing'
import './App.css'

const WORD_OPTIONS = ['MOODLE', 'ROCKET', 'PIZZA', 'CASTLE', 'ROBOT', 'FLOWER', 'SUN', 'CAT']
const ROUND_SECONDS = 60
const LOCAL_API_ORIGIN = 'http://127.0.0.1:8787'
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || (import.meta.env.PROD ? window.location.origin : LOCAL_API_ORIGIN)
const PIXEL_PAL_API_URL = import.meta.env.VITE_PIXEL_PAL_API_URL || `${API_ORIGIN}/api/guess`
const ROOM_API_URL = import.meta.env.VITE_ROOM_API_URL || `${API_ORIGIN}/api/rooms`
const PUBLIC_ROOMS_API_URL = import.meta.env.VITE_PUBLIC_ROOMS_API_URL || `${API_ORIGIN}/api/public-rooms`
const ROOM_WS_URL =
  import.meta.env.VITE_ROOM_WS_URL ||
  `${API_ORIGIN.replace(/^http/, 'ws')}/ws`
const AVATAR_OPTIONS = [
  { id: 'cat', label: 'Cat', icon: '🐱' },
  { id: 'star', label: 'Star', icon: '⭐' },
  { id: 'fish', label: 'Fish', icon: '🐟' },
  { id: 'robot', label: 'Robot', icon: '🤖' },
]
const AI_PLAYERS = [
  { id: 'pixel-pal', name: 'Pixel Pal', avatar: 'robot' },
  { id: 'Sketch Bot', name: 'Sketch Bot', avatar: 'star' },
  { id: 'Doodle AI', name: 'Doodle AI', avatar: 'fish' },
  { id: 'Line Buddy', name: 'Line Buddy', avatar: 'cat' },
]
const AI_WRONG_GUESSES = ['HOUSE', 'TREE', 'CLOUD', 'BOOK', 'CHAIR', 'STAR']
const AI_DIFFICULTY_CONFIG = {
  easy: { pointStep: 95, delayMs: 5200, accuracy: 0.35 },
  medium: { pointStep: 62, delayMs: 3200, accuracy: 0.58 },
  hard: { pointStep: 38, delayMs: 1700, accuracy: 0.78 },
} as const

interface ChatMessage {
  name: string
  text: string
  role?: 'player' | 'ai' | 'system'
  correct?: boolean
}

interface GameNotification {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

interface RoomPlayer {
  id: string
  name: string
  avatar: string
  score: number
  isAi: boolean
  isSpectator: boolean
  disconnected: boolean
  guessed: boolean
  isDrawer: boolean
  isHost: boolean
}

type AiDifficulty = keyof typeof AI_DIFFICULTY_CONFIG

interface AiSettings {
  count: number
  difficulty: AiDifficulty
  canDraw: boolean
}

interface RoomSettings {
  rounds: number
  drawTime: number
  maxPlayers: number
  aiDifficulty: AiDifficulty
  aiCanDraw: boolean
  isPublic: boolean
  language: 'en' | 'es'
  wordDifficulty: 'easy' | 'medium' | 'hard'
  customWordMode: 'disabled' | 'mixed' | 'only'
  customWords: string[]
}

interface PublicRoom {
  code: string
  playerCount: number
  maxPlayers: number
  phase: string
  rounds: number
  drawTime: number
  aiDifficulty: AiDifficulty
  aiCanDraw: boolean
  language: string
  wordDifficulty: string
}

interface AiPlayer {
  id: string
  name: string
  avatar: string
  score: number
  guessed: boolean
}

function normalizeGuess(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
}

function sanitizeDisplayName(value: string) {
  return value.replace(/[<>]/g, '').slice(0, 20)
}

function isValidDisplayName(value: string) {
  const trimmed = value.trim()
  return trimmed.length >= 3 && trimmed.length <= 20
}

function avatarIcon(avatarId: string) {
  return AVATAR_OPTIONS.find((avatar) => avatar.id === avatarId)?.icon || 'P'
}

function getAnonymousSessionId() {
  const existing = localStorage.getItem('moodle-session-id')
  if (existing) return existing
  const next = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  localStorage.setItem('moodle-session-id', next)
  return next
}

async function createServerRoom() {
  const response = await fetch(ROOM_API_URL, { method: 'POST' })
  const payload = await response.json()
  if (!response.ok || typeof payload.roomCode !== 'string') {
    throw new Error(payload.error || 'Could not create room.')
  }
  return payload.roomCode
}

async function requestPixelPalGuess(imageDataUrl: string) {
  const response = await fetch(PIXEL_PAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageDataUrl,
      wordOptions: WORD_OPTIONS,
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || 'Pixel Pal could not guess.')
  }

  return String(payload.guess || '').trim()
}

function createAiPlayers(count: number): AiPlayer[] {
  return AI_PLAYERS.slice(0, count).map((player) => ({
    ...player,
    score: 0,
    guessed: false,
  }))
}

function pickWrongAiGuess(currentWord: string) {
  const options = AI_WRONG_GUESSES.filter((guess) => normalizeGuess(guess) !== normalizeGuess(currentWord))
  return options[Math.floor(Math.random() * options.length)] || 'SKETCH'
}

function PixelBackdrop() {
  return (
    <>
      <div className="sky-bg" />
      <svg
        className="mountain-layer"
        viewBox="0 0 1440 280"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <polygon points="0,280 150,90 300,280" fill="#4A7878" />
        <polygon points="80,280 240,110 400,280" fill="#3A6868" />
        <polygon points="260,280 480,68 700,280" fill="#4A8080" />
        <polygon points="460,280 660,88 860,280" fill="#3A6868" />
        <polygon points="680,280 880,55 1080,280" fill="#4A7878" />
        <polygon points="900,280 1100,78 1300,280" fill="#3A6060" />
        <polygon points="1080,280 1280,98 1440,280 1440,280 0,280" fill="#4A7878" />
        <polygon points="150,90 133,134 167,134" fill="#D8E8F8" />
        <polygon points="480,68 460,116 500,116" fill="#E0EEF8" />
        <polygon points="880,55 858,106 902,106" fill="#E0EEF8" />
        <polygon points="0,280 190,148 380,280" fill="#2E5050" />
        <polygon points="260,280 450,118 640,280" fill="#3A6060" />
        <polygon points="560,280 780,128 1000,280" fill="#2E5050" />
        <polygon points="860,280 1060,108 1260,280" fill="#3A6060" />
        <polygon points="1180,280 1360,148 1440,280" fill="#2E5050" />
        <polygon points="190,148 172,196 208,196" fill="#F0F8FF" />
        <polygon points="450,118 430,166 470,166" fill="#E8F4FF" />
        <polygon points="780,128 758,178 802,178" fill="#F0F8FF" />
        <polygon points="1060,108 1040,158 1080,158" fill="#E8F4FF" />
        <rect x="0" y="262" width="1440" height="18" fill="#264040" />
      </svg>
      <div className="cloud-layer" aria-hidden>
        <svg className="cloud c1" width="200" height="88" viewBox="0 0 200 88">
          <rect x="44" y="52" width="112" height="28" fill="#E8F4FF" />
          <rect x="30" y="42" width="44" height="18" fill="#E8F4FF" />
          <rect x="70" y="34" width="60" height="22" fill="#E8F4FF" />
          <rect x="124" y="44" width="36" height="16" fill="#E8F4FF" />
          <rect x="44" y="64" width="112" height="10" fill="#C8D8F0" />
        </svg>
        <svg className="cloud c2" width="140" height="70" viewBox="0 0 140 70">
          <rect x="28" y="36" width="84" height="24" fill="#EEF8FF" />
          <rect x="18" y="28" width="38" height="16" fill="#EEF8FF" />
          <rect x="52" y="22" width="46" height="18" fill="#EEF8FF" />
          <rect x="92" y="30" width="30" height="14" fill="#EEF8FF" />
          <rect x="28" y="50" width="84" height="10" fill="#D0E4F8" />
        </svg>
        <svg className="cloud c3" width="170" height="78" viewBox="0 0 170 78">
          <rect x="36" y="46" width="98" height="24" fill="#F0F8FF" />
          <rect x="24" y="36" width="40" height="18" fill="#F0F8FF" />
          <rect x="60" y="28" width="54" height="22" fill="#F0F8FF" />
          <rect x="108" y="38" width="34" height="16" fill="#F0F8FF" />
          <rect x="36" y="58" width="98" height="10" fill="#D4E8F8" />
        </svg>
      </div>
      <svg
        className="ground-strip"
        viewBox="0 0 1440 28"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect x="0" y="0" width="1440" height="12" fill="#264040" />
        <rect x="0" y="12" width="1440" height="8" fill="#1A2E2E" />
        <rect x="0" y="20" width="1440" height="8" fill="#0E1E1E" />
        <rect x="40" y="0" width="8" height="4" fill="#38C040" />
        <rect x="160" y="0" width="8" height="4" fill="#38C040" />
        <rect x="360" y="0" width="8" height="4" fill="#38C040" />
        <rect x="600" y="0" width="8" height="4" fill="#38C040" />
        <rect x="800" y="0" width="8" height="4" fill="#38C040" />
        <rect x="1050" y="0" width="8" height="4" fill="#38C040" />
        <rect x="1280" y="0" width="8" height="4" fill="#38C040" />
      </svg>
    </>
  )
}

function HomeScreen({
  onCreateRoom,
  onJoinRoom,
  onPlayAi,
  activeRoomCode,
}: {
  onCreateRoom: (name: string, avatar: string, settings: RoomSettings, aiCount: number) => void
  onJoinRoom: (code: string, name: string, avatar: string, spectator?: boolean) => void
  onPlayAi: (name: string, avatar: string, settings: AiSettings) => void
  activeRoomCode: string | null
}) {
  const [joinCode, setJoinCode] = useState('')
  const [setupMode, setSetupMode] = useState<'create' | 'join' | 'ai' | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]!.id)
  const [aiCount, setAiCount] = useState(1)
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('medium')
  const [aiCanDraw, setAiCanDraw] = useState(false)
  const [createAiCount, setCreateAiCount] = useState(0)
  const [createSettings, setCreateSettings] = useState<RoomSettings>({
    rounds: 3,
    drawTime: ROUND_SECONDS,
    maxPlayers: 8,
    aiDifficulty: 'medium',
    aiCanDraw: false,
    isPublic: false,
    language: 'en',
    wordDifficulty: 'medium',
    customWordMode: 'disabled',
    customWords: [],
  })
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([])
  const [publicRoomsStatus, setPublicRoomsStatus] = useState('')
  const trimmedName = displayName.trim()
  const nameValid = isValidDisplayName(displayName)

  const handleJoinSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const code = normalizeRoomCode(joinCode)
      if (code.length !== 5 || !nameValid) return
      onJoinRoom(code, trimmedName, avatar)
    },
    [avatar, joinCode, nameValid, onJoinRoom, trimmedName],
  )

  const handleCopyRoomCode = useCallback(() => {
    if (!activeRoomCode) return
    void navigator.clipboard?.writeText(activeRoomCode)
  }, [activeRoomCode])

  const refreshPublicRooms = useCallback(async () => {
    try {
      setPublicRoomsStatus('Loading rooms...')
      const response = await fetch(PUBLIC_ROOMS_API_URL)
      const payload = await response.json()
      setPublicRooms(Array.isArray(payload.rooms) ? payload.rooms : [])
      setPublicRoomsStatus('')
    } catch {
      setPublicRoomsStatus('Could not load public rooms.')
    }
  }, [])

  useEffect(() => {
    void refreshPublicRooms()
    const timerId = window.setInterval(refreshPublicRooms, 5000)
    return () => window.clearInterval(timerId)
  }, [refreshPublicRooms])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = normalizeRoomCode(params.get('room') || '')
    const spectator = params.get('spectate') === '1'
    if (code.length === 5) {
      setJoinCode(code)
      if (spectator && nameValid) {
        onJoinRoom(code, trimmedName, avatar, true)
      }
    }
  }, [avatar, nameValid, onJoinRoom, trimmedName])

  return (
    <main className="home-screen">
      <section className="home-hero" aria-labelledby="home-title">
        <p className="home-hero__eyebrow">Pixel drawing game</p>
        <h1 className="home-hero__title" id="home-title">
          Moodle
        </h1>
        <div className="home-mascot" aria-hidden>
          <div className="home-mascot__face">
            <span className="home-mascot__ear home-mascot__ear--left" />
            <span className="home-mascot__ear home-mascot__ear--right" />
            <span className="home-mascot__eye home-mascot__eye--left" />
            <span className="home-mascot__eye home-mascot__eye--right" />
            <span className="home-mascot__nose" />
            <span className="home-mascot__mouth" />
          </div>
          <div className="home-mascot__shadow" />
        </div>
        <div className="home-panel">
          <div className="px-panel-title">DRAWING ROOM</div>
          <div className="home-panel__body">
            <p>Sketch the word, chat with players, and draw by mouse, touch, or hand.</p>
            <div className="profile-setup">
              <label htmlFor="display-name">DISPLAY NAME</label>
              <input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(sanitizeDisplayName(event.target.value))}
                placeholder="3-20 letters"
                maxLength={20}
                aria-invalid={displayName.length > 0 && !nameValid}
              />
              <div className="avatar-picker" aria-label="Choose avatar">
                {AVATAR_OPTIONS.map((option) => (
                  <button
                    type="button"
                    className={avatar === option.id ? 'avatar-picker__btn avatar-picker__btn--active' : 'avatar-picker__btn'}
                    key={option.id}
                    onClick={() => setAvatar(option.id)}
                    aria-label={option.label}
                  >
                    {option.icon}
                  </button>
                ))}
              </div>
              {displayName.length > 0 && !nameValid && (
                <span className="profile-setup__error">Name must be 3-20 characters.</span>
              )}
            </div>
            <div className="home-actions" aria-label="Game modes">
              <button
                className="flag-btn"
                type="button"
                onClick={() => setSetupMode('create')}
                disabled={!nameValid}
              >
                CREATE ROOM
              </button>
              <button
                className="flag-btn flag-btn--secondary"
                type="button"
                onClick={() => setSetupMode('join')}
                disabled={!nameValid}
              >
                JOIN ROOM
              </button>
              <button
                className="flag-btn"
                type="button"
                onClick={() => setSetupMode('ai')}
                disabled={!nameValid}
              >
                PLAY WITH AI
              </button>
            </div>
            {setupMode === 'create' && (
              <section className="home-setup" aria-label="Create room settings">
                <div className="public-rooms__head"><span>CREATE ROOM SETTINGS</span></div>
                <div className="ai-settings">
                  <label>ROUNDS
                    <select value={createSettings.rounds} onChange={(event) => setCreateSettings((current) => ({ ...current, rounds: Number(event.target.value) }))}>
                      {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>DRAW TIME
                    <select value={createSettings.drawTime} onChange={(event) => setCreateSettings((current) => ({ ...current, drawTime: Number(event.target.value) }))}>
                      {[30, 45, 60, 90, 120].map((value) => <option key={value} value={value}>{value}s</option>)}
                    </select>
                  </label>
                  <label>MAX PLAYERS
                    <select value={createSettings.maxPlayers} onChange={(event) => setCreateSettings((current) => ({ ...current, maxPlayers: Number(event.target.value) }))}>
                      {[2, 4, 6, 8].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>AI PLAYERS
                    <select value={createAiCount} onChange={(event) => setCreateAiCount(Number(event.target.value))}>
                      {[0, 1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>AI LEVEL
                    <select value={createSettings.aiDifficulty} onChange={(event) => setCreateSettings((current) => ({ ...current, aiDifficulty: event.target.value as AiDifficulty }))}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                  <label className="ai-settings__toggle">
                    <input type="checkbox" checked={createSettings.isPublic} onChange={(event) => setCreateSettings((current) => ({ ...current, isPublic: event.target.checked }))} />
                    {createSettings.isPublic ? 'PUBLIC' : 'PRIVATE'}
                  </label>
                </div>
                <p className="setup-summary">
                  {createSettings.rounds} rounds · {createSettings.drawTime}s · {createSettings.maxPlayers} players · {createAiCount} AI · {createSettings.isPublic ? 'public' : 'private'}
                </p>
                <button className="px-btn px-btn--primary" type="button" disabled={!nameValid} onClick={() => onCreateRoom(trimmedName, avatar, createSettings, createAiCount)}>
                  CREATE ROOM
                </button>
              </section>
            )}
            {setupMode === 'ai' && (
              <section className="home-setup" aria-label="AI game settings">
                <div className="public-rooms__head"><span>PLAY WITH AI</span></div>
                <div className="ai-settings">
                  <label>AI PLAYERS
                    <select value={aiCount} onChange={(event) => setAiCount(Number(event.target.value))}>
                      {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>DIFFICULTY
                    <select value={aiDifficulty} onChange={(event) => setAiDifficulty(event.target.value as AiDifficulty)}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                  <label className="ai-settings__toggle">
                    <input type="checkbox" checked={aiCanDraw} onChange={(event) => setAiCanDraw(event.target.checked)} />
                    AI DRAW
                  </label>
                </div>
                <button className="px-btn px-btn--primary" type="button" disabled={!nameValid} onClick={() => onPlayAi(trimmedName, avatar, { count: aiCount, difficulty: aiDifficulty, canDraw: aiCanDraw })}>
                  CONTINUE
                </button>
              </section>
            )}
            {setupMode === 'join' && (
              <section className="home-setup" aria-label="Join room">
                <form className="join-room-form" onSubmit={handleJoinSubmit}>
                  <label htmlFor="join-room-code">ROOM CODE</label>
                  <div className="join-room-form__row">
                    <input id="join-room-code" value={joinCode} onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))} placeholder="5-CHARACTER CODE" maxLength={5} aria-label="Room code" aria-invalid={joinCode.length > 0 && joinCode.length !== 5} />
                    <button type="submit" disabled={joinCode.length !== 5 || !nameValid}>JOIN</button>
                    <button type="button" disabled={joinCode.length !== 5 || !nameValid} onClick={() => onJoinRoom(joinCode, trimmedName, avatar, true)}>WATCH</button>
                  </div>
                  {joinCode.length > 0 && joinCode.length !== 5 && <span className="profile-setup__error">Room codes contain 5 characters.</span>}
                </form>
                <div className="public-rooms" aria-label="Public rooms">
                  <div className="public-rooms__head"><span>PUBLIC ROOMS</span><button type="button" onClick={refreshPublicRooms}>REFRESH</button></div>
                  {publicRoomsStatus && <p>{publicRoomsStatus}</p>}
                  {publicRooms.length === 0 && !publicRoomsStatus && <p>No public rooms yet.</p>}
                  {publicRooms.map((room) => (
                    <button type="button" className="public-room" key={room.code} onClick={() => onJoinRoom(room.code, trimmedName, avatar)} disabled={!nameValid || room.playerCount >= room.maxPlayers}>
                      <strong>{room.code}</strong><span>{room.playerCount}/{room.maxPlayers} players</span><span>{room.wordDifficulty} · {room.language}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {activeRoomCode && (
              <div className="room-code-card" aria-live="polite">
                <span>ROOM CODE</span><strong>{activeRoomCode}</strong><button type="button" onClick={handleCopyRoomCode}>COPY</button>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

/**
 * Composes tool UI + drawing model + canvas view. Transport and ML stay out of this file.
 *
 * FUTURE: Socket.IO — subscribe to remote `Stroke` payloads and merge into the same model.
 * FUTURE: MediaPipe — mount gesture hook alongside `useCanvasPointerInput` (or behind a flag)
 *         and feed the shared `DrawingEngine` from landmark-driven coordinates.
 */
function App() {
  const {
    strokes,
    activeStroke,
    engine,
    syncToolSettings,
    canUndo,
    canRedo,
    addRemoteStroke,
    setStrokes,
  } = useDrawingState()
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const lastAiGuessStageRef = useRef(0)
  const aiGuessPendingRef = useRef(false)
  const roomSocketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectRoomRef = useRef<(code: string, name: string, avatar: string, spectator: boolean) => void>(
    () => undefined,
  )
  const pendingRoomSetupRef = useRef<{ settings: RoomSettings; aiCount: number } | null>(null)
  const roomPlayerIdRef = useRef<string | null>(null)
  const chatListRef = useRef<HTMLDivElement | null>(null)
  const sentStrokeIdsRef = useRef<Set<string>>(new Set())

  const [color, setColor] = useState(DEFAULT_BRUSH_COLOR)
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [mode, setMode] = useState<ToolMode>('draw')
  const [gestureEnabled, setGestureEnabled] = useState(true)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [screen, setScreen] = useState<'home' | 'game'>('home')
  const [gameMode, setGameMode] = useState<'ai' | 'room'>('ai')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('You')
  const [playerAvatar, setPlayerAvatar] = useState(AVATAR_OPTIONS[0]!.id)
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    count: 1,
    difficulty: 'medium',
    canDraw: false,
  })
  const [aiPlayers, setAiPlayers] = useState<AiPlayer[]>(createAiPlayers(1))
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([])
  const [roomPlayerId, setRoomPlayerId] = useState<string | null>(null)
  const [roomPhase, setRoomPhase] = useState<'lobby' | 'choosing' | 'drawing' | 'reveal' | 'ended'>('lobby')
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
    rounds: 3,
    drawTime: ROUND_SECONDS,
    maxPlayers: 8,
    aiDifficulty: 'medium',
    aiCanDraw: false,
    isPublic: false,
    language: 'en',
    wordDifficulty: 'medium',
    customWordMode: 'disabled',
    customWords: [],
  })
  const [currentRound, setCurrentRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(3)
  const [isDrawer, setIsDrawer] = useState(false)
  const [roomStatus, setRoomStatus] = useState('Offline')
  const [isSpectator, setIsSpectator] = useState(false)
  const [wordChoices, setWordChoices] = useState<string[]>([])
  const [choiceTimeLeft, setChoiceTimeLeft] = useState(0)
  const [isChoosingWord, setIsChoosingWord] = useState(false)
  const [currentWord, setCurrentWord] = useState(WORD_OPTIONS[0]!)
  const [hasCorrectGuess, setHasCorrectGuess] = useState(false)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [roundEnded, setRoundEnded] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [roundSummary, setRoundSummary] = useState<{ pointsEarned: Record<string, number>; nextDrawerName: string }>({
    pointsEarned: {},
    nextDrawerName: '',
  })
  const [notifications, setNotifications] = useState<GameNotification[]>([])
  const [theme, setTheme] = useState(() => localStorage.getItem('moodle-theme') || 'classic')
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('moodle-sound') !== 'off')
  const [localWins, setLocalWins] = useState(() => Number(localStorage.getItem('moodle-wins') || 0))
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { name: 'Moodle', text: 'Welcome to the drawing room.', role: 'system' },
    { name: 'Pixel Pal', text: 'AI player ready. I will inspect the canvas while you draw.', role: 'ai' },
  ])

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasElRef.current = canvas
  }, [])

  const notify = useCallback((message: string, tone: GameNotification['tone'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setNotifications((current) => [...current.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setNotifications((current) => current.filter((notification) => notification.id !== id))
    }, 3200)
  }, [])

  const playTone = useCallback(() => {
    if (!soundEnabled) return
    const AudioContextClass =
      window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 660
    gain.gain.value = 0.03
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
  }, [soundEnabled])

  useEffect(() => {
    localStorage.setItem('moodle-theme', theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    localStorage.setItem('moodle-sound', soundEnabled ? 'on' : 'off')
  }, [soundEnabled])

  useEffect(() => {
    const chatList = chatListRef.current
    if (chatList) chatList.scrollTop = chatList.scrollHeight
  }, [chatMessages])

  const handleClear = useCallback(() => {
    if (!window.confirm('Are you sure you want to clear the entire canvas?')) {
      return
    }
    engine.clear()
  }, [engine])

  const closeRoomSocket = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    reconnectAttemptsRef.current = 0
    const currentSocket = roomSocketRef.current
    roomSocketRef.current = null
    currentSocket?.close()
    sentStrokeIdsRef.current.clear()
    setIsDrawer(false)
    setRoomPlayers([])
    setRoomPlayerId(null)
    setRoomPhase('lobby')
    setIsSpectator(false)
    setRoomStatus('Offline')
  }, [])

  const connectRoomSocket = useCallback(
    (code: string, name: string, avatar: string, spectator = false) => {
      const reconnectAttempt = reconnectAttemptsRef.current
      closeRoomSocket()
      reconnectAttemptsRef.current = reconnectAttempt
      setRoomStatus('Connecting')
      setIsSpectator(spectator)
      const sessionId = getAnonymousSessionId()
      const socket = new WebSocket(
        `${ROOM_WS_URL}?room=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(avatar)}&session=${encodeURIComponent(sessionId)}&spectator=${spectator ? '1' : '0'}`,
      )
      roomSocketRef.current = socket

      socket.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0
        setRoomStatus('Connected')
      })

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)

        if (message.type === 'room_state') {
          setRoomCode(message.roomCode)
          setRoomPlayerId(message.playerId || null)
          roomPlayerIdRef.current = message.playerId || null
          setIsSpectator(Boolean(message.isSpectator))
          setRoomPhase(message.phase || 'lobby')
          setRoomSettings(message.settings || {
            rounds: 3,
            drawTime: ROUND_SECONDS,
            maxPlayers: 8,
            aiDifficulty: 'medium',
            aiCanDraw: false,
            isPublic: false,
            language: 'en',
            wordDifficulty: 'medium',
            customWordMode: 'disabled',
            customWords: [],
          })
          setIsDrawer(Boolean(message.isDrawer))
          setRoomPlayers(message.players || [])
          setTimeLeft(message.timeLeft ?? ROUND_SECONDS)
          setCurrentWord(
            message.word ||
            message.wordHint ||
            (message.wordLength ? '_'.repeat(message.wordLength) : 'LOBBY'),
          )
          setIsChoosingWord(Boolean(message.choosingWord))
          setWordChoices(message.wordOptions || [])
          setChoiceTimeLeft(message.choiceTimeLeft || 0)
          setCurrentRound(message.round || 1)
          setTotalRounds(message.totalRounds || 3)
          setRoundEnded(message.phase === 'reveal' || message.phase === 'ended')
          setHasCorrectGuess(Boolean((message.players || []).find((player: RoomPlayer) => player.id === message.playerId)?.guessed))
          setStrokes(message.strokes || [])
          sentStrokeIdsRef.current = new Set((message.strokes || []).map((stroke: Stroke) => stroke.id))
          const pendingSetup = pendingRoomSetupRef.current
          if (pendingSetup && message.playerId === message.hostId) {
            socket.send(JSON.stringify({ type: 'update_settings', settings: pendingSetup.settings }))
            for (let index = 0; index < pendingSetup.aiCount; index += 1) {
              socket.send(JSON.stringify({ type: 'add_ai' }))
            }
            pendingRoomSetupRef.current = null
          }
          return
        }

        if (message.type === 'timer') {
          setTimeLeft(message.timeLeft)
          if (message.wordHint) {
            setCurrentWord((current) => current.includes('_') ? message.wordHint : current)
          }
          return
        }

        if (message.type === 'word_choice_tick') {
          setChoiceTimeLeft(message.choiceTimeLeft)
          return
        }

        if (message.type === 'word_chosen') {
          setRoomPhase('drawing')
          setRoundEnded(false)
          setHasCorrectGuess(false)
          setIsChoosingWord(false)
          setWordChoices([])
          setChoiceTimeLeft(0)
          setChatMessages((current) => [
            ...current,
            {
              name: 'Moodle',
              text: message.automatic ? 'Time ran out, so Moodle picked a word.' : 'The drawer picked a word.',
              role: 'system',
            },
          ])
          notify('New drawing turn started.')
          return
        }

        if (message.type === 'drawing_stroke') {
          addRemoteStroke(message.stroke)
          return
        }

        if (message.type === 'chat_message') {
          setChatMessages((current) => [
            ...current,
            { name: message.playerName || 'Player', text: message.text, role: message.role || 'player' },
          ])
          return
        }

        if (message.type === 'system_message') {
          setChatMessages((current) => [
            ...current,
            { name: 'Moodle', text: message.message || 'Room update.', role: 'system' },
          ])
          return
        }

        if (message.type === 'correct_guess') {
          playTone()
          setRoomPlayers(message.players || [])
          if (message.playerId === roomPlayerIdRef.current) setHasCorrectGuess(true)
          setChatMessages((current) => [
            ...current,
            {
              name: 'Moodle',
              text: `${message.playerName} guessed correctly.`,
              role: 'system',
              correct: true,
            },
          ])
          notify(
            message.playerId === roomPlayerIdRef.current ? 'Correct guess! Points awarded.' : `${message.playerName} guessed correctly.`,
            'success',
          )
          return
        }

        if (message.type === 'round_reveal') {
          setRoomPhase('reveal')
          setCurrentWord(message.word)
          setRoomPlayers(message.players || [])
          setRoundEnded(true)
          setRoundSummary({
            pointsEarned: message.pointsEarned || {},
            nextDrawerName: message.nextDrawerName || '',
          })
          setChatMessages((current) => [
            ...current,
            {
              name: 'Moodle',
              text: `${message.reason} The word was ${message.word}.`,
              role: 'system',
            },
          ])
          notify(`Round ended. The word was ${message.word}.`)
          return
        }

        if (message.type === 'game_ended') {
          playTone()
          setRoomPhase('ended')
          setRoomPlayers(message.players || [])
          setRoundEnded(true)
          const winner = message.players?.[0]?.name
          if (winner === playerName) {
            setLocalWins((current) => {
              const next = current + 1
              localStorage.setItem('moodle-wins', String(next))
              return next
            })
          }
          setChatMessages((current) => [
            ...current,
            {
              name: 'Moodle',
              text: winner ? `Game ended. ${winner} wins.` : 'Game ended.',
              role: 'system',
              correct: true,
            },
          ])
          notify(winner ? `${winner} wins the game!` : 'Game completed.', 'success')
          return
        }

        if (message.type === 'player_joined' || message.type === 'player_left') {
          setRoomPlayers(message.players || [])
          setChatMessages((current) => [
            ...current,
            {
              name: 'Moodle',
              text:
                message.type === 'player_joined'
                  ? `${message.player.name} joined the room.`
                  : `${message.playerName || 'A player'} left the room.`,
              role: 'system',
            },
          ])
          notify(
            message.type === 'player_joined'
              ? `${message.player.name} joined.`
              : `${message.playerName || 'A player'} left.`,
          )
          return
        }

        if (message.type === 'error') {
          notify(message.message || 'Room error. Try again.', 'error')
          setChatMessages((current) => [
            ...current,
            { name: 'Moodle', text: message.message || 'Room error.', role: 'system' },
          ])
          return
        }

        if (message.type === 'join_error') {
          setRoomStatus('Error')
          notify(`${message.message || 'Could not join room.'} Check the code and try again.`, 'error')
          setChatMessages((current) => [
            ...current,
            { name: 'Moodle', text: message.message || 'Could not join room.', role: 'system' },
          ])
        }
      })

      socket.addEventListener('close', () => {
        if (roomSocketRef.current !== socket) return
        setRoomStatus('Reconnecting')
        notify('Connection lost. Reconnecting automatically.', 'error')
        reconnectAttemptsRef.current += 1
        const delay = Math.min(10_000, 750 * 2 ** (reconnectAttemptsRef.current - 1))
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectRoomRef.current(code, name, avatar, spectator)
        }, delay)
      })
    },
    [addRemoteStroke, closeRoomSocket, notify, playTone, playerName, setStrokes],
  )
  reconnectRoomRef.current = connectRoomSocket

  useEffect(() => closeRoomSocket, [closeRoomSocket])

  const openAiGame = useCallback(async (name: string, avatar: string, settings: AiSettings) => {
    try {
      const code = await createServerRoom()
      const roomSetup: RoomSettings = {
        rounds: 3,
        drawTime: ROUND_SECONDS,
        maxPlayers: Math.min(8, settings.count + 1),
        aiDifficulty: settings.difficulty,
        aiCanDraw: true,
        isPublic: false,
        language: 'en',
        wordDifficulty: 'medium',
        customWordMode: 'disabled',
        customWords: [],
      }
      pendingRoomSetupRef.current = { settings: roomSetup, aiCount: settings.count }
      setPlayerName(name)
      setPlayerAvatar(avatar)
      setAiSettings(settings)
      setGameMode('room')
      setRoomCode(code)
      setScreen('game')
      connectRoomSocket(code, name, avatar)
    } catch {
      notify('Server unavailable. Start the API and try again.', 'error')
    }
  }, [connectRoomSocket, notify])

  const openRoomGame = useCallback(async (name: string, avatar: string, settings: RoomSettings, aiCount: number) => {
    try {
      const code = await createServerRoom()
      pendingRoomSetupRef.current = { settings, aiCount }
      setPlayerName(name)
      setPlayerAvatar(avatar)
      setGameMode('room')
      setRoomCode(code)
      setScreen('game')
      setChatMessages((current) => [
        ...current,
        {
          name: 'Moodle',
          text: `Room ${code} created. Share this code with friends.`,
          role: 'system',
        },
      ])
      connectRoomSocket(code, name, avatar)
    } catch (error) {
      notify('Server unavailable. Start the API and try again.', 'error')
      setChatMessages((current) => [
        ...current,
        {
          name: 'Moodle',
          text: error instanceof Error ? error.message : 'Could not create room.',
          role: 'system',
        },
      ])
    }
  }, [connectRoomSocket, notify])

  const joinRoomGame = useCallback((code: string, name: string, avatar: string, spectator = false) => {
    setPlayerName(name)
    setPlayerAvatar(avatar)
    setGameMode('room')
    setRoomCode(code)
    setScreen('game')
    setChatMessages((current) => [
      ...current,
      {
        name: 'Moodle',
          text: spectator ? `Watching room ${code}.` : `Joined room ${code}. Waiting for friends to connect.`,
          role: 'system',
        },
      ])
    connectRoomSocket(code, name, avatar, spectator)
  }, [connectRoomSocket])

  const handleChatSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const message = chatDraft.trim()
      if (!message) return
      if (gameMode === 'room' && roomSocketRef.current?.readyState === WebSocket.OPEN) {
        roomSocketRef.current.send(JSON.stringify({ type: 'chat_guess', text: message }))
        setChatDraft('')
        return
      }
      const isCorrectGuess = !roundEnded && normalizeGuess(message) === normalizeGuess(currentWord)
      setChatMessages((current) => [
        ...current,
        { name: 'You', text: message, role: 'player', correct: isCorrectGuess },
        ...(isCorrectGuess && !hasCorrectGuess
          ? [
              {
                name: 'Moodle',
                text: `Correct! The word was ${currentWord}.`,
                role: 'system' as const,
                correct: true,
              },
            ]
          : []),
      ])
      if (isCorrectGuess) {
        setHasCorrectGuess(true)
        setRoundEnded(true)
      }
      setChatDraft('')
    },
    [chatDraft, currentWord, gameMode, hasCorrectGuess, roundEnded],
  )

  const handleWordChange = useCallback(
    (word: string) => {
      setCurrentWord(word)
      setHasCorrectGuess(false)
      setRoundEnded(false)
      setTimeLeft(ROUND_SECONDS)
      lastAiGuessStageRef.current = 0
      aiGuessPendingRef.current = false
      engine.clear()
      setChatMessages((current) => [
        ...current,
        {
          name: 'Moodle',
          text: `New word picked: ${word}.`,
          role: 'system',
        },
        {
          name: 'Pixel Pal',
          text: 'I am watching the new sketch.',
          role: 'ai',
        },
      ])
    },
    [engine],
  )

  const chooseRoomWord = useCallback((word: string) => {
    if (roomSocketRef.current?.readyState !== WebSocket.OPEN) return
    roomSocketRef.current.send(JSON.stringify({ type: 'choose_word', word }))
    setIsChoosingWord(false)
    setWordChoices([])
  }, [])

  const sendRoomMessage = useCallback((payload: Record<string, unknown>) => {
    if (roomSocketRef.current?.readyState !== WebSocket.OPEN) return
    roomSocketRef.current.send(JSON.stringify(payload))
  }, [])

  const updateRoomSettings = useCallback(
    (nextSettings: RoomSettings) => {
      setRoomSettings(nextSettings)
      sendRoomMessage({ type: 'update_settings', settings: nextSettings })
    },
    [sendRoomMessage],
  )

  const startRoomGame = useCallback(() => {
    sendRoomMessage({ type: 'start_game' })
  }, [sendRoomMessage])

  const returnRoomToLobby = useCallback(() => {
    sendRoomMessage({ type: 'return_lobby' })
  }, [sendRoomMessage])

  const returnToMainMenu = useCallback(() => {
    closeRoomSocket()
    setRoomCode(null)
    setScreen('home')
    setStrokes([])
    window.history.replaceState({}, '', window.location.pathname)
  }, [closeRoomSocket, setStrokes])

  const addRoomAiPlayer = useCallback(() => {
    sendRoomMessage({ type: 'add_ai' })
  }, [sendRoomMessage])

  const removeRoomAiPlayer = useCallback(
    (playerId: string) => {
      sendRoomMessage({ type: 'remove_ai', playerId })
    },
    [sendRoomMessage],
  )

  const kickRoomPlayer = useCallback(
    (playerId: string) => {
      sendRoomMessage({ type: 'kick_player', playerId })
    },
    [sendRoomMessage],
  )

  const reportRoomPlayer = useCallback(
    (playerId: string) => {
      sendRoomMessage({ type: 'report_player', playerId })
    },
    [sendRoomMessage],
  )

  const voteKickRoomPlayer = useCallback(
    (playerId: string) => {
      sendRoomMessage({ type: 'vote_kick', playerId })
    },
    [sendRoomMessage],
  )

  const copyShareLink = useCallback(
    (spectate = false) => {
      if (!roomCode) return
      const url = new URL(window.location.href)
      url.search = ''
      url.searchParams.set('room', roomCode)
      if (spectate) url.searchParams.set('spectate', '1')
      void navigator.clipboard?.writeText(url.toString())
      setChatMessages((current) => [
        ...current,
        { name: 'Moodle', text: spectate ? 'Spectator link copied.' : 'Room link copied.', role: 'system' },
      ])
    },
    [roomCode],
  )

  const copyRoomCode = useCallback(() => {
    if (!roomCode) return
    void navigator.clipboard?.writeText(roomCode)
    notify('Room code copied.', 'success')
  }, [notify, roomCode])

  const saveDrawing = useCallback(() => {
    const canvas = canvasElRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `moodle-${Date.now()}.png`
    link.click()
  }, [])

  const replayDrawing = useCallback(() => {
    const history = [...strokes]
    if (history.length === 0) return
    setStrokes([])
    history.forEach((stroke, index) => {
      window.setTimeout(() => addRemoteStroke(stroke), index * 450)
    })
  }, [addRemoteStroke, setStrokes, strokes])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return
      if (event.key.toLowerCase() === 'b') setMode('draw')
      if (event.key.toLowerCase() === 'e') setMode('erase')
      if (event.key.toLowerCase() === 'z') engine.undo()
      if (event.key.toLowerCase() === 'y') engine.redo()
      if (event.key.toLowerCase() === 's') saveDrawing()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [engine, saveDrawing])

  const tracking = useMediaPipeHandTracking(gestureEnabled && screen === 'game')
  const { status, preview } = useGestureInputController({
    frame: tracking.frame,
    canvas: canvasElRef.current,
    engine,
    gestureEnabled: gestureEnabled && screen === 'game' && (gameMode !== 'room' || (isDrawer && roomPhase === 'drawing')),
    setMode,
  })

  useEffect(() => {
    syncToolSettings({ color, brushSize, mode })
  }, [color, brushSize, mode, syncToolSettings])

  useEffect(() => {
    if (gameMode !== 'room' || !isDrawer || roomPhase !== 'drawing') return
    const socket = roomSocketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    for (const stroke of strokes) {
      if (sentStrokeIdsRef.current.has(stroke.id)) continue
      sentStrokeIdsRef.current.add(stroke.id)
      socket.send(JSON.stringify({ type: 'drawing_stroke', stroke }))
    }
  }, [gameMode, isDrawer, roomPhase, strokes])

  useEffect(() => {
    if (screen !== 'game' || hasCorrectGuess || roundEnded) return
    if (gameMode === 'room') return

    const timerId = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timerId)
          setRoundEnded(true)
          setChatMessages((messages) => [
            ...messages,
            {
              name: 'Moodle',
              text: `Time is up! The word was ${currentWord}.`,
              role: 'system',
            },
          ])
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [currentWord, gameMode, hasCorrectGuess, roundEnded, screen])

  useEffect(() => {
    if (screen !== 'game') return
    if (gameMode === 'room') return
    if (hasCorrectGuess || roundEnded) return
    if (aiGuessPendingRef.current) return
    const nextAiPlayer = aiPlayers.find((player) => !player.guessed)
    if (!nextAiPlayer) return

    const strokePointCount = strokes.reduce((total, stroke) => total + stroke.points.length, 0)
    const activePointCount = activeStroke?.points.length ?? 0
    const totalPoints = strokePointCount + activePointCount

    if (totalPoints === 0) {
      lastAiGuessStageRef.current = 0
      return
    }

    const difficulty = AI_DIFFICULTY_CONFIG[aiSettings.difficulty]
    const stage = Math.min(4, Math.floor(totalPoints / difficulty.pointStep) + Math.floor(strokes.length / 3))
    if (stage <= 0 || stage <= lastAiGuessStageRef.current) return

    const canvas = canvasElRef.current
    if (!canvas) return

    lastAiGuessStageRef.current = stage
    aiGuessPendingRef.current = true

    window.setTimeout(() => {
      const imageDataUrl = canvas.toDataURL('image/png')
      requestPixelPalGuess(imageDataUrl)
        .then((guess) => {
          const shouldGuessCorrectly = Math.random() <= difficulty.accuracy
          const fallbackGuess = shouldGuessCorrectly ? guess || currentWord : pickWrongAiGuess(currentWord)
          const isCorrectAiGuess = normalizeGuess(fallbackGuess) === normalizeGuess(currentWord)
          setAiPlayers((current) =>
            current.map((player) =>
              player.id === nextAiPlayer.id
                ? {
                    ...player,
                    guessed: isCorrectAiGuess,
                    score: isCorrectAiGuess ? player.score + Math.max(10, timeLeft * 10) : player.score,
                  }
                : player,
            ),
          )
          setChatMessages((current) => [
            ...current,
            {
              name: nextAiPlayer.name,
              text: fallbackGuess,
              role: 'ai',
              correct: isCorrectAiGuess,
            },
          ])
          if (isCorrectAiGuess) {
            setChatMessages((current) => [
              ...current,
              {
                name: 'Moodle',
                text: `${nextAiPlayer.name} guessed correctly.`,
                role: 'system',
                correct: true,
              },
            ])
          }
        })
        .catch((error) => {
          setChatMessages((current) => [
            ...current,
            {
              name: nextAiPlayer.name,
              text: error instanceof Error ? error.message : 'I could not reach the AI service.',
              role: 'ai',
            },
          ])
        })
        .finally(() => {
          aiGuessPendingRef.current = false
        })
    }, difficulty.delayMs + Math.floor(Math.random() * 900))
  }, [activeStroke, aiPlayers, aiSettings.difficulty, currentWord, gameMode, hasCorrectGuess, roundEnded, screen, strokes, timeLeft])

  const isRoomHost = gameMode === 'room' && roomPlayers.some((player) => player.id === roomPlayerId && player.isHost)
  const connectedRoomPlayers = roomPlayers.filter((player) => !player.isSpectator && !player.disconnected)
  const canStartRoom = connectedRoomPlayers.length >= 2 && (roomPhase === 'lobby' || roomPhase === 'ended')
  const roomHostName = roomPlayers.find((player) => player.isHost)?.name || 'Assigning host'
  const currentDrawerName = roomPlayers.find((player) => player.isDrawer)?.name || 'The drawer'
  const rankedRoomPlayers = [...roomPlayers]
    .filter((player) => !player.isSpectator)
    .sort((a, b) => b.score - a.score)
  const drawingControlsEnabled = gameMode !== 'room' || (isDrawer && roomPhase === 'drawing')

  return (
    <>
      <PixelBackdrop />
      <div className="notification-stack" aria-live="polite" aria-atomic="false">
        {notifications.map((notification) => (
          <div className={`game-notification game-notification--${notification.tone}`} key={notification.id}>
            {notification.message}
          </div>
        ))}
      </div>
      {screen === 'home' && (
        <HomeScreen
          onCreateRoom={openRoomGame}
          onJoinRoom={joinRoomGame}
          onPlayAi={openAiGame}
          activeRoomCode={roomCode}
        />
      )}
      {screen === 'game' && (
      <div className="app">
        <header className="app__header">
          <div>
            <p className="app__eyebrow">Drawing workspace</p>
            <h1 className="app__title">Moodle</h1>
            <div className="mode-chip">
              {gameMode === 'room' && roomCode
                ? `ROOM ${roomCode} · ${roomStatus}`
                : `AI · ${aiPlayers.length} · ${aiSettings.difficulty.toUpperCase()}${aiSettings.canDraw ? ' · DRAW ON' : ''}`}
            </div>
          </div>
          <div className="header-stats">
            <div className="round-box" aria-label="Round">
              <span className="r-lbl">ROUND</span>
              <span className="r-num">{gameMode === 'room' ? `${currentRound} / ${totalRounds}` : '1 / 3'}</span>
            </div>
            <div className={`timer-box${timeLeft <= 10 && !roundEnded ? ' timer-box--danger' : ''}`} aria-label="Timer">
              <span className="r-lbl">TIME</span>
              <span className="r-num">{timeLeft}s</span>
            </div>
          </div>
        </header>

        <section className="word-bar" aria-label="Prompt">
          <button
            type="button"
            className="instructions-btn"
            onClick={() => setInstructionsOpen(true)}
            aria-haspopup="dialog"
          >
            HELP?
          </button>
          <div className="word-bar__prompt" aria-label="Current word">
            {currentWord.split('').map((char, index) => (
              <span key={`${char}-${index}`} className={`wch${char === ' ' ? ' spc' : ''}`}>
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </div>
          {gameMode === 'ai' && (
            <label className="word-picker">
              <span>WORD</span>
              <select
                value={currentWord}
                onChange={(event) => handleWordChange(event.target.value)}
                aria-label="Pick drawing word"
              >
                {WORD_OPTIONS.map((word) => (
                  <option key={word} value={word}>
                    {word}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
        {gameMode === 'room' && roomPhase === 'choosing' && (
          <div className="word-choice-dialog-backdrop">
            <section
              className="word-choice-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="word-choice-title"
            >
              <div className="word-choice-dialog__timer" aria-label={`${choiceTimeLeft} seconds remaining`}>
                {choiceTimeLeft}
              </div>
              <div className="px-panel-title" id="word-choice-title">
                {isDrawer ? 'CHOOSE A WORD' : 'WORD SELECTION'}
              </div>
              {isDrawer && isChoosingWord ? (
                <>
                  <p>Pick one word to draw. Moodle chooses randomly when time runs out.</p>
                  <div className="word-choice-panel__options">
                    {wordChoices.slice(0, 3).map((word) => (
                      <button type="button" key={word} onClick={() => chooseRoomWord(word)}>
                        {word}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="word-choice-dialog__waiting" aria-live="polite">
                  <span className="word-choice-dialog__dots" aria-hidden>...</span>
                  <strong>{currentDrawerName} is picking a word</strong>
                  <p>The three choices are visible only to the drawer.</p>
                </div>
              )}
            </section>
          </div>
        )}
        {gameMode === 'room' && roomPhase === 'lobby' && (
          <div className="lobby-dialog-backdrop">
          <section
            className="lobby-panel lobby-panel--dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lobby-dialog-title"
          >
            <div>
              <div className="px-panel-title" id="lobby-dialog-title">WAITING FOR PLAYERS</div>
              <div className="lobby-code">
                <strong>ROOM {roomCode}</strong>
                <button type="button" className="px-btn" onClick={copyRoomCode}>COPY CODE</button>
              </div>
              <p>
                {isRoomHost
                  ? 'Configure the room, add AI players, then start.'
                  : 'Waiting for the host to start the game.'}
              </p>
              <p className="lobby-meta">
                Host: {roomHostName} · {connectedRoomPlayers.length}/{roomSettings.maxPlayers} connected · {roomSettings.rounds} rounds · {roomSettings.drawTime}s
              </p>
            </div>
            <div className="lobby-settings">
              <label>
                ROUNDS
                <select
                  value={roomSettings.rounds}
                  onChange={(event) =>
                    updateRoomSettings({ ...roomSettings, rounds: Number(event.target.value) })
                  }
                  disabled={!isRoomHost}
                >
                  {[1, 2, 3, 4, 5, 6].map((rounds) => (
                    <option key={rounds} value={rounds}>
                      {rounds}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                DRAW TIME
                <select
                  value={roomSettings.drawTime}
                  onChange={(event) =>
                    updateRoomSettings({ ...roomSettings, drawTime: Number(event.target.value) })
                  }
                  disabled={!isRoomHost}
                >
                  {[30, 45, 60, 90, 120].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds}s
                    </option>
                  ))}
                </select>
              </label>
              <label>
                MAX PLAYERS
                <select
                  value={roomSettings.maxPlayers}
                  onChange={(event) =>
                    updateRoomSettings({ ...roomSettings, maxPlayers: Number(event.target.value) })
                  }
                  disabled={!isRoomHost}
                >
                  {[2, 4, 6, 8].map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <label>
                AI LEVEL
                <select
                  value={roomSettings.aiDifficulty}
                  onChange={(event) =>
                    updateRoomSettings({ ...roomSettings, aiDifficulty: event.target.value as AiDifficulty })
                  }
                  disabled={!isRoomHost}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="lobby-settings__toggle">
                <input
                  type="checkbox"
                  checked={roomSettings.aiCanDraw}
                  onChange={(event) =>
                    updateRoomSettings({ ...roomSettings, aiCanDraw: event.target.checked })
                  }
                  disabled={!isRoomHost}
                />
                AI DRAW
              </label>
              <label className="lobby-settings__toggle">
                <input
                  type="checkbox"
                  checked={roomSettings.isPublic}
                  onChange={(event) =>
                    updateRoomSettings({ ...roomSettings, isPublic: event.target.checked })
                  }
                  disabled={!isRoomHost}
                />
                PUBLIC
              </label>
              <label>
                LANGUAGE
                <select
                  value={roomSettings.language}
                  onChange={(event) =>
                    updateRoomSettings({ ...roomSettings, language: event.target.value as 'en' | 'es' })
                  }
                  disabled={!isRoomHost}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </label>
              <label>
                WORD LEVEL
                <select
                  value={roomSettings.wordDifficulty}
                  onChange={(event) =>
                    updateRoomSettings({
                      ...roomSettings,
                      wordDifficulty: event.target.value as 'easy' | 'medium' | 'hard',
                    })
                  }
                  disabled={!isRoomHost}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                CUSTOM
                <select
                  value={roomSettings.customWordMode}
                  onChange={(event) =>
                    updateRoomSettings({
                      ...roomSettings,
                      customWordMode: event.target.value as 'disabled' | 'mixed' | 'only',
                    })
                  }
                  disabled={!isRoomHost}
                >
                  <option value="disabled">Off</option>
                  <option value="mixed">Mixed</option>
                  <option value="only">Only</option>
                </select>
              </label>
              <label className="lobby-settings__wide">
                CUSTOM WORDS
                <input
                  value={roomSettings.customWords.join(', ')}
                  onChange={(event) =>
                    updateRoomSettings({
                      ...roomSettings,
                      customWords: event.target.value
                        .split(',')
                        .map((word) => word.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                  placeholder="APPLE, CLOUD, CAR"
                  disabled={!isRoomHost}
                />
              </label>
            </div>
            {isRoomHost && (
              <div className="lobby-actions">
                <button type="button" className="px-btn" onClick={() => copyShareLink(false)}>
                  LINK
                </button>
                <button type="button" className="px-btn" onClick={() => copyShareLink(true)}>
                  WATCH LINK
                </button>
                <button type="button" className="px-btn" onClick={addRoomAiPlayer} disabled={connectedRoomPlayers.length >= roomSettings.maxPlayers}>
                  ADD AI
                </button>
                <button type="button" className="px-btn px-btn--primary" onClick={startRoomGame} disabled={!canStartRoom}>
                  START GAME
                </button>
              </div>
            )}
          </section>
          </div>
        )}
        {gameMode === 'room' && (roomPhase === 'reveal' || roomPhase === 'ended') && (
          <section className={`transition-panel${roomPhase === 'ended' ? ' transition-panel--final' : ''}`} aria-label="Round summary">
            <div>
              <div className="px-panel-title">{roomPhase === 'ended' ? 'FINAL RANKING' : 'ROUND OVER'}</div>
              <p>
                {roomPhase === 'ended'
                  ? `${rankedRoomPlayers[0]?.name || 'No player'} wins!`
                  : `The word was ${currentWord}. Next: ${roundSummary.nextDrawerName || 'starting soon'}.`}
              </p>
            </div>
            <ol>
              {rankedRoomPlayers
                .slice(0, 5)
                .map((player, index) => (
                  <li className={index === 0 && roomPhase === 'ended' ? 'winner' : ''} key={player.id}>
                    <span>{player.name}{player.isAi ? ' AI' : ''}</span>
                    <strong>
                      {player.score} pts
                      {roomPhase === 'reveal' && roundSummary.pointsEarned[player.id]
                        ? ` (+${roundSummary.pointsEarned[player.id]})`
                        : ''}
                    </strong>
                  </li>
                ))}
            </ol>
            {roomPhase === 'ended' && (
              <div className="end-game-actions">
                {isRoomHost && <button type="button" className="px-btn px-btn--primary" onClick={startRoomGame}>PLAY AGAIN</button>}
                {isRoomHost && <button type="button" className="px-btn" onClick={returnRoomToLobby}>RETURN TO LOBBY</button>}
                <button type="button" className="px-btn" onClick={returnToMainMenu}>MAIN MENU</button>
              </div>
            )}
          </section>
        )}

        <main className="game-grid">
          <aside className="game-side px-panel" aria-label="Players">
            <div className="px-panel-title">PLAYERS</div>
            <div className="side-list">
              {gameMode === 'room'
                ? (roomPhase === 'lobby' ? roomPlayers : rankedRoomPlayers).map((player, index) => (
                    <div
                      className={`gp-card${player.isDrawer ? ' drawing' : ''}${player.guessed ? ' guessed' : ''}`}
                      key={player.id}
                    >
                      <span className="gp-rank" aria-label={`Rank ${index + 1}`}>#{index + 1}</span>
                      <span className="gp-av">{player.isDrawer ? '✎' : player.guessed ? '✓' : avatarIcon(player.avatar)}</span>
                      <span className="gp-info">
                        <span className="gp-nm">
                          {player.name}{player.isAi ? ' AI' : ''}{player.isSpectator ? ' WATCH' : ''}{player.isHost ? ' HOST' : ''}
                        </span>
                        <span className="gp-sc">
                          {player.disconnected ? 'Disconnected' : player.isSpectator ? 'Spectating' : player.isDrawer ? 'Drawing' : `${player.score} pts`}
                        </span>
                      </span>
                      {player.isDrawer && <span className="draw-ind">✎</span>}
                      {player.id !== roomPlayerId && (
                        <span className="gp-actions">
                          {isRoomHost && (roomPhase === 'lobby' || roomPhase === 'ended') && (
                            <button
                              type="button"
                              className="gp-remove"
                              onClick={() => (player.isAi ? removeRoomAiPlayer(player.id) : kickRoomPlayer(player.id))}
                              aria-label={`Remove ${player.name}`}
                            >
                              ×
                            </button>
                          )}
                          {!player.isAi && (
                            <>
                              <button
                                type="button"
                                className="gp-report"
                                onClick={() => voteKickRoomPlayer(player.id)}
                                aria-label={`Vote kick ${player.name}`}
                              >
                                V
                              </button>
                              <button
                                type="button"
                                className="gp-report"
                                onClick={() => reportRoomPlayer(player.id)}
                                aria-label={`Report ${player.name}`}
                              >
                                !
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  ))
                : (
                  <>
                    <div className="gp-card drawing">
                      <span className="gp-av">{avatarIcon(playerAvatar)}</span>
                      <span className="gp-info">
                        <span className="gp-nm">{playerName}</span>
                        <span className="gp-sc">Drawing</span>
                      </span>
                      <span className="draw-ind">✎</span>
                    </div>
                    {aiPlayers.map((player) => (
                      <div className={`gp-card${player.guessed ? ' guessed' : ''}`} key={player.id}>
                        <span className="gp-av">{player.guessed ? '✓' : avatarIcon(player.avatar)}</span>
                        <span className="gp-info">
                          <span className="gp-nm">{player.name} AI</span>
                          <span className="gp-sc">{player.guessed ? `${player.score} pts` : 'Guessing'}</span>
                        </span>
                      </div>
                    ))}
                  </>
                )}
            </div>
          </aside>

          <section className="game-board">
            <Toolbar
              mode={mode}
              onModeChange={setMode}
              color={color}
              onColorChange={setColor}
              brushSize={brushSize}
              onBrushSizeChange={setBrushSize}
              onClear={handleClear}
              onUndo={engine.undo}
              onRedo={engine.redo}
              canUndo={canUndo}
              canRedo={canRedo}
              disabled={!drawingControlsEnabled}
            />
            <div className="utility-bar" aria-label="Game utilities">
              <button type="button" onClick={saveDrawing}>
                SAVE
              </button>
              <button type="button" onClick={replayDrawing} disabled={strokes.length === 0}>
                REPLAY
              </button>
              <label>
                THEME
                <select value={theme} onChange={(event) => setTheme(event.target.value)}>
                  <option value="classic">Classic</option>
                  <option value="night">Night</option>
                  <option value="forest">Forest</option>
                </select>
              </label>
              <label className="utility-bar__toggle">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(event) => setSoundEnabled(event.target.checked)}
                />
                SOUND
              </label>
              <span>WINS {localWins}</span>
            </div>

            <div className="canvas-shell">
              <DrawingCanvas
                strokes={strokes}
                activeStroke={activeStroke}
                engine={engine}
                toolMode={mode}
                pointerEnabled={gameMode === 'room' ? isDrawer && roomPhase === 'drawing' : !gestureEnabled || !status.handDetected}
                cursorOverride={gameMode === 'room' && !isDrawer ? null : gestureEnabled ? preview : null}
                onCanvasReady={handleCanvasReady}
              />
              <span className="cc tl" aria-hidden />
              <span className="cc tr" aria-hidden />
              <span className="cc bl" aria-hidden />
              <span className="cc br" aria-hidden />
            </div>
          </section>

          <aside className="game-side px-panel chat-panel" aria-label="Chat">
            <div className="px-panel-title">CHAT</div>
            <div className="hand-control">
              <label className="hand-control__toggle">
                <input
                  type="checkbox"
                  checked={gestureEnabled}
                  onChange={(event) => setGestureEnabled(event.target.checked)}
                />
                <span>{gestureEnabled ? 'HAND ON' : 'HAND OFF'}</span>
              </label>
              <span className="hand-control__status">
                {tracking.error
                  ? 'CAMERA ERROR'
                  : status.handDetected
                    ? 'HAND READY'
                    : tracking.mediaPipeReady
                      ? 'SHOW HAND'
                      : 'LOADING'}
              </span>
            </div>
            <video
              ref={tracking.videoRef}
              className="webcam-hidden"
              playsInline
              muted
              autoPlay
              aria-hidden
            />
            <div className="chat-list" aria-live="polite" ref={chatListRef}>
              {chatMessages.map((message, index) => (
                <div
                  className={`chat-bubble${message.name === 'You' ? ' chat-bubble--me' : ''}${
                    message.role === 'ai' ? ' chat-bubble--ai' : ''
                  }${message.role === 'system' ? ' chat-bubble--system' : ''}${
                    message.correct ? ' chat-bubble--correct' : ''
                  }`}
                  key={`${message.name}-${index}`}
                >
                  <span className="chat-bubble__name">{message.name}</span>
                  <span className="chat-bubble__text">{message.text}</span>
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={handleChatSubmit}>
              <input
                className="chat-input"
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder={
                  gameMode === 'room' && isDrawer
                    ? 'Drawer cannot guess'
                    : hasCorrectGuess
                      ? 'Correct! Waiting for others'
                      : 'Type guess'
                }
                aria-label="Chat message"
                disabled={gameMode === 'room' && (isDrawer || hasCorrectGuess || roomPhase !== 'drawing')}
              />
              <button className="chat-send" type="submit" disabled={gameMode === 'room' && (isDrawer || hasCorrectGuess || roomPhase !== 'drawing')}>
                SEND
              </button>
            </form>
          </aside>
        </main>
      </div>
      )}
      {instructionsOpen && (
        <div className="modal-bg" role="presentation" onClick={() => setInstructionsOpen(false)}>
          <section
            className="instructions-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructions-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-panel-title" id="instructions-title">
              INSTRUCTIONS
            </div>
            <div className="instructions-modal__body">
              <p>Draw the prompt on the canvas before the round ends.</p>
              <ul>
                <li>Use the pencil to draw and the eraser to remove marks.</li>
                <li>Pick a color and brush size from the toolbar.</li>
                <li>Undo, redo, or clear when you need to reset.</li>
                <li>Gesture mode lets MediaPipe control drawing when a hand is detected.</li>
              </ul>
              <button
                type="button"
                className="px-btn"
                onClick={() => setInstructionsOpen(false)}
                autoFocus
              >
                CLOSE
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default App
