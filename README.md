# Namedrop

![Namedrop — everyone knows who you are, except you](docs/cover.png)

**Play it: https://namedrop-mauve.vercel.app** — or as a Discord Activity, embedded right in a voice channel.

A real-time multiplayer party game for playing with friends over a voice call — a digital take on Hedbanz / the card-on-the-forehead game, where the answer pool is *anyone on Wikipedia*.

Everyone can see who you are — except you. Each round, players secretly assign each other a famous person (real or fictional) by searching Wikipedia live. Then you ask yes/no questions out loud to figure out who you are. First to call it and flip their card wins the round.

## How it works

- **No accounts, no installs** — the host creates a room, shares a 4-letter code or link, friends join from any browser (phones included)
- **Live Wikipedia search** — pickers search anyone who's ever existed (or been imagined), with thumbnails and descriptions to disambiguate; no pre-built lists, so no spoilers and infinite variety
- **Assignment ring** — players are shuffled into a cycle so everyone assigns exactly one other player, with no self-assignment
- **The one rule that makes it work** — the app never renders your own character to you until you flip your card
- **Turn-based or free-for-all**, live presence, automatic round-over detection, rematch with a reshuffled ring
- **Self-cleaning** — rooms older than 24 hours are swept automatically

## Discord Activity mode

The same app doubles as a Discord Activity. Inside a voice channel:

- The **voice channel is the room** — no codes, no links; everyone on the call just clicks in
- **You join as yourself** — Discord OAuth identity means no typed names; your Discord display name and avatar carry over automatically
- **Speaking glow** — player cards light up with Discord's green ring while their player is talking, so you always know who's asking
- All traffic (Firebase realtime sync, Wikipedia API, images) is routed through Discord's sandbox proxy via a custom URL rewriter

Getting Firebase to work inside the activity sandbox took three discoveries, documented in the commit history: proxied paths need the `/.proxy/` prefix, the SDK's `patchUrlMappings` had to be replaced with a hand-rolled rewriter installed before Firebase loads, and Firebase's default long-polling transport must be skipped (`forceWebSockets()`) because its script-tag injection trips the activity's CSP.

## Tech

- **React + Vite** single-page app — one codebase serves both web and Discord modes
- **Firebase Realtime Database** for room state and live sync (no server to run)
- **MediaWiki API** for search + images
- **Discord Embedded App SDK** for the activity integration, with one Vercel serverless function for the OAuth token exchange
- Hosted on **Vercel**

Full design document in [SPEC.md](SPEC.md).

## Run it locally

1. `npm install`
2. Create a free Firebase project with a Realtime Database
3. Copy `.env.example` to `.env.local` and fill in your Firebase web-app config
4. `npm run dev`, then open two browser windows to play both sides

Database rules live in [database.rules.json](database.rules.json) (published via the Firebase console Rules tab).

To deploy: `npm run build`, then serve `dist/` + `api/` on Vercel (project `namedrop`; `DISCORD_CLIENT_SECRET` set in the project's environment variables).

## Progress

- [x] Lobby: room create/join, shareable link, live player sync, presence
- [x] Assignment ring + "you're picking for X" screen
- [x] Live Wikipedia search + confirm UI (including non-free lead images via `pilicense=any`)
- [x] Board with the hide-your-own-card rule
- [x] Turns, flip-to-win reveal, medals, end-of-round + rematch
- [x] Polish: turn-mode setting, disconnect handling, stale-room cleanup, mobile layout, reveal animations
- [x] Deployed to Vercel + Firebase security rules locked down
- [x] Discord Activity phase 1: launchable in a voice channel, full game playable in-sandbox
- [x] Discord Activity phase 2: OAuth identity auto-join + speaking indicators
- [ ] Themed pool mode — everyone secretly seeds characters into a shared pot
- [ ] Group-confirm reveal option
- [ ] Discord app verification for public launch (someday, maybe)
