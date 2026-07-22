import {
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
} from 'firebase/database'
import { db } from '../firebase'

// No I, O, 0, 1 — codes get read out loud over voice chat
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 4

function randomCode() {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

export function normalizeCode(raw) {
  return raw.trim().toUpperCase()
}

// Rooms are throwaway — sweep anything older than a day so the database
// doesn't accumulate junk. Best-effort: failures never block room creation.
const STALE_ROOM_MS = 24 * 60 * 60 * 1000

async function pruneStaleRooms() {
  try {
    const snap = await get(ref(db, 'rooms'))
    if (!snap.exists()) return
    const now = Date.now()
    const stale = Object.entries(snap.val()).filter(
      ([, room]) => now - (room.createdAt ?? 0) > STALE_ROOM_MS,
    )
    await Promise.all(stale.map(([code]) => remove(ref(db, `rooms/${code}`))))
  } catch {
    // ignore — cleanup is opportunistic
  }
}

export async function createRoom(hostId, hostName) {
  await pruneStaleRooms()
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode()
    const roomRef = ref(db, `rooms/${code}`)
    const snap = await get(roomRef)
    if (snap.exists()) continue
    await set(roomRef, {
      status: 'lobby',
      hostId,
      turnOrder: 'rotating',
      createdAt: serverTimestamp(),
      players: {
        [hostId]: { name: hostName, connected: true, joinedAt: serverTimestamp() },
      },
    })
    return code
  }
  throw new Error('Could not find a free room code — try again')
}

export async function joinRoom(code, playerId, name) {
  const snap = await get(ref(db, `rooms/${code}`))
  if (!snap.exists()) throw new Error('Room not found — check the code')
  const room = snap.val()
  const alreadyIn = Boolean(room.players?.[playerId])
  if (room.status !== 'lobby' && !alreadyIn) {
    throw new Error('That game has already started')
  }
  const patch = { name, connected: true }
  if (!alreadyIn) patch.joinedAt = serverTimestamp()
  await update(ref(db, `rooms/${code}/players/${playerId}`), patch)
}

export function subscribeRoom(code, callback) {
  return onValue(ref(db, `rooms/${code}`), (snap) => callback(snap.val()))
}

// Keeps players/{playerId}/connected accurate across refreshes and drops.
// Re-arms onDisconnect every time the client reconnects to Firebase.
export function attachPresence(code, playerId) {
  const connectedRef = ref(db, '.info/connected')
  const meRef = ref(db, `rooms/${code}/players/${playerId}/connected`)
  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      onDisconnect(meRef).set(false)
      set(meRef, true)
    }
  })
  return () => {
    onDisconnect(meRef).cancel()
    unsubscribe()
  }
}

export async function leaveRoom(code, playerId) {
  await remove(ref(db, `rooms/${code}/players/${playerId}`))
}

function shuffle(array) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Shuffle players into a cycle: each assigns the next, last wraps to first.
// Guarantees no self-assignment and a perfect 1-to-1 (2-player case: mutual).
export async function startGame(code) {
  const snap = await get(ref(db, `rooms/${code}/players`))
  const ids = Object.keys(snap.val() ?? {})
  if (ids.length < 2) throw new Error('Need at least 2 players')
  const ring = shuffle(ids)
  const patch = { status: 'assigning', currentTurn: ring[0] }
  ring.forEach((id, i) => {
    const target = ring[(i + 1) % ring.length]
    patch[`players/${id}/assignsTo`] = target
    patch[`players/${target}/assignedBy`] = id
    patch[`players/${id}/character`] = null
    patch[`players/${id}/hasGuessed`] = false
    patch[`players/${id}/correct`] = null
    patch[`players/${id}/order`] = null
  })
  await update(ref(db, `rooms/${code}`), patch)
}

// Store the picked character on the assignee. Clients never render a
// player's own character back to them — that's the whole game.
export async function lockCharacter(code, assigneeId, character) {
  await update(ref(db, `rooms/${code}/players/${assigneeId}`), { character })
}

export async function setRoomStatus(code, status) {
  await update(ref(db, `rooms/${code}`), { status })
}

export async function setTurnOrder(code, turnOrder) {
  await update(ref(db, `rooms/${code}`), { turnOrder })
}

// The assignsTo chain is already a ring over all players, so "next turn"
// just walks it, skipping players who have finished. Prefer connected
// players; if everyone left is offline, hand the turn to an offline one
// rather than dropping it (they may reconnect).
function nextInRing(players, fromId) {
  const walk = (skipOffline) => {
    let cursor = players[fromId]?.assignsTo
    for (let i = 0; i < Object.keys(players).length; i++) {
      if (!cursor || cursor === fromId) break
      const player = players[cursor]
      if (player && !player.hasGuessed && !(skipOffline && player.connected === false)) {
        return cursor
      }
      cursor = player?.assignsTo
    }
    return null
  }
  return walk(true) ?? walk(false)
}

export async function passTurn(code, players, fromId) {
  await update(ref(db, `rooms/${code}`), {
    currentTurn: nextInRing(players, fromId),
  })
}

export async function submitGuessResult(code, playerId, wasCorrect, order) {
  await update(ref(db, `rooms/${code}/players/${playerId}`), {
    hasGuessed: true,
    correct: wasCorrect,
    order: wasCorrect ? order : null,
  })
}
