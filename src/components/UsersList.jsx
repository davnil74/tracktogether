/** Bottom-sheet listing all active users, sorted by distance. */

function nameToColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`
}

function distMetres(pos1, pos2) {
  if (!pos1 || !pos2) return null
  const latMid = (pos1[0] + pos2[0]) / 2
  const mPerLng = Math.cos(latMid * Math.PI / 180) * 111_320
  const dx = (pos2[1] - pos1[1]) * mPerLng
  const dy = (pos2[0] - pos1[0]) * 111_320
  return Math.sqrt(dx * dx + dy * dy)
}

function formatDist(m) {
  if (m == null) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

function timeAgo(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h === 1 ? '1 hr ago' : `${h} hrs ago`
}

export default function UsersList({ users, ownPos, onSelect, onClose }) {
  const sorted = [...users]
    .map(u => ({ ...u, dist: distMetres(ownPos, [u.lat, u.lng]) }))
    .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity))

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-[1002] bg-black/50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[1003] bg-gray-900 rounded-t-2xl border-t border-gray-800 shadow-2xl flex flex-col"
        style={{
          maxHeight: '70vh',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <h2 className="text-white font-bold text-base">
            People sharing
            <span className="ml-2 text-gray-500 font-normal text-sm">{users.length}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 -mr-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-800 shrink-0" />

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {sorted.length === 0 ? (
            <div className="text-center text-gray-600 text-sm py-12">
              No other users are sharing right now.
            </div>
          ) : (
            sorted.map(user => {
              const color = nameToColor(user.name)
              return (
                <button
                  key={user.id}
                  onClick={() => { onSelect(user); onClose() }}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/70 active:bg-gray-800 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm border-2 border-white/10"
                    style={{ background: color }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-sm truncate">{user.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      Last seen {timeAgo(user.updated_at)}
                    </div>
                  </div>

                  {/* Distance + chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-400 text-sm font-medium">
                      {formatDist(user.dist)}
                    </span>
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
