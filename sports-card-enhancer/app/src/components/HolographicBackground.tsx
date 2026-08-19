export function HolographicBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,255,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,0,255,0.12),transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(2,6,23,0.88))]" />
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle,rgba(34,211,238,0.18),transparent_60%)] blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />
    </div>
  )
}
