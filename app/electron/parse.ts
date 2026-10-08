import { GEM_PDF_NAME, type ParsedTender, type ProductRow } from './types.js'

type ScalarKey =
  | 'bidEnd'
  | 'offerValidity'
  | 'ministryOrState'
  | 'department'
  | 'buyerEmail'
  | 'hodEmail'
  | 'evaluationMethod'
  | 'typeOfBid'
  | 'bidToRa'
  | 'raQualificationRule'
  | 'payment'
  | 'shown'
  | 'documents'
  | 'mse'
  | 'mii'
  | 'emdDetail'
  | 'emdAmount'
  | 'epbgDetail'
  | 'epbgPercentage'
  | 'epbgMonths'
  | 'beneficiaryName'

const LABELS: { label: string; key: ScalarKey }[] = [
  { label: 'bid end date/time', key: 'bidEnd' },
  { label: 'bid offer validity (from end date)', key: 'offerValidity' },
  { label: 'offer validity', key: 'offerValidity' },
  { label: 'ministry/state name', key: 'ministryOrState' },
  { label: 'ministry or state', key: 'ministryOrState' },
  { label: 'department name', key: 'department' },
  { label: 'buyer email id', key: 'buyerEmail' },
  { label: 'buyer email', key: 'buyerEmail' },
  { label: 'hod email', key: 'hodEmail' },
  { label: 'evaluation method', key: 'evaluationMethod' },
  { label: 'type of bid', key: 'typeOfBid' },
  { label: 'bid to ra enabled', key: 'bidToRa' },
  { label: 'bid to ra', key: 'bidToRa' },
  { label: 'ra qualification rule', key: 'raQualificationRule' },
  { label: 'payment timelines', key: 'payment' },
  { label: 'payment timeline', key: 'payment' },
  { label: 'whether documents uploaded by bidders are shown to other bidders', key: 'shown' },
  { label: 'show documents to other bidders', key: 'shown' },
  { label: 'documents required from seller', key: 'documents' },
  { label: 'document required from seller', key: 'documents' },
  { label: 'document required', key: 'documents' },
  { label: 'mse purchase preference', key: 'mse' },
  { label: 'mii purchase preference', key: 'mii' },
  { label: 'emd amount', key: 'emdAmount' },
  { label: 'emd detail', key: 'emdDetail' },
  { label: 'duration of epbg required (months)', key: 'epbgMonths' },
  { label: 'epbg percentage(%)', key: 'epbgPercentage' },
  { label: 'epbg percentage', key: 'epbgPercentage' },
  { label: 'epbg detail', key: 'epbgDetail' },
  { label: 'beneficiary name', key: 'beneficiaryName' },
  { label: 'name of the beneficiary', key: 'beneficiaryName' },
  { label: 'name of beneficiary', key: 'beneficiaryName' },
]

const ORDERED = [...LABELS].sort((a, b) => b.label.length - a.label.length)

const STOP =
  /^(product name|name of the product|schedule\b|item code|consignee quantity|total quantity)\b/i

function matchLabel(line: string): { key: ScalarKey; rest: string } | null {
  const lower = line.toLowerCase()
  for (const { label, key } of ORDERED) {
    const at = lower.indexOf(label)
    if (at < 0) continue
    const rest = line.slice(at + label.length).replace(/^[\s:–\-/]+/, '').trim()
    return { key, rest }
  }
  return null
}

function yesNo(value: string | null): boolean | null {
  if (!value) return null
  if (/^\s*yes\b/i.test(value)) return true
  if (/^\s*no\b/i.test(value)) return false
  if (/not required/i.test(value)) return false
  if (/^\s*required\b/i.test(value)) return true
  return null
}

function firstNumber(value: string | null): number | null {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : null
}

function fieldIn(body: string, labels: string[]): string | null {
  const lines = body.split('\n')
  const sorted = [...labels].sort((a, b) => b.length - a.length)
  for (const line of lines) {
    const lower = line.toLowerCase().trim()
    if (lower.startsWith('total quantity')) continue
    for (const label of sorted) {
      const at = lower.indexOf(label)
      if (at < 0) continue
      const rest = line.trim().slice(at + label.length).replace(/^[\s:–\-/]+/, '').trim()
      if (rest) return rest.split(/\s{2,}/)[0]?.trim() || rest
    }
  }
  return null
}

function parseItemWise(text: string): ProductRow[] {
  const marks = [...text.matchAll(/\bSchedule\s+(\d+)\b/gi)]
  const rows: ProductRow[] = []
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].index ?? 0
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length
    const body = text.slice(start, end)
    const name = fieldIn(body, ['item code'])
    if (!name) continue
    const quantityText = fieldIn(body, ['quantity'])
    const delivery = fieldIn(body, ['delivery period', 'delivery days', 'delivery day'])
    rows.push({
      name,
      quantity: firstNumber(quantityText),
      deliveryPeriod: delivery,
      scheduleNumber: Number(marks[i][1]),
    })
  }
  return rows
}

function parseTotalValue(text: string): ProductRow[] {
  const marks = [...text.matchAll(/(?:^|\n|\/)\s*(?:Product Name|Name of the Product)\s*[:\-]?\s*/gi)]
  const rows: ProductRow[] = []
  for (let i = 0; i < marks.length; i += 1) {
    const nameStart = (marks[i].index ?? 0) + marks[i][0].length
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length
    const body = text.slice(nameStart, end)
    const name = body.split('\n')[0]?.trim().split(/\s{2,}/)[0]?.trim() ?? ''
    if (!name) continue
    const quantities = [...body.matchAll(/consignee quantity\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/gi)].map((match) =>
      Number(match[1].replace(/,/g, '')),
    )
    const delivery = fieldIn(body, ['delivery period', 'delivery days', 'delivery day'])
    rows.push({
      name,
      quantity: quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null,
      deliveryPeriod: delivery,
      scheduleNumber: null,
    })
  }
  return rows
}

function isSpecHeading(line: string): boolean {
  const lower = line.toLowerCase()
  const at = lower.lastIndexOf('technical specifications')
  if (at < 0) return false
  if (line.slice(at + 'technical specifications'.length).trim().length > 0) return false
  return line.slice(0, at).replace(/[^A-Za-z]/g, '').length <= 6
}

function looksLikeProductName(line: string): boolean {
  const text = line.trim()
  if (text.length < 3 || text.length > 140) return false
  if (/[^\x20-\x7E]/.test(text)) return false
  if (/^\d+\s*\/\s*\d+$/.test(text)) return false
  if (/[.?!]$/.test(text)) return false
  if ((text.match(/[A-Za-z]/g) ?? []).length < 3) return false
  if (/^(content required|specification document|advisory|view file)\b/i.test(text)) return false
  if (/local content required/i.test(text)) return false
  if (/\b(consignee|reporting\/?officer)\b/i.test(text)) return false
  if (/batch no\b/i.test(text)) return false
  if ((text.match(/\*/g) ?? []).length >= 4) return false
  return text.split(/\s+/).length <= 28
}

function parseSpecificationBlocks(lines: string[]): ProductRow[] {
  const headings: { name: string; at: number }[] = []
  for (let i = 1; i < lines.length; i += 1) {
    if (!isSpecHeading(lines[i])) continue
    let name: string | null = null
    for (let j = i - 1; j >= Math.max(0, i - 6); j -= 1) {
      if (isSpecHeading(lines[j])) break
      if (!looksLikeProductName(lines[j])) continue
      name = lines[j].trim()
      break
    }
    if (name) headings.push({ name, at: i })
  }
  return headings.map((heading, index) => {
    const stop = index + 1 < headings.length ? headings[index + 1].at : Math.min(lines.length, heading.at + 25)
    let quantity: number | null = null
    let delivery: string | null = null
    for (let j = heading.at + 1; j < stop; j += 1) {
      const match = lines[j].match(/(\d[\d,]*)\s+(\d+)\s*$/)
      if (!match) continue
      quantity = Number(match[1].replace(/,/g, ''))
      delivery = `${match[2]} days`
      break
    }
    return { name: heading.name, quantity, deliveryPeriod: delivery, scheduleNumber: null }
  })
}

function documentNames(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((part) => part.replace(/^\s*\d+[\).\]]\s*/, '').trim())
    .filter((part) => part.length > 0 && part.toLowerCase() !== GEM_PDF_NAME.toLowerCase())
}

function isItemWise(method: string | null): boolean {
  return (method ?? '').toLowerCase().includes('item')
}

export function parseBidText(text: string): ParsedTender {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  const found = new Map<ScalarKey, string>()
  for (let i = 0; i < lines.length; i += 1) {
    const matched = matchLabel(lines[i])
    if (!matched || found.has(matched.key)) continue
    let rest = matched.rest
    if (matched.key === 'documents' && !rest) {
      const prior: string[] = []
      for (let j = i - 1; j >= 0 && prior.length < 4; j -= 1) {
        const prev = lines[j]
        if (matchLabel(prev)) break
        if (/,/.test(prev)) {
          prior.unshift(prev)
          continue
        }
        if (prior.length === 0 && prev.length < 80) {
          prior.unshift(prev)
          continue
        }
        break
      }
      rest = prior.join(' ')
    }
    if (!rest || matched.key === 'payment') {
      const extra: string[] = []
      if (rest && matched.key !== 'documents') extra.push(rest)
      if (matched.key === 'documents' && rest) extra.push(rest)
      for (let j = i + 1; j < lines.length; j += 1) {
        if (matchLabel(lines[j]) || STOP.test(lines[j])) break
        extra.push(lines[j])
        if (matched.key !== 'documents' && matched.key !== 'payment') break
      }
      rest = extra.join(matched.key === 'documents' ? '\n' : ' ').trim()
    }
    if (rest) found.set(matched.key, rest)
  }

  const payment = found.get('payment') ?? null
  const dayMatch = payment?.match(/(\d+)\s+days/i)
  const emdAmount = firstNumber(found.get('emdAmount') ?? null)
  const emdFlag = yesNo(found.get('emdDetail') ?? null)
  const epbgFlag = yesNo(found.get('epbgDetail') ?? null)
  const epbgPercentage = firstNumber(found.get('epbgPercentage') ?? null)
  const l1 = text.match(/L-?\s*1\s*\+\s*(\d+(?:\.\d+)?)\s*%/i)
  const quantityPercent = text.match(/percentage of\s+(\d+(?:\.\d+)?)\s*%/i)
  const evaluationMethod = found.get('evaluationMethod') ?? null
  const labeled = isItemWise(evaluationMethod) ? parseItemWise(text) : parseTotalValue(text)
  const fromSpecs = parseSpecificationBlocks(lines)
  const products =
    fromSpecs.length > labeled.length
      ? fromSpecs.map((row, index) =>
          isItemWise(evaluationMethod) ? { ...row, scheduleNumber: index + 1 } : row,
        )
      : labeled

  return {
    bidEnd: found.get('bidEnd') ?? null,
    offerValidity: found.get('offerValidity') ?? null,
    ministryOrState: found.get('ministryOrState') ?? null,
    department: found.get('department') ?? null,
    buyerEmail: found.get('buyerEmail') ?? null,
    hodEmail: found.get('hodEmail') ?? null,
    evaluationMethod,
    typeOfBid: found.get('typeOfBid') ?? null,
    bidToRa: found.get('bidToRa') ?? null,
    raQualificationRule: found.get('raQualificationRule') ?? null,
    paymentTimelineDays: dayMatch ? Number(dayMatch[1]) : null,
    bidderDocumentsShown: yesNo(found.get('shown') ?? null),
    requiredDocumentNames: documentNames(found.get('documents') ?? ''),
    mse: yesNo(found.get('mse') ?? null),
    mii: yesNo(found.get('mii') ?? null),
    l1PlusPercent: l1 ? Number(l1[1]) : null,
    quantityPercent: quantityPercent ? Number(quantityPercent[1]) : null,
    emdRequired: emdFlag ?? (emdAmount != null && emdAmount > 0 ? true : null),
    emdAmount,
    epbgRequired: epbgFlag ?? (epbgPercentage != null ? true : null),
    epbgPercentage,
    epbgMonths: firstNumber(found.get('epbgMonths') ?? null),
    beneficiaryName: found.get('beneficiaryName') ?? null,
    products,
  }
}

type TextItem = { str?: string; transform?: number[] }

function linesFromPage(items: TextItem[]): string[] {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = []
  for (const item of items) {
    const str = item.str?.trim()
    if (!str) continue
    const x = item.transform?.[4] ?? 0
    const y = item.transform?.[5] ?? 0
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2)
    if (!row) {
      row = { y, parts: [] }
      rows.push(row)
    }
    row.parts.push({ x, str })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((row) =>
    row.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

export async function parsePdf(bytes: Uint8Array): Promise<ParsedTender> {
  const pdfjs = await import('pdfjs-dist')
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    lines.push(...linesFromPage(content.items as TextItem[]))
  }
  return parseBidText(lines.join('\n'))
}
