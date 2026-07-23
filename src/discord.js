import { useEffect, useState } from 'react'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import { isDiscordActivity } from './discordPatch'

const DISCORD_CLIENT_ID = '1529563989305069648' // public, like the Firebase config

export { isDiscordActivity }

let sdk = null

// Call once at startup, only in Discord mode. Resolves to the shared room
// code plus the authenticated Discord user (null if auth fails or is
// declined — callers fall back to a manual name prompt).
export async function initDiscord() {
  sdk = new DiscordSDK(DISCORD_CLIENT_ID)
  await sdk.ready()

  let user = null
  try {
    const { code } = await sdk.commands.authorize({
      client_id: DISCORD_CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'rpc.voice.read'],
    })
    // Relative /.proxy path = our own Vercel deployment through Discord's
    // proxy; the client secret lives only in that serverless function.
    const response = await fetch('/.proxy/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const { access_token } = await response.json()
    const auth = await sdk.commands.authenticate({ access_token })
    user = auth.user
    subscribeSpeakingEvents()
  } catch {
    // Auth is a nice-to-have; the game still works with typed names.
  }

  return { roomCode: roomCodeFromInstance(sdk.instanceId), user }
}

// --- Speaking events (requires rpc.voice.read, so only after auth) ---

const speakingIds = new Set()
const speakingListeners = new Set()

function notifySpeaking() {
  const snapshot = new Set(speakingIds)
  speakingListeners.forEach((listener) => listener(snapshot))
}

async function subscribeSpeakingEvents() {
  const channelId = sdk?.channelId
  if (!channelId) return
  try {
    await sdk.subscribe(
      'SPEAKING_START',
      ({ user_id: userId }) => {
        speakingIds.add(userId)
        notifySpeaking()
      },
      { channel_id: channelId },
    )
    await sdk.subscribe(
      'SPEAKING_STOP',
      ({ user_id: userId }) => {
        speakingIds.delete(userId)
        notifySpeaking()
      },
      { channel_id: channelId },
    )
  } catch {
    // No glow, no problem — purely cosmetic.
  }
}

// React hook: the set of Discord user ids currently speaking in the call.
export function useSpeaking() {
  const [speaking, setSpeaking] = useState(() => new Set(speakingIds))
  useEffect(() => {
    speakingListeners.add(setSpeaking)
    return () => speakingListeners.delete(setSpeaking)
  }, [])
  return speaking
}

// Everyone in the same activity instance derives the same 4-char code, so
// the voice channel IS the room — no codes to share. The format also
// satisfies the database's room-code validation rules.
function roomCodeFromInstance(instanceId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let hash = 2166136261
  for (const ch of instanceId) {
    hash = ((hash ^ ch.charCodeAt(0)) * 16777619) >>> 0
  }
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[hash % chars.length]
    hash = Math.floor(hash / chars.length)
  }
  return code
}

// The network patch covers fetch/WebSocket but NOT <img> tags, so image
// URLs get rewritten manually when rendering inside Discord.
export function imageUrl(url) {
  if (!url || !isDiscordActivity) return url
  return url.replace('https://upload.wikimedia.org', '/.proxy/wikimedia')
}
