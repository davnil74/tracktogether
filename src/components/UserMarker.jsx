import { useEffect, useMemo, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

/** Deterministic hue from a string */
function nameToColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

/** Human-readable time remaining until expiry */
function timeRemaining(expiresAt) {
  const diff = new Date(expiresAt) - Date.now()
  if (diff <= 0) return 'expired'
  const totalMins = Math.floor(diff / 60000)
  if (totalMins < 1) return 'less than a minute'
  if (totalMins < 60) return `${totalMins} min`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Human-readable elapsed time since a timestamp */
function timeAgo(ts) {
  if (!ts) return 'unknown'
  const secs = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (secs < 10)  return 'just now'
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`
}

/** Absolute time formatted as HH:MM */
function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Re-renders every 30 s so relative times stay fresh while popup is open */
function LiveAgo({ updatedAt }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  return (
    <span>
      {formatTime(updatedAt)} &middot; {timeAgo(updatedAt)}
    </span>
  )
}

export default function UserMarker({ position, name, isOwn, expiresAt, updatedAt }) {
  const color = isOwn ? '#3b82f6' : nameToColor(name)
  const initial = name.charAt(0).toUpperCase()

  const icon = useMemo(() => {
    if (isOwn) {
      return L.divIcon({
        className: '',
        html: `
          <div class="own-marker-container">
            <div class="own-marker-ring"></div>
            <div class="own-marker-ring"></div>
            <div class="own-marker-dot"></div>
          </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -24],
      })
    }
    return L.divIcon({
      className: '',
      html: `
        <div class="user-marker" style="background:${color};">
          ${initial}
        </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -20],
    })
  }, [color, initial, isOwn])

  return (
    <Marker position={position} icon={icon}>
      <Popup>
        <div style={{ minWidth: 148 }}>
          {/* Name */}
          <div style={{ fontWeight: 700, fontSize: 14, color: '#f9fafb', marginBottom: 6 }}>
            {isOwn ? `${name} (you)` : name}
          </div>

          {/* Last seen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Last seen
            </span>
            <span style={{ fontSize: 12, color: '#d1d5db' }}>
              <LiveAgo updatedAt={updatedAt} />
            </span>
          </div>

          {/* Expires */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Expires
            </span>
            <span style={{ fontSize: 12, color: '#d1d5db' }}>
              {timeRemaining(expiresAt)} remaining
            </span>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
