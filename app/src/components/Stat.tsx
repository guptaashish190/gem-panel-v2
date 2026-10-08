export function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="stat">
      <div className={warn ? 'stat-value warn' : 'stat-value'}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
