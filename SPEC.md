# SPEC — "Who Am I?" (working title)

A browser-based, real-time multiplayer party game for playing with friends over Discord voice. Digital version of Hedbanz / the card-on-the-forehead game, but the answer set is *anyone who has ever existed* — pulled live from Wikipedia — so nobody can memorize the pool.

---

## Core concept

Each player is secretly assigned a famous person (real or fictional, historical or pop-culture). You can see **everyone else's** character but **not your own**. You figure out who you are by asking the group yes/no questions, out loud on the call. First to correctly declare who they are wins the round (or just keep going until everyone's got it — group's choice).

The twist that makes it fun: **players assign each other.** At the start of a round each player picks the character for one other player, live, by searching Wikipedia in the moment. No pre-built list, so no spoilers and infinite variety.

---

## Round flow

1. **Lobby.** A host creates a room, gets a shareable room code / link. Friends join by entering the code or opening the link and picking a display name. Host starts when everyone's in.
2. **Assignment ring.** On round start, the app forms a ring so every player *assigns exactly one other player* and *is assigned by exactly one other player*, with nobody drawing themselves. (Simple shuffle-and-rotate; see Edge cases.)
3. **Live pick.** Each player sees "You're choosing for **[assignee name]**" and gets a search box. They type anything — "Ada Lovelace", "the WW2 Germany leader", "Guy Fieri" — the app does a live Wikipedia lookup, shows candidate results with thumbnails, and the picker confirms the right one. Locks it in.
4. **Board.** Once all picks are locked, the game board appears. Each player sees a card for every *other* player showing that player's name + their assigned character's picture and name. **Your own card shows your name but hides your character** (silhouette / "???").
5. **Play.** Players take turns (or free-for-all) asking yes/no questions aloud. The app is not the question channel — voice is. The app is the shared board + turn indicator + reveal mechanic.
6. **Reveal / win.** When a player thinks they know, they hit **"I've got it."** Two options for confirming (pick one, or make it a room setting):
   - **Self-reveal:** they say it out loud, then tap to flip their own card and reveal whether they were right (their character was known to them only at reveal, so this is honest by construction — the app just unhides it).
   - **Group confirm:** other players tap ✓ / ✗ next to that player before the card flips.
7. **End of round.** Show everyone's character, who got it and in what order. Option to start a new round (re-shuffle the ring, everyone picks again).

No typing of guesses. No decoy lists. The social layer carries the guessing; the app carries state + reveal.

---

## The live lookup (this is the key feature — get it right)

**Source: the MediaWiki / Wikipedia API.** No API key, CORS-friendly with `origin=*`, freely-licensed images (no hosting/copyright issue), and near-total coverage of public figures, historical people, and fictional characters.

- **Search:**
  `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={QUERY}&format=json&origin=*`
- **Thumbnail for a page:**
  `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=500&titles={TITLE}&format=json&origin=*`
- Or use the REST summary endpoint for a single confirmed page (gives title, thumbnail, and extract in one call):
  `https://en.wikipedia.org/api/rest_v1/page/summary/{TITLE}`

Flow: picker types → hit search → show top ~5 results with thumbnail + short description so they grab the *right* person → picker taps one → store `{ title, thumbnailUrl }` in the assignment. Verify the exact params against the live API when building; treat the URLs above as the intended approach, not gospel.

**Critical privacy rule:** the picker's confirmation thumbnail, and the stored character, must **never** be sent to or rendered on the assignee's screen. Only the assignee's card is hidden from them; everyone else sees it.

---

## Architecture

**Frontend:** single-page app. React + Vite recommended for clean state management, but a well-structured vanilla build is fine too. Mobile-friendly layout (people will play on phones).

**Real-time backend — this is required; a static host alone can't do it.** Recommended options, in order:

1. **Firebase Realtime Database** — free tier, zero server to run, cross-device sync out of the box, simplest path. Room state lives under `rooms/{roomCode}`.
2. **PartyKit** — purpose-built for exactly this room/lobby realtime pattern; very clean if you want more control.
3. **Supabase Realtime** — if you'd rather work in Postgres with realtime channels.

**Hosting:** Vercel or Netlify (both free, both give you the shareable URL). GitHub Pages works *only* for the static frontend and still needs one of the backends above for state — so Vercel/Netlify is simpler.

### Suggested state shape (Firebase-style)

```
rooms/{roomCode}
  status: "lobby" | "assigning" | "playing" | "reveal"
  hostId: <playerId>
  turnOrder: "free" | "rotating"
  currentTurn: <playerId | null>
  players/{playerId}
    name: <string>
    assignsTo: <playerId>        // who this player picks for
    assignedBy: <playerId>       // who picks for this player
    character: { title, thumbnailUrl } | null   // set by their assigner
    hasGuessed: <bool>
    correct: <bool | null>
    order: <int | null>          // finish order
```

Rendering rule the client enforces: when drawing the board for player P, show `character` for every player *except* P.

---

## Edge cases to handle

- **Assignment ring:** shuffle players into a cycle so each assigns the next and the last wraps to the first. Guarantees no self-assignment and a perfect 1-to-1. Handle the 2-player case (they just assign each other) and reject/handle 1-player rooms.
- **Player disconnects mid-round:** decide whether their card stays, or the round voids. Simplest: keep the card, let others still play.
- **Late joiners:** only allowed in lobby, not mid-round.
- **Duplicate picks:** two pickers landing on the same character is fine and often funny — don't block it.
- **Search returns nothing / ambiguous:** let the picker refine the query; show a "no results, try again" state.
- **Reveal honesty:** because a player never sees their own character until reveal, the "I've got it → flip" is trustworthy without server-side verification. Still store `correct` when they self-report so the end screen is accurate.

## Settings worth exposing

- Turn mode: free-for-all vs. rotating turn highlight.
- Confirm mode: self-reveal vs. group ✓/✗.
- (Optional, later) Themed pool mode: everyone secretly submits 3 characters into a shared pool and assignments draw from the union — nobody knows the whole set.

---

## Build order (suggested for Claude Code)

1. Scaffold: Vite + React + Firebase (or chosen backend), room create/join lobby working, players syncing.
2. Assignment ring logic + the "you're picking for X" screen.
3. Live Wikipedia search + confirm UI.
4. Board rendering with the hide-your-own-card rule.
5. Turn indicator + "I've got it" reveal + end-of-round screen.
6. Polish: settings, disconnect handling, mobile layout, a little reveal flourish.

Start with 1–4 as a vertical slice you can actually test with two browser windows before adding polish.
