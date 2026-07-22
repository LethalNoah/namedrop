import { DiscordSDK } from '@discord/embedded-app-sdk'
import { isDiscordActivity } from './discordPatch'

const DISCORD_CLIENT_ID = '1529563989305069648' // public, like the Firebase config

export { isDiscordActivity }

let sdk = null

// Call once at startup, only in Discord mode. Resolves to the room code
// shared by everyone in this activity instance. (The sandbox network
// patch lives in discordPatch.js and has already run by now.)
export async function initDiscord() {
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
