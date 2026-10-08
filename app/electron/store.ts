import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FILE_BUCKET,
  GEM_PDF_NAME,
  type DocumentView,
  type ListFilters,
  type ListScreen,
  type ParsedTender,
  type TenderDetail,
  type TenderInsert,
  type TenderSummary,
} from './types.js'
import { documentIsLocal, fileAction } from './files.js'

type Query = {
  eq: (column: string, value: string | boolean) => Query
  ilike: (column: string, value: string) => Query
}

export type Predicate =
  | { op: 'eq'; column: string; value: string | boolean }
  | { op: 'includes'; column: string; value: string }

export function predicates(screen: ListScreen, filters: ListFilters): Predicate[] {
  const result: Predicate[] = []
  if (screen === 'saved') result.push({ op: 'eq', column: 'saved', value: true })
  if (screen === 'filled') result.push({ op: 'eq', column: 'filled', value: true })
  const ministry = filters.ministryOrState?.trim()
  const evaluation = filters.evaluationMethod?.trim()
  if (ministry) result.push({ op: 'includes', column: 'ministry_or_state', value: ministry })
  if (evaluation) result.push({ op: 'includes', column: 'evaluation_method', value: evaluation })
  if (filters.mse != null) result.push({ op: 'eq', column: 'mse', value: filters.mse })
  if (filters.emd != null) result.push({ op: 'eq', column: 'emd_required', value: filters.emd })
  return result
}

export function rowMatchesPredicates(row: Record<string, unknown>, preds: Predicate[]): boolean {
  return preds.every((pred) => {
    const value = row[pred.column]
    if (pred.op === 'eq') return value === pred.value
    return String(value ?? '').toLowerCase().includes(pred.value.toLowerCase())
  })
}

export function applyPredicates<Q extends Query>(query: Q, preds: Predicate[]): Q {
  let next = query
  for (const pred of preds) {
    if (pred.op === 'eq') next = next.eq(pred.column, pred.value) as Q
    else {
      const pattern = `%${pred.value.replace(/[%_\\]/g, (char) => `\\${char}`)}%`
      next = next.ilike(pred.column, pattern) as Q
    }
  }
  return next
}

type TenderRecord = {
  bid_number: string
  listing_id: string
  bid_end: string | null
  offer_validity: string | null
  ministry_or_state: string | null
  department: string | null
  buyer_email: string | null
  hod_email: string | null
  evaluation_method: string | null
  type_of_bid: string | null
  bid_to_ra: string | null
  ra_qualification_rule: string | null
  payment_timeline_days: number | null
  bidder_documents_shown: boolean | null
  required_document_names: string[] | null
  mse: boolean | null
  mii: boolean | null
  l1_plus_percent: number | null
  quantity_percent: number | null
  emd_required: boolean | null
  emd_amount: number | null
  epbg_required: boolean | null
  epbg_percentage: number | null
  epbg_months: number | null
  beneficiary_name: string | null
  saved: boolean
  filled: boolean
}

function asRecord(row: TenderInsert): Record<string, unknown> {
  return {
    bid_number: row.bidNumber,
    listing_id: row.listingId,
    bid_end: row.bidEnd,
    offer_validity: row.offerValidity,
    ministry_or_state: row.ministryOrState,
    department: row.department,
    buyer_email: row.buyerEmail,
    hod_email: row.hodEmail,
    evaluation_method: row.evaluationMethod,
    type_of_bid: row.typeOfBid,
    bid_to_ra: row.bidToRa,
    ra_qualification_rule: row.raQualificationRule,
    payment_timeline_days: row.paymentTimelineDays,
    bidder_documents_shown: row.bidderDocumentsShown,
    required_document_names: row.requiredDocumentNames,
    mse: row.mse,
    mii: row.mii,
    l1_plus_percent: row.l1PlusPercent,
    quantity_percent: row.quantityPercent,
    emd_required: row.emdRequired,
    emd_amount: row.emdAmount,
    epbg_required: row.epbgRequired,
    epbg_percentage: row.epbgPercentage,
    epbg_months: row.epbgMonths,
    beneficiary_name: row.beneficiaryName,
  }
}

export function documentNamesFor(required: string[]): string[] {
  const names = [GEM_PDF_NAME]
  for (const name of required) {
    const trimmed = name.trim()
    if (!trimmed || names.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue
    names.push(trimmed)
  }
  for (const extra of ['Contract', 'CRAC']) {
    if (!names.some((existing) => existing.toLowerCase() === extra.toLowerCase())) names.push(extra)
  }
  return names
}

function toParsed(row: TenderRecord): ParsedTender {
  return {
    bidEnd: row.bid_end,
    offerValidity: row.offer_validity,
    ministryOrState: row.ministry_or_state,
    department: row.department,
    buyerEmail: row.buyer_email,
    hodEmail: row.hod_email,
    evaluationMethod: row.evaluation_method,
    typeOfBid: row.type_of_bid,
    bidToRa: row.bid_to_ra,
    raQualificationRule: row.ra_qualification_rule,
    paymentTimelineDays: row.payment_timeline_days,
    bidderDocumentsShown: row.bidder_documents_shown,
    requiredDocumentNames: row.required_document_names ?? [],
    mse: row.mse,
    mii: row.mii,
    l1PlusPercent: row.l1_plus_percent == null ? null : Number(row.l1_plus_percent),
    quantityPercent: row.quantity_percent == null ? null : Number(row.quantity_percent),
    emdRequired: row.emd_required,
    emdAmount: row.emd_amount == null ? null : Number(row.emd_amount),
    epbgRequired: row.epbg_required,
    epbgPercentage: row.epbg_percentage == null ? null : Number(row.epbg_percentage),
    epbgMonths: row.epbg_months,
    beneficiaryName: row.beneficiary_name,
    products: [],
  }
}

export async function hasBid(client: SupabaseClient, bidNumber: string): Promise<boolean> {
  const { count, error } = await client
    .from('tender')
    .select('bid_number', { count: 'exact', head: true })
    .eq('bid_number', bidNumber)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

export async function pagesSearched(client: SupabaseClient, keyword: string): Promise<number> {
  const { data, error } = await client
    .from('keyword_cursor')
    .select('pages_searched')
    .eq('keyword', keyword)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.pages_searched ?? 0
}

export async function setPagesSearched(client: SupabaseClient, keyword: string, pages: number): Promise<void> {
  const { error } = await client.from('keyword_cursor').upsert({ keyword, pages_searched: pages })
  if (error) throw new Error(error.message)
}

export async function savedBidNumbers(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from('tender').select('bid_number').eq('saved', true)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.bid_number as string)
}

export async function insertTender(client: SupabaseClient, row: TenderInsert): Promise<void> {
  const { error } = await client.from('tender').insert(asRecord(row))
  if (error) throw new Error(error.message)
  try {
    if (row.products.length > 0) {
      const { error: productError } = await client.from('product').insert(
        row.products.map((product) => ({
          bid_number: row.bidNumber,
          name: product.name,
          quantity: product.quantity,
          delivery_period: product.deliveryPeriod,
          schedule_number: product.scheduleNumber,
        })),
      )
      if (productError) throw new Error(productError.message)
    }
    const { error: documentError } = await client.from('document').insert(
      documentNamesFor(row.requiredDocumentNames).map((name) => ({
        bid_number: row.bidNumber,
        name,
        storage_key: null,
      })),
    )
    if (documentError) throw new Error(documentError.message)
  } catch (err) {
    await client.from('tender').delete().eq('bid_number', row.bidNumber)
    throw err
  }
}

export async function setSaved(client: SupabaseClient, bidNumber: string, saved: boolean): Promise<void> {
  const { error } = await client.from('tender').update({ saved }).eq('bid_number', bidNumber)
  if (error) throw new Error(error.message)
}

export async function setFilled(client: SupabaseClient, bidNumber: string): Promise<void> {
  const { error } = await client.from('tender').update({ filled: true }).eq('bid_number', bidNumber)
  if (error) throw new Error(error.message)
}

export async function listTenders(
  client: SupabaseClient,
  screen: ListScreen,
  filters: ListFilters,
): Promise<TenderSummary[]> {
  const preds = predicates(screen, filters)
  let query = client
    .from('tender')
    .select('bid_number, bid_end, ministry_or_state, department, evaluation_method, saved, filled')
  query = applyPredicates(query as unknown as Query, preds) as unknown as typeof query
  const { data, error } = await query.order('bid_number')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Pick<
    TenderRecord,
    'bid_number' | 'bid_end' | 'ministry_or_state' | 'department' | 'evaluation_method' | 'saved' | 'filled'
  >[]
  const uploaded = new Map<string, string[]>()
  if (screen === 'filled' && rows.length > 0) {
    const { data: docs, error: docError } = await client
      .from('document')
      .select('bid_number, name, storage_key')
      .in(
        'bid_number',
        rows.map((row) => row.bid_number),
      )
      .not('storage_key', 'is', null)
    if (docError) throw new Error(docError.message)
    for (const doc of docs ?? []) {
      const bid = doc.bid_number as string
      const list = uploaded.get(bid) ?? []
      list.push(doc.name as string)
      uploaded.set(bid, list)
    }
  }
  return rows.map((row) => ({
    bidNumber: row.bid_number,
    bidEnd: row.bid_end,
    ministryOrState: row.ministry_or_state,
    department: row.department,
    evaluationMethod: row.evaluation_method,
    saved: row.saved,
    filled: row.filled,
    uploadedFiles: uploaded.get(row.bid_number) ?? [],
  }))
}

export async function openTender(
  client: SupabaseClient,
  root: string,
  bidNumber: string,
): Promise<TenderDetail | null> {
  const { data, error } = await client.from('tender').select('*').eq('bid_number', bidNumber).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as TenderRecord
  const { data: products, error: productError } = await client
    .from('product')
    .select('name, quantity, delivery_period, schedule_number')
    .eq('bid_number', bidNumber)
    .order('id')
  if (productError) throw new Error(productError.message)
  const { data: documents, error: documentError } = await client
    .from('document')
    .select('name, storage_key')
    .eq('bid_number', bidNumber)
    .order('id')
  if (documentError) throw new Error(documentError.message)
  const views: DocumentView[] = []
  for (const doc of documents ?? []) {
    const name = doc.name as string
    const stored = Boolean(doc.storage_key)
    const local = await documentIsLocal(root, bidNumber, name)
    const action = fileAction(local, stored)
    views.push({ name, action, template: name !== GEM_PDF_NAME })
  }
  return {
    ...toParsed(row),
    bidNumber: row.bid_number,
    saved: row.saved,
    filled: row.filled,
    products: (products ?? []).map((product) => ({
      name: product.name as string,
      quantity: product.quantity == null ? null : Number(product.quantity),
      deliveryPeriod: (product.delivery_period as string | null) ?? null,
      scheduleNumber: (product.schedule_number as number | null) ?? null,
    })),
    documents: views,
  }
}

export async function storageKey(client: SupabaseClient, bidNumber: string, name: string): Promise<string | null> {
  const { data, error } = await client
    .from('document')
    .select('storage_key')
    .eq('bid_number', bidNumber)
    .eq('name', name)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.storage_key as string | null) ?? null
}

export async function readStored(client: SupabaseClient, key: string): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(FILE_BUCKET).download(key)
  if (error || !data) throw new Error(error?.message ?? 'missing')
  return new Uint8Array(await data.arrayBuffer())
}

export async function uploadStored(
  client: SupabaseClient,
  bidNumber: string,
  name: string,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage.from(FILE_BUCKET).upload(key, bytes, { upsert: true, contentType })
  if (error) throw new Error(error.message)
  const { error: updateError } = await client
    .from('document')
    .update({ storage_key: key })
    .eq('bid_number', bidNumber)
    .eq('name', name)
  if (updateError) throw new Error(updateError.message)
}
