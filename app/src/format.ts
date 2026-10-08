import type { Summary } from './panel'

export function money(amount: number | null): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function buyer(row: Summary): string {
  const parts = [row.ministryOrState, row.department].filter((part) => part)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export function mseValue(row: Pick<Summary, 'mse'>): string {
  if (row.mse === true) return 'Yes'
  if (row.mse === false) return 'No'
  return '—'
}

export function emdLabel(row: Pick<Summary, 'emdRequired' | 'emdAmount'>): string {
  if (row.emdRequired === false) return 'Not required'
  if (row.emdAmount != null) return money(row.emdAmount)
  if (row.emdRequired === true) return 'Required'
  return '—'
}

export function ministryValue(row: Summary): string {
  return row.ministryOrState?.trim() || '—'
}

export function evaluationValue(row: Summary): string {
  const method = row.evaluationMethod?.toLowerCase() ?? ''
  if (method.includes('item')) return 'Item wise'
  if (method.includes('total')) return 'Total Value wise'
  return row.evaluationMethod?.trim() || '—'
}

export function listedOptions(rows: Summary[], value: (row: Summary) => string): string[] {
  return [...new Set(rows.map(value))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
  )
}

export type Picks = {
  ministry: string[] | null
  evaluation: string[] | null
  mse: string[] | null
  emd: string[] | null
}

function allows(selected: string[] | null, value: string | null): boolean {
  if (selected == null) return true
  return value != null && selected.includes(value)
}

export function matchesFilters(row: Summary, picks: Picks): boolean {
  return (
    allows(picks.ministry, ministryValue(row)) &&
    allows(picks.evaluation, evaluationValue(row)) &&
    allows(picks.mse, mseValue(row)) &&
    allows(picks.emd, emdLabel(row))
  )
}

export function matchesProduct(row: Summary, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return row.productNames.some((name) => name.toLowerCase().includes(needle))
}

export function matchesBid(row: Summary, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return row.bidNumber.toLowerCase().includes(needle)
}
