export const TENDER_STATUSES = [
  'Documentation',
  'Bid Participated',
  'Technically Qualified',
  'Tender Completed',
] as const

export type TenderStatus = (typeof TENDER_STATUSES)[number]

export function statusTone(status: TenderStatus): string {
  if (status === 'Documentation') return 'documentation'
  if (status === 'Bid Participated') return 'participated'
  if (status === 'Technically Qualified') return 'qualified'
  return 'completed'
}
