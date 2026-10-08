import type { TenderStatus } from '../panel'
import { statusTone } from '../status'

export function StatusMark({ status }: { status: TenderStatus | null }) {
  if (!status) return '—'
  return <span className={`status-pill ${statusTone(status)}`}>{status}</span>
}
