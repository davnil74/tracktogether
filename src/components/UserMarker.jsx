import { useMemo } from 'react'
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

/** Human-readable time remaining */
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

export default function UserMarker({ position, name, isOwn, expiresAt }) {
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
        <div style={{ minWidth: 120 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#f9fafb', marginBottom: 4 }}>
            {isOwn ? `${name} (you)` : name}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            {isOwn
              ? `Sharing for ${timeRemaining(expiresAt)} more`
              : `Sharing for ${timeRemaining(expiresAt)} more`}
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
