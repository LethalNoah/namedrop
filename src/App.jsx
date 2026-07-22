import { useEffect, useState } from 'react'
import { isFirebaseConfigured } from './firebase'
import { getPlayerId } from './identity'
import { subscribeRoom, attachPresence } from './lib/room'
import Home from './components/Home'
import Lobby from './components/Lobby'
import AssignScreen from './components/AssignScreen'
import Board from './components/Board'
import RevealScreen from './components/RevealScreen'
import SetupNotice from './components/SetupNotice'

const playerId = getPlayerId()

function codeFromUrl() {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
}

export default function App() {
  const [joinedCode, setJoinedCode] = useState(null)
  const [room, setRoom] = useState(undefined) // undefined = loading, null = gone

  useEffect(() => {
    if (!joinedCode) return
    const unsubscribe = subscribeRoom(joinedCode, setRoom)
    const detachPresence = attachPresence(joinedCode, playerId)
    return () => {
      detachPresence()
      unsubscribe()
      setRoom(undefined)
    }
  }, [joinedCode])

  function handleJoined(code) {
    setJoinedCode(code)
    const url = new URL(window.location.href)
    url.searchParams.set('room', code)
    window.history.replaceState(null, '', url)
  }

  function handleLeft() {
    setJoinedCode(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState(null, '', url)
  }

  if (!isFirebaseConfigured) return <SetupNotice />

  if (!joinedCode) {
    return <Home playerId={playerId} initialCode={codeFromUrl()} onJoined={handleJoined} />
  }

  if (room === undefined) {
    return <main className="shell"><p className="muted">Connecting…</p></main>
  }

  if (room === null) {
    return (
      <main className="shell">
        <p>This room no longer exists.</p>
        <button onClick={handleLeft}>Back to home</button>
      </main>
    )
  }

  if (room.status === 'lobby') {
    return (
      <Lobby
        room={room}
        roomCode={joinedCode}
        playerId={playerId}
        onLeft={handleLeft}
      />
    )
  }

  if (room.status === 'assigning') {
    return <AssignScreen room={room} roomCode={joinedCode} playerId={playerId} />
  }

  if (room.status === 'playing') {
    return <Board room={room} roomCode={joinedCode} playerId={playerId} />
  }

  return <RevealScreen room={room} roomCode={joinedCode} playerId={playerId} />
}
