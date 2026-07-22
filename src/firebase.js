import { initializeApp } from 'firebase/app'
import { getDatabase, forceWebSockets } from 'firebase/database'
import { isDiscordActivity } from './discordPatch'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.databaseURL)

// Inside Discord's sandbox, Firebase's default long-polling transport is
// unfixable (it injects <script> tags the CSP blocks) — but websockets go
// through the proxy fine. Skip straight to websockets there.
if (isDiscordActivity && isFirebaseConfigured) {
  forceWebSockets()
}

export const db = isFirebaseConfigured ? getDatabase(initializeApp(config)) : null
