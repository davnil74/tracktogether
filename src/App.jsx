import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Landing from './components/Landing'
import MapView from './components/MapView'

const SESSION_KEY = 'tracktogether_session'

export default function App() {
  // null = not yet determined, {} = no session, {...} = active session
  const [session, setSession] = useState(null)

  // On mount: restore a stored session if it still exists and hasn't expired
  useEffect(() => {
    const restore = async () => {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        try {
          const stored = JSON.parse(raw)
          // 1. Check client-side expiry first (fast, no network)
          if (new Date(stored.expiresAt) > new Date()) {
            // 2. Verify the row still exists in Supabase (could have been deleted)
            const { data } = await supabase
              .from('locations')
              .select('id')
              .eq('id', stored.id)
              .maybeSingle()

            if (data) {
              setSession(stored)
              return
            }
          }
        } catch { /* corrupt storage — fall through */ }
        localStorage.removeItem(SESSION_KEY)
      }
      setSession(false) // no valid session
    }
    restore()
  }, [])

  const handleStart = (newSession) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession))
    setSession(newSession)
  }

  const handleStop = () => {
    localStorage.removeItem(SESSION_KEY)
    setSession(false)
  }

  // Still verifying stored session — show blank dark screen to avoid flash
  if (session === null) {
    return <div style={{ background: '#030712', height: '100vh' }} />
  }

  return session
    ? <MapView session={session} onStop={handleStop} />
    : <Landing onStart={handleStart} />
}
