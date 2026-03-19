import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

// ── Color helpers ────────────────────────────────────────────────────────────

function nameToColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`
}

// ── Time / distance formatters ───────────────────────────────────────────────

function timeRemaining(expiresAt) {
  const diff = new Date(expiresAt) - Date.now()
  if (diff <= 0) return 'expired'
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'less than a minute'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function timeAgo(ts) {
  if (!ts) return 'unknown'
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h === 1 ? '1 hour ago' : `${h} hours ago`
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDist(m) {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

function formatETA(secs) {
  if (secs < 60) return `~${Math.round(secs)}s`
  if (secs < 3600) return `~${Math.round(secs / 60)} min`
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

// ── Movement math ────────────────────────────────────────────────────────────

/**
 * Returns velocity {vx, vy} in m/s (east, north) from a position history array.
 * Needs at least 2 points separated by ≥ 2 s.
 */
function computeVelocity(history) {
  if (!history || history.length < 2) return null
  const p1 = history[history.length - 2]
  const p2 = history[history.length - 1]
  const dt = (p2.ts - p1.ts) / 1000
  if (dt < 2) return null
  const latMid = (p1.lat + p2.lat) / 2
  const mPerLng = Math.cos(latMid * Math.PI / 180) * 111_320
  return {
    vx: (p2.lng - p1.lng) * mPerLng / dt,   // east  m/s
    vy: (p2.lat - p1.lat) * 111_320    / dt, // north m/s
  }
}

/**
 * Given own and other positions (as [lat, lng]) and velocities ({vx, vy} m/s),
 * returns:
 *   dist        – current distance in metres
 *   approaching – true | false | null (null = no velocity data yet)
 *   etaSecs     – seconds to closest approach (if approaching)
 *   closingSpeed – m/s closing in (if approaching)
 *   divergeSpeed – m/s moving apart (if not approaching)
 */
function computeETA(ownPos, ownVel, otherPos, otherVel) {
  const latMid = (ownPos[0] + otherPos[0]) / 2
  const mPerLng = Math.cos(latMid * Math.PI / 180) * 111_320

  // Vector from own → other (metres)
  const dx = (otherPos[1] - ownPos[1]) * mPerLng
  const dy = (otherPos[0] - ownPos[0]) * 111_320
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (!ownVel || !otherVel) return { dist, approaching: null }

  // Relative velocity: other relative to own
  const vrx = otherVel.vx - ownVel.vx
  const vry = otherVel.vy - ownVel.vy

  // Closing speed = –d(dist)/dt = –D̂ · Vrel
  const closingSpeed = dist > 0.5
    ? -(dx / dist * vrx + dy / dist * vry)
    : 0

  if (closingSpeed < 0.1) {
    return { dist, approaching: false, divergeSpeed: Math.max(0, -closingSpeed) }
  }

  // Time of closest approach using full quadratic solution
  const vRelSq = vrx * vrx + vry * vry
  const tClosest = vRelSq > 0 ? -(dx * vrx + dy * vry) / vRelSq : dist / closingSpeed

  return { dist, approaching: true, etaSecs: Math.max(0, tClosest), closingSpeed }
}

// ── Popup sub-components ─────────────────────────────────────────────────────

function PopupRow({ label, value, sub, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
      <span style={{
        fontSize: 9, color: '#6b7280', textTransform: 'uppercase',
        letterSpacing: '0.06em', fontWeight: 700, paddingTop: 2, minWidth: 54,
      }}>
        {label}
      </span>
      <div>
        <span style={{ fontSize: 12, color: color ?? '#d1d5db' }}>{value}</span>
        {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

/** Refreshes every 10 s while the popup is open so ETA stays current. */
function ETASection({ ownPos, ownHistory, otherPos, userHistory }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  if (!ownPos) return null

  const ownVel   = computeVelocity(ownHistory)
  const otherVel = computeVelocity(userHistory)
  const { dist, approaching, etaSecs, closingSpeed, divergeSpeed } =
    computeETA(ownPos, ownVel, otherPos, otherVel)

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #374151' }}>
      <PopupRow label="Distance" value={formatDist(dist)} />

      {approaching === null && (
        <PopupRow label="ETA" value="collecting data…" color="#6b7280" />
      )}

      {approaching === true && (
        <PopupRow
          label="ETA"
          value={etaSecs > 14_400 ? '> 4 h' : formatETA(etaSecs)}
          color="#34d399"
          sub={`closing at ${(closingSpeed * 3.6).toFixed(1)} km/h`}
        />
      )}

      {approaching === false && (
        <PopupRow
          label="ETA"
          value="moving apart"
          color="#f87171"
          sub={divergeSpeed > 0.1 ? `${(divergeSpeed * 3.6).toFixed(1)} km/h away` : undefined}
        />
      )}
    </div>
  )
}

/** Re-renders every 30 s so "X min ago" text stays fresh. */
function LiveAgo({ updatedAt }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  return <span>{formatTime(updatedAt)} &middot; {timeAgo(updatedAt)}</span>
}

// ── Main component ───────────────────────────────────────────────────────────

export default function UserMarker({
  position, name, isOwn, expiresAt, updatedAt,
  // Only passed for non-own markers:
  ownPos, ownHistory, userHistory, onMarkerReady, onPopupOpen, onPopupClose,
}) {
  const color     = isOwn ? '#3b82f6' : nameToColor(name)
  const initial   = name.charAt(0).toUpperCase()
  const markerRef = useRef(null)

  useEffect(() => {
    if (onMarkerReady && markerRef.current) onMarkerReady(markerRef.current)
  }, []) // runs once on mount; ref is populated by then

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
      html: `<div class="user-marker" style="background:${color};">${initial}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -20],
    })
  }, [color, initial, isOwn])

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      eventHandlers={{ popupopen: onPopupOpen, popupclose: onPopupClose }}
    >
      <Popup>
        <div style={{ minWidth: 160 }}>

          {/* Name */}
          <div style={{ fontWeight: 700, fontSize: 14, color: '#f9fafb', marginBottom: 8 }}>
            {isOwn ? `${name} (you)` : name}
          </div>

          {/* Last seen */}
          <PopupRow
            label="Last seen"
            value={<LiveAgo updatedAt={updatedAt} />}
          />

          {/* Expires */}
          <PopupRow
            label="Expires"
            value={`${timeRemaining(expiresAt)} remaining`}
          />

          {/* ETA — only for other users */}
          {!isOwn && (
            <ETASection
              ownPos={ownPos}
              ownHistory={ownHistory}
              otherPos={position}
              userHistory={userHistory}
            />
          )}
        </div>
      </Popup>
    </Marker>
  )
}
