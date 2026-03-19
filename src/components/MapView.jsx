import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import { supabase } from '../supabase'
import UserMarker from './UserMarker'

const UPDATE_INTERVAL_MS = 10_000

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

export default function MapView({ session, onStop }) {
  const { id: ownId, name: ownName, expiresAt: ownExpiresAt } = session

  // Map of id → location row for all *other* users
  const [others, setOthers] = useState({})
  const [ownPos, setOwnPos] = useState(null)
  const ownPosRef = useRef(null)

  // Keep ref in sync so the interval closure always reads the latest position
  useEffect(() => { ownPosRef.current = ownPos }, [ownPos])

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
        if (row.id !== ownId) map[row.id] = row
      }
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
              const next = { ...prev }
              delete next[oldRow.id]
              return next
            })
            return
          }

          // INSERT or UPDATE — skip own row and expired rows
          if (newRow.id === ownId) return
          if (new Date(newRow.expires_at) <= new Date()) return

          setOthers(prev => ({ ...prev, [newRow.id]: newRow }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ownId])

  // ── 3. GPS watch ─────────────────────────────────────────────────────────
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => setOwnPos([coords.latitude, coords.longitude]),
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
      await supabase
        .from('locations')
        .update({ lat: pos[0], lng: pos[1], updated_at: new Date().toISOString() })
        .eq('id', ownId)
    }, UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [ownId])

  // ── Stop sharing ──────────────────────────────────────────────────────────
  const handleStop = async () => {
    await supabase.from('locations').delete().eq('id', ownId)
    onStop()
  }

  // Filter out locally-stale entries (edge case: realtime missed a delete)
  const now = Date.now()
  const visibleOthers = Object.values(others).filter(
    u => new Date(u.expires_at).getTime() > now
  )
  const onlineCount = visibleOthers.length + 1 // +1 for self

  return (
    <div className="relative w-full h-screen">

      {/* ── Top bar ── */}
      <div
        className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 bg-gray-900/90 backdrop-blur-md border-b border-gray-800"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 12 }}
      >
        {/* Left: app name + counter */}
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg tracking-tight">TrackTogether</span>
          <span className="flex items-center gap-1.5 bg-green-500/15 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            {onlineCount} online
          </span>
        </div>

        {/* Right: stop button */}
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

      {/* ── Map ── */}
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
          detectRetina
        />

        <ZoomControl position="bottomright" />

        {ownPos && (
          <>
            <MapFlyTo position={ownPos} />
            <UserMarker
              position={ownPos}
              name={ownName}
              isOwn
              expiresAt={ownExpiresAt}
            />
          </>
        )}

        {visibleOthers.map(user => (
          <UserMarker
            key={user.id}
            position={[user.lat, user.lng]}
            name={user.name}
            isOwn={false}
            expiresAt={user.expires_at}
          />
        ))}
      </MapContainer>
    </div>
  )
}
