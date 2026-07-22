// Player identity is per-tab (sessionStorage) so two browser windows act as
// two different players — which is how the game gets tested locally.
export function getPlayerId() {
  let id = sessionStorage.getItem('namedrop:playerId')
  if (!id) {
    id = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
    sessionStorage.setItem('namedrop:playerId', id)
  }
  return id
}

export function getSavedName() {
  return localStorage.getItem('namedrop:name') ?? ''
}

export function saveName(name) {
  localStorage.setItem('namedrop:name', name)
}
