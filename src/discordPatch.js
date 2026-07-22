// This module MUST be the first import in main.jsx. Firebase captures the
// browser's networking primitives (WebSocket/fetch) the moment its module
// loads, so the proxy rewrite has to be installed before Firebase — or any
// other network-touching module — is evaluated.
//
// Discord's own patchUrlMappings helper proved unreliable here, so this is
// a hand-rolled rewrite of the three hosts the game talks to. All three
// prefixes must exist as URL Mappings in the Discord Developer Portal.

// Discord loads Activities in an iframe with ?frame_id=... — that's how we
// know we're inside Discord rather than a normal browser tab.
export const isDiscordActivity = new URLSearchParams(window.location.search).has(
  'frame_id',
)

export function toProxyUrl(raw) {
  try {
    const url = new URL(String(raw), window.location.href)
    const firebase = url.host.match(/^([\w-]+)\.firebaseio\.com$/)
    if (firebase) {
      url.pathname = `/.proxy/firebase/${firebase[1]}${url.pathname}`
    } else if (url.host === 'en.wikipedia.org') {
      url.pathname = `/.proxy/wiki${url.pathname}`
    } else if (url.host === 'upload.wikimedia.org') {
      url.pathname = `/.proxy/wikimedia${url.pathname}`
    } else {
      return String(raw)
    }
    url.host = window.location.host
    return url.toString()
  } catch {
    return String(raw)
  }
}

if (isDiscordActivity) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    if (typeof input === 'string' || input instanceof URL) {
      return originalFetch(toProxyUrl(input), init)
    }
    return originalFetch(input, init)
  }

  const OriginalWebSocket = window.WebSocket
  window.WebSocket = class extends OriginalWebSocket {
    constructor(url, protocols) {
      super(toProxyUrl(url), protocols)
    }
  }

  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    return originalOpen.call(this, method, toProxyUrl(url), ...rest)
  }
}
