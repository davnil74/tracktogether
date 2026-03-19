import { useState } from 'react'
import Landing from './components/Landing'
import MapView from './components/MapView'

export default function App() {
  // session = { id, name, expiresAt } or null
  const [session, setSession] = useState(null)

  return session
    ? <MapView session={session} onStop={() => setSession(null)} />
    : <Landing onStart={setSession} />
}
