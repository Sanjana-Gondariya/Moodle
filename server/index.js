import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const WORDS = [
  'MOODLE', 'ROCKET', 'PIZZA', 'CASTLE', 'ROBOT', 'FLOWER',
  'BICYCLE', 'CAMERA', 'DRAGON', 'GUITAR', 'PENGUIN', 'RAINBOW',
  'SAILBOAT', 'SNOWMAN', 'VOLCANO', 'WIZARD',
]
const WORD_BANK = {
  en: {
    easy: [
      'SUN', 'CAT', 'TREE', 'BOOK', 'STAR', 'FISH', 'APPLE', 'BALL',
      'CLOUD', 'HOUSE', 'MOON', 'CAR', 'HAT', 'CAKE', 'DUCK', 'SHOE',
    ],
    medium: WORDS,
    hard: [
      'ASTRONAUT', 'LIGHTHOUSE', 'DINOSAUR', 'MICROSCOPE', 'SUBMARINE',
      'TELESCOPE', 'HELICOPTER', 'LABYRINTH', 'ORCHESTRA', 'PARACHUTE',
      'SCORPION', 'SKYSCRAPER', 'SPACESHIP', 'WATERFALL', 'WINDMILL',
    ],
  },
  es: {
    easy: [
      'SOL', 'GATO', 'ARBOL', 'LIBRO', 'PEZ', 'FLOR', 'CASA', 'LUNA',
      'PAN', 'PERRO', 'MANO', 'TAZA', 'NUBE', 'SILLA', 'RELOJ', 'ZAPATO',
    ],
    medium: [
      'COHETE', 'PIZZA', 'CASTILLO', 'ROBOT', 'BICICLETA', 'CAMARA',
      'DRAGON', 'GUITARRA', 'PINGUINO', 'ARCOIRIS', 'VELERO', 'MUNIECO',
      'VOLCAN', 'MAGO', 'TORTUGA', 'CORONA',
    ],
    hard: [
      'ASTRONAUTA', 'DINOSAURIO', 'TELESCOPIO', 'SUBMARINO', 'MARIPOSA',
      'HELICOPTERO', 'LABERINTO', 'ORQUESTA', 'PARACAIDAS', 'ESCORPION',
      'RASCACIELOS', 'NAVE ESPACIAL', 'CASCADA', 'MOLINO', 'MICROSCOPIO',
    ],
  },
}
const ROUND_SECONDS = 60
const WORD_CHOICE_SECONDS = 5
const REVEAL_SECONDS = 4
const MAX_PLAYERS = 8
const MAX_WS_PAYLOAD_BYTES = 256_000
const MAX_STROKES = 2_000
const MAX_POINTS_PER_STROKE = 4_000
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const DEFAULT_ROOM_SETTINGS = {
  rounds: 3,
  drawTime: ROUND_SECONDS,
  maxPlayers: MAX_PLAYERS,
  aiDifficulty: 'medium',
  aiCanDraw: false,
  isPublic: false,
  language: 'en',
  wordDifficulty: 'medium',
  customWordMode: 'disabled',
  customWords: [],
}
const AI_PLAYERS = [
  { name: 'Pixel Pal', avatar: 'robot' },
  { name: 'Sketch Bot', avatar: 'star' },
  { name: 'Doodle AI', avatar: 'fish' },
  { name: 'Line Buddy', avatar: 'cat' },
]
const AI_DIFFICULTY = {
  easy: { firstGuessMs: 12000, correctChance: 0.35, pointThreshold: 80 },
  medium: { firstGuessMs: 8000, correctChance: 0.58, pointThreshold: 45 },
  hard: { firstGuessMs: 4800, correctChance: 0.78, pointThreshold: 22 },
}
const WRONG_AI_GUESSES = ['HOUSE', 'TREE', 'CLOUD', 'BOOK', 'CHAIR', 'STAR', 'MOON']
const BLOCKED_WORDS = ['BADWORD', 'IDIOT', 'STUPID', 'MORON', 'LOSER']
const DATA_DIR = resolve(process.cwd(), 'server-data')
const DIST_DIR = resolve(process.cwd(), 'dist')
const HISTORY_PATH = resolve(DATA_DIR, 'history.json')
const ROOMS_PATH = resolve(DATA_DIR, 'rooms.json')
const rooms = new Map()
const gameHistory = []
const reports = []
let persistRoomsTimerId = null

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return
  try {
    const payload = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'))
    if (Array.isArray(payload.games)) gameHistory.push(...payload.games.slice(-50))
    if (Array.isArray(payload.reports)) reports.push(...payload.reports.slice(-50))
  } catch {
    // Keep the server running if local history is malformed.
  }
}

function persistHistory() {
  writeJsonAtomic(HISTORY_PATH, {
    games: gameHistory.slice(-50),
    reports: reports.slice(-50),
  })
}

function writeJsonAtomic(path, payload) {
  mkdirSync(DATA_DIR, { recursive: true })
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, JSON.stringify(payload, null, 2))
  renameSync(temporaryPath, path)
}

function sendJson(response, statusCode, payload) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(payload))
}

function serveFrontend(request, response) {
  if (!existsSync(DIST_DIR)) return false
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const assetPath = resolve(DIST_DIR, `.${requestedPath}`)
  const safeAssetPath = assetPath.startsWith(DIST_DIR) && existsSync(assetPath)
    ? assetPath
    : resolve(DIST_DIR, 'index.html')
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(safeAssetPath)] || 'application/octet-stream',
    'Cache-Control': safeAssetPath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  response.end(readFileSync(safeAssetPath))
  return true
}

function createRoomCode() {
  let code = ''
  do {
    code = Array.from(
      { length: 5 },
      () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)],
    ).join('')
  } while (rooms.has(code))
  return code
}

function wordPoolFor(room) {
  const language = WORD_BANK[room.settings.language] ? room.settings.language : 'en'
  const difficulty = WORD_BANK[language][room.settings.wordDifficulty] ? room.settings.wordDifficulty : 'medium'
  const baseWords = WORD_BANK[language][difficulty]
  const customWords = room.settings.customWords
    .map((word) => String(word || '').trim().toUpperCase())
    .filter((word) => word.length >= 3 && word.length <= 18)

  if (room.settings.customWordMode === 'only' && customWords.length > 0) return customWords
  if (room.settings.customWordMode === 'mixed') return [...baseWords, ...customWords]
  return baseWords
}

function getWords(language = 'en', difficulty = 'medium', count = 3) {
  if (!WORD_BANK[language]) {
    return { error: `Unsupported language "${language}". Use en or es.` }
  }
  if (difficulty !== 'all' && !WORD_BANK[language][difficulty]) {
    return { error: `Unsupported difficulty "${difficulty}". Use easy, medium, hard, or all.` }
  }

  const source = difficulty === 'all'
    ? Object.values(WORD_BANK[language]).flat()
    : WORD_BANK[language][difficulty]
  const uniqueWords = [...new Set(source)]
  for (let index = uniqueWords.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[uniqueWords[index], uniqueWords[randomIndex]] = [uniqueWords[randomIndex], uniqueWords[index]]
  }

  const requestedCount = clampNumber(count, 1, 20, 3)
  return {
    language,
    difficulty,
    count: Math.min(requestedCount, uniqueWords.length),
    words: uniqueWords.slice(0, requestedCount),
  }
}

function pickWord(room) {
  const words = wordPoolFor(room)
  return words[Math.floor(Math.random() * words.length)]
}

function pickWordOptions(room) {
  return [...wordPoolFor(room)].sort(() => Math.random() - 0.5).slice(0, 3)
}

function pickWrongAiGuess(secretWord) {
  const options = WRONG_AI_GUESSES.filter((guess) => normalizeGuess(guess) !== normalizeGuess(secretWord))
  return options[Math.floor(Math.random() * options.length)] || 'SKETCH'
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function createRoom() {
  const code = createRoomCode()
  const room = {
    code,
    players: new Map(),
    sockets: new Set(),
    hostId: null,
    phase: 'lobby',
    settings: { ...DEFAULT_ROOM_SETTINGS },
    turnOrder: [],
    turnIndex: -1,
    strokes: [],
    drawerId: null,
    secretWord: '',
    wordLength: 0,
    wordOptions: [],
    choosingWord: false,
    choiceTimeLeft: 0,
    choiceTimerId: null,
    round: 1,
    timeLeft: ROUND_SECONDS,
    guessedPlayerIds: new Set(),
    turnPoints: new Map(),
    timerId: null,
    revealTimerId: null,
    cleanupTimerId: null,
    aiTimerIds: new Set(),
    voteKicks: new Map(),
  }
  rooms.set(code, room)
  schedulePersistRooms()
  return room
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase === 'ended' ? 'ended' : 'lobby',
    settings: room.settings,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      score: player.score,
      isAi: Boolean(player.isAi),
      isSpectator: Boolean(player.isSpectator),
      sessionId: player.sessionId || null,
      disconnected: !player.isAi,
    })),
    updatedAt: new Date().toISOString(),
  }
}

function persistRooms() {
  persistRoomsTimerId = null
  writeJsonAtomic(ROOMS_PATH, {
    rooms: [...rooms.values()].map(roomSnapshot),
  })
}

function schedulePersistRooms() {
  if (persistRoomsTimerId) return
  persistRoomsTimerId = setTimeout(persistRooms, 150)
}

function loadRooms() {
  if (!existsSync(ROOMS_PATH)) return
  try {
    const payload = JSON.parse(readFileSync(ROOMS_PATH, 'utf8'))
    for (const snapshot of Array.isArray(payload.rooms) ? payload.rooms : []) {
      const code = String(snapshot.code || '').toUpperCase()
      if (!/^[A-Z2-9]{5}$/.test(code)) continue
      const room = createRoom()
      rooms.delete(room.code)
      room.code = code
      room.phase = snapshot.phase === 'ended' ? 'ended' : 'lobby'
      room.settings = { ...DEFAULT_ROOM_SETTINGS, ...(snapshot.settings || {}) }
      room.hostId = snapshot.hostId || null
      for (const savedPlayer of Array.isArray(snapshot.players) ? snapshot.players : []) {
        const name = sanitizePlayerName(savedPlayer.name)
        if (name.length < 3) continue
        const player = {
          id: String(savedPlayer.id || randomBytes(8).toString('hex')),
          name,
          avatar: sanitizeAvatar(savedPlayer.avatar),
          score: clampNumber(savedPlayer.score, 0, 1_000_000, 0),
          isAi: Boolean(savedPlayer.isAi),
          isSpectator: Boolean(savedPlayer.isSpectator),
          sessionId: savedPlayer.sessionId || null,
          disconnected: !savedPlayer.isAi,
          rateLimits: {},
        }
        room.players.set(player.id, player)
      }
      if (!room.players.has(room.hostId)) {
        room.hostId = [...room.players.values()].find((player) => !player.isAi && !player.isSpectator)?.id || null
      }
      rooms.set(code, room)
    }
  } catch {
    // Ignore malformed snapshots and start with an empty room list.
  }
}

function publicRoomList() {
  return [...rooms.values()]
    .filter((room) => room.settings.isPublic && (room.phase === 'lobby' || room.phase === 'ended'))
    .map((room) => ({
      code: room.code,
      playerCount: [...room.players.values()].filter((player) => !player.isSpectator && !player.disconnected).length,
      maxPlayers: room.settings.maxPlayers,
      phase: room.phase,
      rounds: room.settings.rounds,
      drawTime: room.settings.drawTime,
      aiDifficulty: room.settings.aiDifficulty,
      aiCanDraw: room.settings.aiCanDraw,
      language: room.settings.language,
      wordDifficulty: room.settings.wordDifficulty,
    }))
}

function sanitizePlayerName(value) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 20)
}

function sanitizeAvatar(value) {
  const avatar = String(value || 'cat').toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return avatar || 'cat'
}

function validateJoin(room, name) {
  const cleanName = sanitizePlayerName(name)
  if (cleanName.length < 3 || cleanName.length > 20) {
    return { ok: false, message: 'Username must be 3-20 characters.' }
  }
  const activePlayerCount = [...room.players.values()].filter((player) => !player.isSpectator).length
  if (activePlayerCount >= room.settings.maxPlayers) {
    return { ok: false, message: 'Room is full.' }
  }
  const duplicate = [...room.players.values()].some(
    (player) => player.name.toLowerCase() === cleanName.toLowerCase(),
  )
  if (duplicate) {
    return { ok: false, message: 'Username is already taken in this room.' }
  }
  return { ok: true, name: cleanName }
}

function publicPlayers(room) {
  return [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    score: player.score,
    isAi: Boolean(player.isAi),
    isSpectator: Boolean(player.isSpectator),
    disconnected: Boolean(player.disconnected),
    guessed: room.guessedPlayerIds.has(player.id),
    isDrawer: player.id === room.drawerId,
    isHost: player.id === room.hostId,
  }))
}

function roomStateFor(room, playerId) {
  const player = room.players.get(playerId)
  return {
    type: 'room_state',
    roomCode: room.code,
    phase: room.phase,
    settings: room.settings,
    playerId,
    drawerId: room.drawerId,
    hostId: room.hostId,
    isDrawer: playerId === room.drawerId,
    isSpectator: Boolean(player?.isSpectator),
    word: playerId === room.drawerId ? room.secretWord : null,
    wordHint: playerId === room.drawerId ? room.secretWord : wordHintFor(room),
    wordLength: room.wordLength,
    choosingWord: room.choosingWord,
    wordOptions: playerId === room.drawerId ? room.wordOptions : [],
    choiceTimeLeft: room.choiceTimeLeft,
    round: room.round,
    totalRounds: room.settings.rounds,
    timeLeft: room.timeLeft,
    players: publicPlayers(room),
    strokes: room.strokes,
  }
}

function sendSocket(socket, payload) {
  if (!socket.writable || socket.destroyed) return
  socket.write(encodeWebSocketFrame(JSON.stringify(payload)))
}

function broadcast(room, payload, exceptSocket = null) {
  for (const socket of room.sockets) {
    if (socket !== exceptSocket) {
      sendSocket(socket, payload)
    }
  }
}

function broadcastRoomState(room) {
  for (const socket of room.sockets) {
    if (socket.playerId) {
      sendSocket(socket, roomStateFor(room, socket.playerId))
    }
  }
  schedulePersistRooms()
}

function normalizeGuess(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function wordHintFor(room) {
  if (!room.secretWord) return ''
  const characters = [...room.secretWord]
  const revealCount = room.timeLeft <= Math.ceil(room.settings.drawTime / 4)
    ? Math.min(2, Math.floor(characters.length / 3))
    : room.timeLeft <= Math.ceil(room.settings.drawTime / 2)
      ? 1
      : 0
  const letterIndexes = characters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => /[A-Z0-9]/i.test(character))
    .sort((a, b) => {
      const seed = room.secretWord.charCodeAt(a.index % room.secretWord.length)
      const otherSeed = room.secretWord.charCodeAt(b.index % room.secretWord.length)
      return (seed * (a.index + 3)) - (otherSeed * (b.index + 3))
    })
    .slice(0, revealCount)
    .map(({ index }) => index)
  return characters
    .map((character, index) => character === ' ' ? ' ' : letterIndexes.includes(index) ? character : '_')
    .join('')
}

function sanitizeText(value, maxLength = 120) {
  const clean = [...String(value || '')]
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
  return BLOCKED_WORDS.reduce(
    (message, blockedWord) => message.replace(new RegExp(`\\b${blockedWord}\\b`, 'gi'), '***'),
    clean,
  )
}

function sanitizeStroke(value) {
  if (!value || typeof value !== 'object') return null
  if (!Array.isArray(value.points) || value.points.length < 1 || value.points.length > MAX_POINTS_PER_STROKE) {
    return null
  }
  const mode = value.mode === 'erase' ? 'erase' : value.mode === 'draw' ? 'draw' : null
  if (!mode) return null
  const color = /^#[0-9a-f]{6}$/i.test(String(value.color || '')) ? String(value.color) : '#111827'
  const size = Number(value.size)
  if (!Number.isFinite(size) || size < 1 || size > 64) return null
  const points = value.points.map((point) => ({
    x: Number(point?.x),
    y: Number(point?.y),
    t: Number.isFinite(Number(point?.t)) ? Number(point.t) : undefined,
  }))
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  if (points.some((point) => point.x < -20 || point.x > 4096 || point.y < -20 || point.y > 4096)) return null
  return {
    id: sanitizeText(value.id, 80) || randomBytes(8).toString('hex'),
    color,
    size,
    mode,
    points,
  }
}

function isRateLimited(player, key, limit, windowMs) {
  const now = Date.now()
  player.rateLimits ||= {}
  const bucket = player.rateLimits[key] || { count: 0, startedAt: now }
  if (now - bucket.startedAt > windowMs) {
    bucket.count = 0
    bucket.startedAt = now
  }
  bucket.count += 1
  player.rateLimits[key] = bucket
  return bucket.count > limit
}

function stopRoomTimer(room) {
  if (!room.timerId) return
  clearInterval(room.timerId)
  room.timerId = null
}

function stopWordChoiceTimer(room) {
  if (!room.choiceTimerId) return
  clearInterval(room.choiceTimerId)
  room.choiceTimerId = null
}

function stopRevealTimer(room) {
  if (!room.revealTimerId) return
  clearTimeout(room.revealTimerId)
  room.revealTimerId = null
}

function stopAiTimers(room) {
  for (const timerId of room.aiTimerIds) {
    clearTimeout(timerId)
    clearInterval(timerId)
  }
  room.aiTimerIds.clear()
}

function clearRoomTimers(room) {
  stopRoomTimer(room)
  stopWordChoiceTimer(room)
  stopRevealTimer(room)
  stopAiTimers(room)
}

function startRoomTimer(room) {
  if (room.timerId) return
  room.timerId = setInterval(() => {
    room.timeLeft = Math.max(0, room.timeLeft - 1)
    broadcast(room, {
      type: 'timer',
      timeLeft: room.timeLeft,
      wordHint: wordHintFor(room),
    })

    if (room.timeLeft <= 0) {
      endRound(room, 'Time is up.')
    }
  }, 1000)
}

function startWordChoice(room) {
  stopRoomTimer(room)
  stopWordChoiceTimer(room)
  stopAiTimers(room)
  room.wordOptions = pickWordOptions(room)
  room.secretWord = ''
  room.wordLength = 0
  room.choosingWord = true
  room.choiceTimeLeft = WORD_CHOICE_SECONDS
  room.timeLeft = room.settings.drawTime
  room.strokes = []
  room.guessedPlayerIds.clear()
  room.turnPoints.clear()
  room.phase = 'choosing'

  broadcastRoomState(room)

  const drawer = room.players.get(room.drawerId)
  if (drawer?.isAi) {
    const timerId = setTimeout(() => {
      room.aiTimerIds.delete(timerId)
      chooseRoomWord(room, room.wordOptions[Math.floor(Math.random() * room.wordOptions.length)], true)
    }, 900)
    room.aiTimerIds.add(timerId)
    return
  }

  room.choiceTimerId = setInterval(() => {
    room.choiceTimeLeft = Math.max(0, room.choiceTimeLeft - 1)
    broadcast(room, {
      type: 'word_choice_tick',
      choiceTimeLeft: room.choiceTimeLeft,
    })

    if (room.choiceTimeLeft <= 0) {
      chooseRoomWord(room, room.wordOptions[Math.floor(Math.random() * room.wordOptions.length)], true)
    }
  }, 1000)
}

function chooseRoomWord(room, word, automatic = false) {
  if (!room.choosingWord) return
  const selectedWord = room.wordOptions.includes(word) ? word : room.wordOptions[0] || pickWord(room)
  stopWordChoiceTimer(room)
  room.secretWord = selectedWord
  room.wordLength = selectedWord.length
  room.wordOptions = []
  room.choosingWord = false
  room.choiceTimeLeft = 0
  room.timeLeft = room.settings.drawTime
  room.phase = 'drawing'
  broadcastRoomState(room)
  broadcast(room, {
    type: 'word_chosen',
    wordLength: room.wordLength,
    automatic,
  })
  startRoomTimer(room)
  scheduleAiActions(room)
}

function endRound(room, reason) {
  if (room.phase === 'reveal' || room.phase === 'ended' || room.phase === 'lobby') return
  stopRoomTimer(room)
  stopWordChoiceTimer(room)
  stopAiTimers(room)
  room.phase = 'reveal'
  const drawer = room.players.get(room.drawerId)
  if (drawer) {
    const drawerPoints = room.guessedPlayerIds.size * 20
    drawer.score += drawerPoints
    room.turnPoints.set(drawer.id, (room.turnPoints.get(drawer.id) || 0) + drawerPoints)
  }
  const nextDrawerId = room.turnOrder[(room.turnIndex + 1) % Math.max(1, room.turnOrder.length)]
  broadcast(room, {
    type: 'round_reveal',
    word: room.secretWord,
    reason,
    players: publicPlayers(room),
    pointsEarned: Object.fromEntries(room.turnPoints),
    nextDrawerName: room.players.get(nextDrawerId)?.name || '',
  })
  broadcastRoomState(room)
  room.revealTimerId = setTimeout(() => {
    room.revealTimerId = null
    advanceTurn(room)
  }, REVEAL_SECONDS * 1000)
}

function allGuessersDone(room) {
  const guessers = [...room.players.values()]
    .filter((player) => player.id !== room.drawerId && !player.isSpectator && !player.disconnected)
    .map((player) => player.id)
  return guessers.length > 0 && guessers.every((id) => room.guessedPlayerIds.has(id))
}

function buildTurnOrder(room) {
  return [...room.players.values()]
    .filter((player) => !player.isSpectator && (!player.isAi || room.settings.aiCanDraw))
    .filter((player) => !player.disconnected)
    .map((player) => player.id)
}

function startGame(room) {
  if (room.phase !== 'lobby' && room.phase !== 'ended') return
  const activePlayers = [...room.players.values()].filter((player) => !player.isSpectator && !player.disconnected)
  if (activePlayers.length < 2) {
    broadcast(room, { type: 'error', message: 'Need at least 2 players to start.' })
    return
  }

  room.turnOrder = buildTurnOrder(room)
  if (room.turnOrder.length === 0) {
    broadcast(room, { type: 'error', message: 'At least one player must be able to draw.' })
    return
  }

  room.round = 1
  room.turnIndex = -1
  room.phase = 'choosing'
  room.strokes = []
  room.secretWord = ''
  room.players.forEach((player) => {
    player.score = 0
  })
  advanceTurn(room)
}

function advanceTurn(room) {
  clearRoomTimers(room)
  room.turnOrder = room.turnOrder.filter((playerId) => room.players.has(playerId))

  if (room.turnOrder.length === 0 || room.players.size === 0) {
    endGame(room)
    return
  }

  room.turnIndex += 1
  if (room.turnIndex >= room.turnOrder.length) {
    room.turnIndex = 0
    room.round += 1
  }

  if (room.round > room.settings.rounds) {
    endGame(room)
    return
  }

  room.drawerId = room.turnOrder[room.turnIndex] || null
  if (!room.drawerId || !room.players.has(room.drawerId)) {
    advanceTurn(room)
    return
  }

  startWordChoice(room)
}

function endGame(room) {
  clearRoomTimers(room)
  room.phase = 'ended'
  const rankedPlayers = publicPlayers(room).sort((a, b) => b.score - a.score)
  gameHistory.push({
    roomCode: room.code,
    endedAt: new Date().toISOString(),
    players: rankedPlayers,
    settings: room.settings,
  })
  persistHistory()
  room.drawerId = null
  room.secretWord = ''
  room.wordLength = 0
  room.strokes = []
  room.guessedPlayerIds.clear()
  room.turnPoints.clear()
  broadcast(room, {
    type: 'game_ended',
    players: rankedPlayers,
  })
  broadcastRoomState(room)
}

function updateRoomSettings(room, settings) {
  if (room.phase !== 'lobby' && room.phase !== 'ended') return
  const customWords = String(settings.customWords || '')
    .split(',')
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length >= 3 && word.length <= 18)
    .slice(0, 40)
  room.settings = {
    rounds: clampNumber(settings.rounds, 1, 8, room.settings.rounds),
    drawTime: clampNumber(settings.drawTime, 20, 120, room.settings.drawTime),
    maxPlayers: clampNumber(settings.maxPlayers, 2, MAX_PLAYERS, room.settings.maxPlayers),
    aiDifficulty: AI_DIFFICULTY[settings.aiDifficulty] ? settings.aiDifficulty : room.settings.aiDifficulty,
    aiCanDraw: Boolean(settings.aiCanDraw),
    isPublic: Boolean(settings.isPublic),
    language: WORD_BANK[settings.language] ? settings.language : room.settings.language,
    wordDifficulty: WORD_BANK.en[settings.wordDifficulty] ? settings.wordDifficulty : room.settings.wordDifficulty,
    customWordMode: ['disabled', 'mixed', 'only'].includes(settings.customWordMode)
      ? settings.customWordMode
      : room.settings.customWordMode,
    customWords,
  }
  broadcastRoomState(room)
}

function addAiPlayer(room) {
  if (room.phase !== 'lobby' && room.phase !== 'ended') return
  const activePlayerCount = [...room.players.values()].filter((player) => !player.isSpectator).length
  if (activePlayerCount >= room.settings.maxPlayers) return
  const usedNames = new Set([...room.players.values()].map((player) => player.name))
  const template = AI_PLAYERS.find((candidate) => !usedNames.has(candidate.name)) || {
    name: `AI ${room.players.size + 1}`,
    avatar: 'robot',
  }
  const player = {
    id: `ai-${randomBytes(5).toString('hex')}`,
    name: template.name,
    avatar: template.avatar,
    score: 0,
    isAi: true,
  }
  room.players.set(player.id, player)
  broadcast(room, {
    type: 'player_joined',
    player,
    players: publicPlayers(room),
  })
  broadcastRoomState(room)
}

function removeAiPlayer(room, playerId) {
  if (room.phase !== 'lobby' && room.phase !== 'ended') return
  const player = room.players.get(playerId)
  if (!player?.isAi) return
  room.players.delete(playerId)
  broadcast(room, {
    type: 'player_left',
    playerId,
    playerName: player.name,
    players: publicPlayers(room),
  })
  broadcastRoomState(room)
}

function kickPlayer(room, playerId) {
  const player = room.players.get(playerId)
  if (!player || player.id === room.hostId) return

  if (player.isAi) {
    removeAiPlayer(room, playerId)
    return
  }

  const socket = [...room.sockets].find((candidate) => candidate.playerId === playerId)
  if (socket) {
    sendSocket(socket, { type: 'error', message: 'You were removed from the room by the host.' })
    socket.end()
  }
}

function voteKickPlayer(room, voter, playerId) {
  const target = room.players.get(playerId)
  if (!target || target.id === room.hostId || target.isAi || voter.isSpectator) return
  const votes = room.voteKicks.get(playerId) || new Set()
  votes.add(voter.id)
  room.voteKicks.set(playerId, votes)
  const eligibleVoters = [...room.players.values()].filter((player) => !player.isAi && !player.isSpectator && player.id !== target.id)
  const needed = Math.max(2, Math.ceil(eligibleVoters.length / 2))
  broadcast(room, {
    type: 'system_message',
    message: `${target.name} has ${votes.size}/${needed} vote-kick votes.`,
  })
  if (votes.size >= needed) {
    kickPlayer(room, playerId)
  }
}

function awardCorrectGuess(room, player) {
  if (room.guessedPlayerIds.has(player.id)) return
  room.guessedPlayerIds.add(player.id)
  const points = Math.max(10, room.timeLeft * 10)
  player.score += points
  room.turnPoints.set(player.id, (room.turnPoints.get(player.id) || 0) + points)
  broadcast(room, {
    type: 'correct_guess',
    playerId: player.id,
    playerName: player.name,
    players: publicPlayers(room),
  })

  if (allGuessersDone(room)) {
    endRound(room, 'Everyone guessed correctly.')
  }
}

function scheduleAiActions(room) {
  const drawer = room.players.get(room.drawerId)
  if (drawer?.isAi) {
    scheduleAiDrawing(room)
  }

  for (const player of room.players.values()) {
    if (!player.isAi || player.id === room.drawerId) continue
    scheduleAiGuess(room, player)
  }
}

function scheduleAiGuess(room, player) {
  const difficulty = AI_DIFFICULTY[room.settings.aiDifficulty] || AI_DIFFICULTY.medium
  const firstDelay = difficulty.firstGuessMs + Math.floor(Math.random() * 2000)
  const startedAt = Date.now()
  let sentWrongGuess = false
  const guessTimerId = setInterval(() => {
    if (room.phase !== 'drawing' || room.guessedPlayerIds.has(player.id)) {
      clearInterval(guessTimerId)
      room.aiTimerIds.delete(guessTimerId)
      return
    }

    const pointCount = room.strokes.reduce((total, stroke) => total + (stroke.points?.length || 0), 0)
    if (pointCount < difficulty.pointThreshold) return

    const elapsed = Date.now() - startedAt
    if (!sentWrongGuess && elapsed >= Math.max(2500, Math.floor(firstDelay * 0.55))) {
      sentWrongGuess = true
      broadcast(room, {
        type: 'chat_message',
        playerId: player.id,
        playerName: player.name,
        text: pickWrongAiGuess(room.secretWord),
        role: 'ai',
      })
      return
    }

    if (elapsed < firstDelay) return
    clearInterval(guessTimerId)
    room.aiTimerIds.delete(guessTimerId)
    const willGuessCorrectly = Math.random() <= difficulty.correctChance
    if (willGuessCorrectly) {
      awardCorrectGuess(room, player)
      return
    }
    broadcast(room, {
      type: 'chat_message',
      playerId: player.id,
      playerName: player.name,
      text: pickWrongAiGuess(room.secretWord),
      role: 'ai',
    })
  }, 1000)

  room.aiTimerIds.add(guessTimerId)
}

function scheduleAiDrawing(room) {
  const strokes = createAiStrokes(room.secretWord)
  strokes.forEach((stroke, index) => {
    const timerId = setTimeout(() => {
      room.aiTimerIds.delete(timerId)
      if (room.phase !== 'drawing') return
      room.strokes.push(stroke)
      broadcast(room, {
        type: 'drawing_stroke',
        playerId: room.drawerId,
        stroke,
      })
    }, 850 * (index + 1))
    room.aiTimerIds.add(timerId)
  })
}

function createAiStrokes(word) {
  const normalizedWord = normalizeGuess(word)
  const line = (index, color, size, points) => ({
    id: `ai-${Date.now()}-${index}-${randomBytes(3).toString('hex')}`,
    color,
    size,
    mode: 'draw',
    points: points.map(([x, y], pointIndex) => ({ x, y, t: pointIndex * 100 })),
  })
  const circle = (startIndex, cx, cy, radius, color = '#111827', size = 8) =>
    line(
      startIndex,
      color,
      size,
      Array.from({ length: 25 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2
        return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
      }),
    )
  if (normalizedWord === 'sun' || normalizedWord === 'sol') {
    return [
      circle(0, 380, 250, 72, '#f59e0b', 12),
      ...Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2
        return line(index + 1, '#f59e0b', 10, [
          [380 + Math.cos(angle) * 95, 250 + Math.sin(angle) * 95],
          [380 + Math.cos(angle) * 140, 250 + Math.sin(angle) * 140],
        ])
      }),
    ]
  }
  if (normalizedWord === 'cat' || normalizedWord === 'gato') {
    return [
      circle(0, 380, 250, 95),
      line(1, '#111827', 9, [[310, 185], [310, 105], [360, 165]]),
      line(2, '#111827', 9, [[400, 165], [450, 105], [450, 185]]),
      circle(3, 350, 240, 8, '#111827', 7),
      circle(4, 410, 240, 8, '#111827', 7),
      line(5, '#111827', 7, [[365, 280], [380, 292], [395, 280]]),
      line(6, '#111827', 5, [[300, 270], [230, 250]]),
      line(7, '#111827', 5, [[300, 290], [225, 300]]),
      line(8, '#111827', 5, [[460, 270], [530, 250]]),
      line(9, '#111827', 5, [[460, 290], [535, 300]]),
    ]
  }
  if (normalizedWord === 'flower' || normalizedWord === 'flor') {
    return [
      line(0, '#16a34a', 12, [[380, 430], [380, 270]]),
      circle(1, 380, 210, 35, '#f59e0b', 10),
      ...Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2
        return circle(index + 2, 380 + Math.cos(angle) * 65, 210 + Math.sin(angle) * 65, 40, '#dc2626', 9)
      }),
      line(8, '#16a34a', 10, [[380, 350], [320, 320], [380, 375]]),
    ]
  }
  if (normalizedWord === 'rocket' || normalizedWord === 'cohete') {
    return [
      line(0, '#1d4ed8', 10, [[380, 90], [315, 250], [335, 390], [425, 390], [445, 250], [380, 90]]),
      circle(1, 380, 245, 30, '#1d4ed8', 8),
      line(2, '#dc2626', 10, [[335, 330], [275, 410], [340, 390]]),
      line(3, '#dc2626', 10, [[425, 330], [485, 410], [420, 390]]),
      line(4, '#f59e0b', 14, [[355, 392], [380, 475], [405, 392]]),
    ]
  }
  const seed = [...String(word)].reduce((total, char) => total + char.charCodeAt(0), 0)
  const count = 5 + (seed % 4)
  return Array.from({ length: count }, (_, index) => {
    const x = 90 + ((seed + index * 67) % 520)
    const y = 90 + ((seed + index * 43) % 340)
    const width = 45 + ((seed + index * 19) % 90)
    const height = 30 + ((seed + index * 31) % 70)
    return {
      id: `ai-${Date.now()}-${index}-${randomBytes(3).toString('hex')}`,
      color: ['#1d4ed8', '#111827', '#dc2626', '#16a34a'][index % 4],
      size: 8 + (index % 3) * 3,
      mode: 'draw',
      points: [
        { x, y, t: index * 100 },
        { x: x + width * 0.4, y: y + height, t: index * 100 + 120 },
        { x: x + width, y: y + height * 0.25, t: index * 100 + 240 },
      ],
    }
  })
}

function addPlayerToRoom(room, socket, name, avatar, options = {}) {
  if (room.cleanupTimerId) {
    clearTimeout(room.cleanupTimerId)
    room.cleanupTimerId = null
  }

  const reconnectingPlayer = [...room.players.values()].find(
    (player) => !player.isAi && player.disconnected && player.sessionId && player.sessionId === options.sessionId,
  )
  if (reconnectingPlayer) {
    reconnectingPlayer.disconnected = false
    reconnectingPlayer.rateLimits = {}
    room.sockets.add(socket)
    socket.roomCode = room.code
    socket.playerId = reconnectingPlayer.id
    sendSocket(socket, roomStateFor(room, reconnectingPlayer.id))
    broadcast(room, {
      type: 'system_message',
      message: `${reconnectingPlayer.name} reconnected.`,
    }, socket)
    broadcastRoomState(room)
    return
  }

  const validation = validateJoin(room, name)
  if (!validation.ok) {
    sendSocket(socket, {
      type: 'join_error',
      message: validation.message,
    })
    socket.end()
    return
  }

  const player = {
    id: randomBytes(8).toString('hex'),
    name: validation.name,
    avatar: sanitizeAvatar(avatar),
    score: 0,
    isAi: false,
    isSpectator: Boolean(options.spectator),
    sessionId: options.sessionId || randomBytes(8).toString('hex'),
    rateLimits: {},
  }
  room.players.set(player.id, player)
  room.sockets.add(socket)
  socket.roomCode = room.code
  socket.playerId = player.id

  if (!room.hostId && !player.isSpectator) {
    room.hostId = player.id
  }

  sendSocket(socket, roomStateFor(room, player.id))
  broadcast(room, {
    type: 'player_joined',
    player,
    players: publicPlayers(room),
  }, socket)
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 8_000_000) {
        request.destroy()
        rejectBody(new Error('Request body is too large.'))
      }
    })
    request.on('end', () => resolveBody(body))
    request.on('error', rejectBody)
  })
}

async function requestOpenAiGuess(imageDataUrl, wordOptions) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('Missing OPENAI_API_KEY in .env.')
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'You are Pixel Pal, a playful drawing-game AI guesser.',
                'Look at this simple canvas drawing and guess what it is.',
                `Only choose one answer from this list: ${wordOptions.join(', ')}.`,
                'Reply with only the guessed word, no sentence and no punctuation.',
              ].join(' '),
            },
            {
              type: 'input_image',
              image_url: imageDataUrl,
            },
          ],
        },
      ],
      max_output_tokens: 20,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    const message = data?.error?.message || 'OpenAI request failed.'
    throw new Error(message)
  }

  return String(data.output_text || '').trim()
}

loadEnvFile()
loadHistory()
loadRooms()

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  if (request.method === 'POST' && request.url === '/api/rooms') {
    const room = createRoom()
    sendJson(response, 200, { roomCode: room.code })
    return
  }

  if (request.method === 'GET' && request.url === '/api/public-rooms') {
    sendJson(response, 200, { rooms: publicRoomList() })
    return
  }

  if (request.method === 'GET' && request.url === '/api/history') {
    sendJson(response, 200, {
      games: gameHistory.slice(-20).reverse(),
      reports: reports.slice(-20).reverse(),
    })
    return
  }

  if (request.method === 'GET' && request.url === '/api/health') {
    sendJson(response, 200, {
      status: 'ok',
      rooms: rooms.size,
      uptimeSeconds: Math.floor(process.uptime()),
    })
    return
  }

  if (request.method === 'GET' && !request.url?.startsWith('/api/') && serveFrontend(request, response)) {
    return
  }

  if (request.method !== 'POST' || request.url !== '/api/guess') {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  try {
    const body = await readRequestBody(request)
    const payload = JSON.parse(body)
    const imageDataUrl = payload.imageDataUrl
    const wordOptions = Array.isArray(payload.wordOptions) ? payload.wordOptions : []

    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/png;base64,')) {
      sendJson(response, 400, { error: 'Expected a PNG data URL.' })
      return
    }

    if (!wordOptions.every((word) => typeof word === 'string') || wordOptions.length === 0) {
      sendJson(response, 400, { error: 'Expected word options.' })
      return
    }

    const guess = await requestOpenAiGuess(imageDataUrl, wordOptions)
    sendJson(response, 200, { guess })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Guess failed.',
    })
  }
})

function encodeWebSocketFrame(message) {
  const payload = Buffer.from(message)
  const length = payload.length

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload])
  }

  if (length < 65536) {
    const header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(length, 2)
    return Buffer.concat([header, payload])
  }

  const header = Buffer.alloc(10)
  header[0] = 0x81
  header[1] = 127
  header.writeBigUInt64BE(BigInt(length), 2)
  return Buffer.concat([header, payload])
}

function decodeWebSocketFrames(buffer) {
  const messages = []
  let cursor = 0
  while (buffer.length - cursor >= 2) {
    const firstByte = buffer[cursor]
    const secondByte = buffer[cursor + 1]
    const opcode = firstByte & 0x0f
    const isFinal = Boolean(firstByte & 0x80)
    const masked = Boolean(secondByte & 0x80)
    if (!isFinal || !masked) throw new Error('Unsupported WebSocket frame.')

    let offset = cursor + 2
    let length = secondByte & 0x7f
    if (length === 126) {
      if (buffer.length - offset < 2) break
      length = buffer.readUInt16BE(offset)
      offset += 2
    } else if (length === 127) {
      if (buffer.length - offset < 8) break
      length = Number(buffer.readBigUInt64BE(offset))
      offset += 8
    }
    if (!Number.isSafeInteger(length) || length > MAX_WS_PAYLOAD_BYTES) {
      throw new Error('WebSocket message is too large.')
    }
    if (buffer.length - offset < 4 + length) break

    const mask = buffer.subarray(offset, offset + 4)
    offset += 4
    const payload = buffer.subarray(offset, offset + length)
    const unmasked = Buffer.alloc(payload.length)
    for (let index = 0; index < payload.length; index += 1) {
      unmasked[index] = payload[index] ^ mask[index % 4]
    }
    cursor = offset + length
    if (opcode === 0x8) {
      messages.push({ close: true })
    } else if (opcode === 0x1) {
      messages.push(JSON.parse(unmasked.toString('utf8')))
    }
  }
  return { messages, remaining: buffer.subarray(cursor) }
}

function handleSocketMessage(socket, message) {
  const room = rooms.get(socket.roomCode)
  const player = room?.players.get(socket.playerId)
  if (!room || !player) return

  if (message.type === 'update_settings' && player.id === room.hostId) {
    updateRoomSettings(room, message.settings || {})
    return
  }

  if (message.type === 'add_ai' && player.id === room.hostId) {
    addAiPlayer(room)
    return
  }

  if (message.type === 'remove_ai' && player.id === room.hostId) {
    removeAiPlayer(room, String(message.playerId || ''))
    return
  }

  if (message.type === 'kick_player' && player.id === room.hostId) {
    kickPlayer(room, String(message.playerId || ''))
    return
  }

  if (message.type === 'report_player') {
    const reported = room.players.get(String(message.playerId || ''))
    if (!reported || reported.id === player.id) return
    reports.push({
      roomCode: room.code,
      reporter: player.name,
      reported: reported.name,
      createdAt: new Date().toISOString(),
    })
    persistHistory()
    broadcast(room, {
      type: 'system_message',
      message: `${player.name} reported ${reported.name}.`,
    })
    return
  }

  if (message.type === 'vote_kick') {
    voteKickPlayer(room, player, String(message.playerId || ''))
    return
  }

  if (message.type === 'start_game' && player.id === room.hostId) {
    startGame(room)
    return
  }

  if (message.type === 'return_lobby' && player.id === room.hostId && room.phase === 'ended') {
    clearRoomTimers(room)
    room.phase = 'lobby'
    room.round = 1
    room.turnIndex = -1
    room.drawerId = null
    room.secretWord = ''
    room.wordLength = 0
    room.strokes = []
    room.guessedPlayerIds.clear()
    room.turnPoints.clear()
    broadcastRoomState(room)
    return
  }

  if (message.type === 'choose_word' && player.id === room.drawerId) {
    chooseRoomWord(room, String(message.word || '').toUpperCase(), false)
    return
  }

  if (message.type === 'chat_guess') {
    if (isRateLimited(player, 'chat', 8, 10_000)) {
      sendSocket(socket, { type: 'error', message: 'Slow down before sending more chat.' })
      return
    }
    const text = sanitizeText(message.text, 120)
    if (!text.trim()) return
    if (
      room.phase === 'drawing' &&
      player.id === room.drawerId &&
      normalizeGuess(text).includes(normalizeGuess(room.secretWord))
    ) {
      sendSocket(socket, { type: 'error', message: 'Do not reveal the secret word in chat.' })
      return
    }

    const isCorrect =
      room.phase === 'drawing' &&
      !room.choosingWord &&
      player.id !== room.drawerId &&
      !player.isSpectator &&
      normalizeGuess(text) === normalizeGuess(room.secretWord)
    if (isCorrect && !room.guessedPlayerIds.has(player.id)) {
      awardCorrectGuess(room, player)
      return
    }

    broadcast(room, {
      type: 'chat_message',
      playerId: player.id,
      playerName: player.name,
      text,
      role: player.isAi ? 'ai' : 'player',
    })
    return
  }

  if (message.type === 'drawing_stroke' && player.id === room.drawerId && message.stroke) {
    if (room.phase !== 'drawing' || room.choosingWord || !room.secretWord || player.isAi) return
    if (isRateLimited(player, 'drawing', 80, 10_000)) return
    if (room.strokes.length >= MAX_STROKES) return
    const stroke = sanitizeStroke(message.stroke)
    if (!stroke) {
      sendSocket(socket, { type: 'error', message: 'Invalid drawing data.' })
      return
    }
    room.strokes.push(stroke)
    broadcast(room, {
      type: 'drawing_stroke',
      playerId: player.id,
      stroke,
    }, socket)
    schedulePersistRooms()
  }
}

function removeSocket(socket) {
  const room = rooms.get(socket.roomCode)
  if (!room) return
  const player = room.players.get(socket.playerId)
  room.sockets.delete(socket)
  if (player) {
    player.disconnected = true
  }

  if (socket.playerId === room.drawerId) {
    if (room.phase === 'drawing' || room.phase === 'choosing') {
      endRound(room, 'The drawer left.')
    } else {
      room.drawerId = null
    }
  }

  if (socket.playerId === room.hostId) {
    room.hostId = [...room.players.values()].find((nextPlayer) => !nextPlayer.isAi && !nextPlayer.disconnected && !nextPlayer.isSpectator)?.id || null
  }

  if (room.sockets.size === 0) {
    clearRoomTimers(room)
    room.cleanupTimerId = setTimeout(() => {
      rooms.delete(room.code)
      schedulePersistRooms()
    }, clampNumber(process.env.ROOM_TTL_MINUTES, 5, 1440, 30) * 60_000)
    schedulePersistRooms()
    return
  }

  if (!room.hostId) {
    room.hostId = [...room.players.values()].find((nextPlayer) => !nextPlayer.isAi && !nextPlayer.isSpectator)?.id || null
  }

  broadcast(room, {
    type: 'player_left',
    playerId: socket.playerId,
    playerName: player?.name,
    players: publicPlayers(room),
  })
  broadcastRoomState(room)
}

server.on('upgrade', (request, socket) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host}`)
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    const roomCode = String(url.searchParams.get('room') || '').toUpperCase()
    const name = String(url.searchParams.get('name') || 'Player')
    const avatar = String(url.searchParams.get('avatar') || 'cat')
    const spectator = url.searchParams.get('spectator') === '1'
    const sessionId = String(url.searchParams.get('session') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
    const room = rooms.get(roomCode)

    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string' || key.length < 16) {
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(`${key}${WS_MAGIC}`).digest('base64')
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'))

    if (!room) {
      sendSocket(socket, {
        type: 'join_error',
        message: 'Room does not exist.',
      })
      socket.end()
      return
    }

    addPlayerToRoom(room, socket, name, avatar, { spectator, sessionId })
    socket.wsBuffer = Buffer.alloc(0)

    socket.on('data', (buffer) => {
      try {
        socket.wsBuffer = Buffer.concat([socket.wsBuffer, buffer])
        const decoded = decodeWebSocketFrames(socket.wsBuffer)
        socket.wsBuffer = decoded.remaining
        for (const message of decoded.messages) {
          if (message?.close) {
            socket.end()
            return
          }
          handleSocketMessage(socket, message)
        }
      } catch (error) {
        sendSocket(socket, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Invalid message.',
        })
      }
    })

    socket.on('close', () => removeSocket(socket))
    socket.on('error', () => removeSocket(socket))
  } catch {
    socket.destroy()
  }
})

export function startServer(port = PORT, host = HOST) {
  return server.listen(port, host, () => {
    console.log(`Pixel Pal API listening on http://${host}:${port}`)
  })
}

export {
  decodeWebSocketFrames,
  getWords,
  normalizeGuess,
  sanitizePlayerName,
  sanitizeStroke,
  sanitizeText,
  updateRoomSettings,
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer()
}
