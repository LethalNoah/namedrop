import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk'

const DISCORD_CLIENT_ID = '1529563989305069648' // public, like the Firebase config

// Discord loads Activities in an iframe with ?frame_id=... — that's how we
// know we're inside Discord rather than a normal browser tab.
export const isDiscordActivity = new URLSearchParams(window.location.search).has(
  'frame_id',
)

let sdk = null

// Call once at startup, only in Discord mode. Resolves to the room code
// shared by everyone in this activity instance.
export async function initDiscord() {
  // Inside Discord's sandbox all network calls must go through its proxy.
  // This patches fetch/WebSocket so Firebase and the Wikipedia API work
  // unchanged. The same prefixes must exist as URL Mappings in the
  // Discord Developer Portal.
  patchUrlMappings([
    { prefix: '/firebase/{subdomain}', target: '{subdomain}.firebaseio.com' },
    { prefix: '/wiki', target: 'en.wikipedia.org' },
    { prefix: '/wikimedia', target: 'upload.wikimedia.org' },
  ])
  sdk = new DiscordSDK(DISCORD_CLIENT_ID)
  await sdk.ready()
  return roomCodeFromInstance(sdk.instanceId)
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

// patchUrlMappings covers fetch/WebSocket but NOT <img> tags, so image
// URLs get rewritten manually when rendering inside Discord.
export function imageUrl(url) {
  if (!url || !isDiscordActivity) return url
  return url.replace('https://upload.wikimedia.org', '/.proxy/wikimedia')
}
