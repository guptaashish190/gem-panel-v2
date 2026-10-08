import { marked } from 'marked'
import type { CompanyFields, TemplateField, TemplatePlaceholder } from './types.js'

export const PLACEHOLDERS: TemplatePlaceholder[] = [
  { key: 'companyName', label: 'Company name' },
  { key: 'signatory', label: 'Authorized signatory' },
  { key: 'address', label: 'Address' },
  { key: 'drugLicenseNumber', label: 'Drug license number' },
  { key: 'bidNumber', label: 'Bid number' },
  { key: 'bidEnd', label: 'Bid end' },
  { key: 'offerValidity', label: 'Offer validity' },
  { key: 'ministryOrState', label: 'Ministry or state' },
  { key: 'department', label: 'Department' },
  { key: 'beneficiaryName', label: 'Beneficiary name' },
]

const labels = new Map<string, string>([
  ...PLACEHOLDERS.map((item) => [item.key, item.label] as const),
  ['buyerEmail', 'Buyer email'],
  ['hodEmail', 'HOD email'],
  ['evaluationMethod', 'Evaluation method'],
  ['emdAmount', 'EMD amount'],
  ['products', 'Products'],
])

export type TemplateTender = {
  bidNumber: string
  bidEnd: string | null
  offerValidity: string | null
  ministryOrState: string | null
  department: string | null
  buyerEmail: string | null
  hodEmail: string | null
  evaluationMethod: string | null
  beneficiaryName: string | null
  emdAmount: number | null
  products: { name: string; quantity: number | null }[]
}

function tokenPattern(): RegExp {
  return /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g
}

export function templateTokens(body: string): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const match of body.matchAll(tokenPattern())) {
    const key = match[1]
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(tokenPattern(), (raw, key: string) => (Object.hasOwn(values, key) ? values[key] : raw))
}

export function productsLine(products: { name: string; quantity: number | null }[]): string {
  return products
    .map((product) => {
      const name = product.name.trim()
      if (!name) return ''
      if (product.quantity == null) return name
      return `${name} ${product.quantity}`
    })
    .filter(Boolean)
    .join('; ')
}

export function templateValues(company: CompanyFields, tender: TemplateTender): Record<string, string> {
  return {
    companyName: company.name,
    signatory: company.signatory,
    address: company.address,
    drugLicenseNumber: company.drugLicenseNumber,
    bidNumber: tender.bidNumber,
    bidEnd: tender.bidEnd ?? '',
    offerValidity: tender.offerValidity ?? '',
    ministryOrState: tender.ministryOrState ?? '',
    department: tender.department ?? '',
    buyerEmail: tender.buyerEmail ?? '',
    hodEmail: tender.hodEmail ?? '',
    evaluationMethod: tender.evaluationMethod ?? '',
    beneficiaryName: tender.beneficiaryName ?? '',
    emdAmount: tender.emdAmount == null ? '' : String(tender.emdAmount),
    products: productsLine(tender.products),
  }
}

export function templateFields(body: string, values: Record<string, string>): TemplateField[] {
  return templateTokens(body).map((key) => ({
    key,
    label: labels.get(key) ?? key,
    value: values[key] ?? '',
  }))
}

export function renderTemplateDocument(body: string, values: Record<string, string>): string {
  const slots: string[] = []
  const source = body.replace(tokenPattern(), (raw, key: string) => {
    if (!Object.hasOwn(values, key)) return raw
    const id = slots.length
    slots.push(values[key])
    return `\uE000${id}\uE001`
  })
  const html = marked(source, { async: false, gfm: true, breaks: true })
  const filled = html.replace(/\uE000(\d+)\uE001/g, (_raw, index: string) => htmlText(slots[Number(index)] ?? ''))
  return wordDocument(filled.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))
}

function htmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '<br>')
}

function wordDocument(body: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<style>
body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; }
table { border-collapse: collapse; }
th, td { border: 1px solid #000; padding: 4px 8px; vertical-align: top; }
</style>
</head>
<body>
${body}
</body>
</html>`
}
