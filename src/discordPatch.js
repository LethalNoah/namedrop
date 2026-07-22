// This module MUST be the first import in main.jsx. Firebase captures the
// browser's networking primitives (WebSocket/fetch) the moment its module
// loads, so Discord's proxy patch has to be applied before Firebase — or
// any other network-touching module — is evaluated.
import { patchUrlMappings } from '@discord/embedded-app-sdk'

// Discord loads Activities in an iframe with ?frame_id=... — that's how we
// know we're inside Discord rather than a normal browser tab.
export const isDiscordActivity = new URLSearchParams(window.location.search).has(
  'frame_id',
)

if (isDiscordActivity) {
  // Same prefixes as the URL Mappings in the Discord Developer Portal.
  patchUrlMappings([
    { prefix: '/firebase/{subdomain}', target: '{subdomain}.firebaseio.com' },
    { prefix: '/wiki', target: 'en.wikipedia.org' },
    { prefix: '/wikimedia', target: 'upload.wikimedia.org' },
  ])
}
