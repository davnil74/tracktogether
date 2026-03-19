import { useEffect, useRef, useState } from 'react'
import { MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import { supabase } from '../supabase'
import UserMarker from './UserMarker'
import UsersList from './UsersList'

const UPDATE_INTERVAL_MS = 10_000
const HISTORY_SIZE = 3
const TOAST_DURATION_MS = 4_000
const MOCK_UPDATE_MS = 2_000

// Mock users: angle from north (deg), starting distance (km), approach speed (km/h)
const MOCK_CONFIGS = [
  { id: 'mock-0', name: 'Alice',   angleDeg: 45,  distKm: 1.2, speedKmh: 18 },
  { id: 'mock-1', name: 'Bob',     angleDeg: 200, distKm: 0.7, speedKmh: 6  },
  { id: 'mock-2', name: 'Charlie', angleDeg: 300, distKm: 2.1, speedKmh: 28 },
]

function buildMockUsers(ownPos) {
  const now = Date.now()
  const expires = new Date(now + 4 * 3600_000).toISOString()
  const cosLat = Math.cos(ownPos[0] * Math.PI / 180)

  return MOCK_CONFIGS.map(({ id, name, angleDeg, distKm, speedKmh }) => {
    const angle = angleDeg * Math.PI / 180
    const distM = distKm * 1000
    // Offset from ownPos in degrees
    const latOff = Math.cos(angle) * distM / 111_320
    const lngOff = Math.sin(angle) * distM / (111_320 * cosLat)
    const lat = ownPos[0] + latOff
    const lng = ownPos[1] + lngOff
    // Velocity toward ownPos in deg/s
    const speedMs = speedKmh / 3.6
    const vLat = -latOff * speedMs / distM
    const vLng = -lngOff * speedMs / distM
    // Pre-seed two history points so ETA is visible immediately
    return {
      id, name, lat, lng,
      expires_at: expires,
      updated_at: new Date().toISOString(),
      isMock: true, vLat, vLng,
      history: [
        { lat: lat - vLat * MOCK_UPDATE_MS / 1000, lng: lng - vLng * MOCK_UPDATE_MS / 1000, ts: now - MOCK_UPDATE_MS },
        { lat, lng, ts: now },
      ],
    }
  })
}

/** Re-centers the map on first GPS fix only */
function MapFlyTo({ position }) {
  const map = useMap()
  const settled = useRef(false)

  useEffect(() => {
    if (position && !settled.current) {
      map.setView(position, 15, { animate: true })
      settled.current = true
    }
  }, [position, map])

  return null
}

/** Exposes the Leaflet map instance via a ref */
function MapRefCapture({ mapRef }) {
  mapRef.current = useMap()
  return null
}

/** Stacked join/leave toasts rendered above the map */
function Toasts({ toasts, onToastClick }) {
  if (!toasts.length) return null
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-[1001] flex flex-col items-center gap-2"
      style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 56px)' }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => onToastClick(t)}
          className="flex items-center gap-2 bg-gray-900/95 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-xl backdrop-blur-md animate-toast cursor-pointer hover:bg-gray-800/95 active:scale-95 transition-transform select-none"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
          {t.message}
          <span className="text-gray-500 text-xs ml-1">Tap to view</span>
        </div>
      ))}
    </div>
  )
}

export default function MapView({ session, onStop }) {
  const { id: ownId, name: ownName, expiresAt: ownExpiresAt } = session

  const [others, setOthers] = useState({})
  const [ownPos, setOwnPos] = useState(null)
  const [ownHistory, setOwnHistory] = useState([])
  const [ownUpdatedAt, setOwnUpdatedAt] = useState(new Date().toISOString())
  const [activeUserId, setActiveUserId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [showUsersList, setShowUsersList] = useState(false)
  const [mockActive, setMockActive] = useState(false)
  const ownPosRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({}) // userId → Leaflet marker instance
  // Track which IDs were present at mount so we don't toast for them
  const initialIdsRef = useRef(null)

  useEffect(() => { ownPosRef.current = ownPos }, [ownPos])

  const addToast = (message, color, userPos, userId) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, color, userPos, userId }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION_MS)
  }

  // ── 5. Mock user movement ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mockActive) return
    const id = setInterval(() => {
      setOthers(prev => {
        const next = { ...prev }
        MOCK_CONFIGS.forEach(({ id: mid }) => {
          const u = next[mid]
          if (!u) return
          const dt = MOCK_UPDATE_MS / 1000
          const lat = u.lat + u.vLat * dt
          const lng = u.lng + u.vLng * dt
          next[mid] = {
            ...u, lat, lng,
            updated_at: new Date().toISOString(),
            history: [...u.history.slice(-(HISTORY_SIZE - 1)), { lat, lng, ts: Date.now() }],
          }
        })
        return next
      })
    }, MOCK_UPDATE_MS)
    return () => clearInterval(id)
  }, [mockActive])

  // ── Toggle mock demo users ────────────────────────────────────────────────
  const toggleMock = () => {
    if (!ownPos) return
    if (mockActive) {
      setMockActive(false)
      setOthers(prev => {
        const next = { ...prev }
        MOCK_CONFIGS.forEach(({ id }) => delete next[id])
        return next
      })
      if (MOCK_CONFIGS.some(c => c.id === activeUserId)) setActiveUserId(null)
    } else {
      const mocks = buildMockUsers(ownPos)
      setOthers(prev => {
        const next = { ...prev }
        mocks.forEach(u => { next[u.id] = u })
        return next
      })
      setMockActive(true)
    }
  }

  // ── Remove a user (long-press) ────────────────────────────────────────────
  const handleRemoveUser = async (user) => {
    if (user.isMock) {
      setOthers(prev => { const n = { ...prev }; delete n[user.id]; return n })
      if (activeUserId === user.id) setActiveUserId(null)
    } else {
      await supabase.from('locations').delete().eq('id', user.id)
    }
  }

  const selectUser = (userId, userPos) => {
    const map = mapRef.current
    const own = ownPosRef.current
    if (!map || !userPos) return
    const bounds = own ? [own, userPos] : [userPos, userPos]
    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 16, animate: true })
    setActiveUserId(userId)
    setTimeout(() => markersRef.current[userId]?.openPopup(), 350)
  }

  const handleToastClick = (toast) => {
    selectUser(toast.userId, toast.userPos)
  }

  // ── 1. Fetch current users on mount ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .gt('expires_at', new Date().toISOString())

      if (error) { console.error('fetch error', error); return }

      const map = {}
      for (const row of data) {
        if (row.id !== ownId) {
          map[row.id] = { ...row, history: [{ lat: row.lat, lng: row.lng, ts: Date.now() }] }
        }
      }
      initialIdsRef.current = new Set(Object.keys(map))
      setOthers(map)
    }
    load()
  }, [ownId])

  // ── 2. Realtime subscription ─────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('locations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'locations' },
        ({ eventType, new: newRow, old: oldRow }) => {
          if (eventType === 'DELETE') {
            setOthers(prev => {
              if (!prev[oldRow.id]) return prev
              const u = prev[oldRow.id]
              addToast(`${u.name} stopped sharing`, '#f87171', [u.lat, u.lng], u.id)
              const next = { ...prev }
              delete next[oldRow.id]
              return next
            })
            return
          }

          if (newRow.id === ownId) return
          if (new Date(newRow.expires_at) <= new Date()) return

          setOthers(prev => {
            const isNew = !prev[newRow.id]
            if (isNew && initialIdsRef.current !== null && !initialIdsRef.current.has(newRow.id)) {
              addToast(`${newRow.name} joined`, '#34d399', [newRow.lat, newRow.lng], newRow.id)
            }
            const prevHistory = prev[newRow.id]?.history ?? []
            const history = [
              ...prevHistory.slice(-(HISTORY_SIZE - 1)),
              { lat: newRow.lat, lng: newRow.lng, ts: Date.now() },
            ]
            return { ...prev, [newRow.id]: { ...newRow, history } }
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ownId])

  // ── 3. GPS watch ─────────────────────────────────────────────────────────
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords
        setOwnPos([lat, lng])
        setOwnHistory(prev => [
          ...prev.slice(-(HISTORY_SIZE - 1)),
          { lat, lng, ts: Date.now() },
        ])
      },
      err => console.error('GPS error', err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // ── 4. Periodic position update to Supabase ──────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const pos = ownPosRef.current
      if (!pos) return
      const updatedAt = new Date().toISOString()
      await supabase
        .from('locations')
        .update({ lat: pos[0], lng: pos[1], updated_at: updatedAt })
        .eq('id', ownId)
      setOwnUpdatedAt(updatedAt)
    }, UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [ownId])

  // ── Stop sharing ──────────────────────────────────────────────────────────
  const handleStop = async () => {
    await supabase.from('locations').delete().eq('id', ownId)
    onStop()
  }

  const now = Date.now()
  const visibleOthers = Object.values(others).filter(
    u => new Date(u.expires_at).getTime() > now
  )
  const onlineCount = visibleOthers.length + 1

  return (
    <div className="relative w-full h-screen">

      {/* ── Top bar ── */}
      <div
        className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 bg-gray-900/90 backdrop-blur-md border-b border-gray-800"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 12 }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-white font-bold text-lg tracking-tight cursor-default select-none"
            onClick={toggleMock}
          >TrackTogether</span>
          <button
            onClick={() => setShowUsersList(true)}
            className="flex items-center gap-1.5 bg-green-500/15 hover:bg-green-500/25 active:bg-green-500/30 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-500/25 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            {onlineCount} online
          </button>
        </div>

        <button
          onClick={handleStop}
          className="flex items-center gap-1.5 bg-red-500/15 hover:bg-red-500/30 active:bg-red-500/40 text-red-400 border border-red-500/25 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <rect x="4" y="4" width="12" height="12" rx="2" />
          </svg>
          Stop sharing
        </button>
      </div>

      {/* ── Join / leave toasts ── */}
      <Toasts toasts={toasts} onToastClick={handleToastClick} />

      {/* ── Users list sheet ── */}
      {showUsersList && (
        <UsersList
          users={visibleOthers}
          ownPos={ownPos}
          onSelect={user => selectUser(user.id, [user.lat, user.lng])}
          onClose={() => setShowUsersList(false)}
        />
      )}

      {/* ── Map ── */}
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="w-full h-full"
        zoomControl={false}
      >
        <MapRefCapture mapRef={mapRef} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
          detectRetina
        />

        {ownPos && (
          <>
            <MapFlyTo position={ownPos} />
            <UserMarker
              position={ownPos}
              name={ownName}
              isOwn
              expiresAt={ownExpiresAt}
              updatedAt={ownUpdatedAt}
            />
          </>
        )}

        {ownPos && activeUserId && others[activeUserId] && (
          <Polyline
            positions={[ownPos, [others[activeUserId].lat, others[activeUserId].lng]]}
            pathOptions={{ color: '#60a5fa', weight: 2, dashArray: '8 5', opacity: 0.8 }}
          />
        )}

        {visibleOthers.map(user => (
          <UserMarker
            key={user.id}
            position={[user.lat, user.lng]}
            name={user.name}
            isOwn={false}
            expiresAt={user.expires_at}
            updatedAt={user.updated_at}
            userHistory={user.history}
            ownPos={ownPos}
            ownHistory={ownHistory}
            onMarkerReady={m => { markersRef.current[user.id] = m }}
            onPopupOpen={() => setActiveUserId(user.id)}
            onPopupClose={() => setActiveUserId(null)}
            onRemove={() => handleRemoveUser(user)}
          />
        ))}
      </MapContainer>
    </div>
  )
}
