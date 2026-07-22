export default function SetupNotice() {
  return (
    <main className="shell setup">
      <h1>Namedrop</h1>
      <p>
        <strong>Firebase isn't configured yet.</strong> The game needs a (free)
        Firebase Realtime Database to sync rooms between players.
      </p>
      <ol>
        <li>
          Create a project at{' '}
          <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">
            console.firebase.google.com
          </a>
        </li>
        <li>Add a Realtime Database (start in test mode)</li>
        <li>
          Register a web app (Project settings → Your apps) and copy the config
          values
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in
          the values
        </li>
        <li>Restart the dev server</li>
      </ol>
    </main>
  )
}
