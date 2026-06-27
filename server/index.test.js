import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeWebSocketFrames,
  normalizeGuess,
  sanitizePlayerName,
  sanitizeStroke,
  sanitizeText,
} from './index.js'

function maskedTextFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload))
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78])
  const header = body.length < 126
    ? Buffer.from([0x81, 0x80 | body.length])
    : Buffer.from([0x81, 0xfe, body.length >> 8, body.length & 0xff])
  const masked = Buffer.from(body.map((byte, index) => byte ^ mask[index % 4]))
  return Buffer.concat([header, mask, masked])
}

test('normalizes guesses consistently', () => {
  assert.equal(normalizeGuess('  APP-le! '), 'apple')
})

test('sanitizes names and chat content', () => {
  assert.equal(sanitizePlayerName('  <Alex>  '), 'Alex')
  assert.equal(sanitizeText('hello <b> stupid'), 'hello b ***')
  assert.equal(sanitizeText('\u0000   '), '')
})

test('accepts safe strokes and rejects malformed strokes', () => {
  const valid = sanitizeStroke({
    id: 'stroke-1',
    color: '#123abc',
    size: 8,
    mode: 'draw',
    points: [{ x: 10, y: 20 }, { x: 30, y: 40, t: 2 }],
  })
  assert.equal(valid?.points.length, 2)
  assert.equal(sanitizeStroke({ ...valid, size: 100 }), null)
  assert.equal(sanitizeStroke({ ...valid, points: [{ x: Number.NaN, y: 1 }] }), null)
})

test('buffers partial frames and decodes multiple frames', () => {
  const first = maskedTextFrame({ type: 'chat_guess', text: 'cat' })
  const second = maskedTextFrame({ type: 'vote_kick', playerId: 'p2' })
  const partial = decodeWebSocketFrames(first.subarray(0, 5))
  assert.equal(partial.messages.length, 0)
  assert.equal(partial.remaining.length, 5)

  const complete = decodeWebSocketFrames(Buffer.concat([partial.remaining, first.subarray(5), second]))
  assert.deepEqual(complete.messages, [
    { type: 'chat_guess', text: 'cat' },
    { type: 'vote_kick', playerId: 'p2' },
  ])
  assert.equal(complete.remaining.length, 0)
})
