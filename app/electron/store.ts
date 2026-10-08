import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FILE_BUCKET,
  GEM_PDF_NAME,
  type CompanyFields,
  type CompanyProfile,
  type DocumentView,
  type TenderStatus,
  type ListFilters,
  type ListScreen,
  type ParsedTender,
  type TenderDetail,
  type TenderInsert,
  type TenderSummary,
  type TemplatePreview,
  type TextTemplate,
} from './types.js'
import { documentIsLocal, fileAction, localCompanyDocumentPath, localDocumentFileName } from './files.js'
import { templateFields, templateValues } from './template.js'

type Query = {
  eq: (column: string, value: string | boolean) => Query
  ilike: (column: string, value: string) => Query
  not: (column: string, operator: 'is', value: null) => Query
}

export type Predicate =
  | { op: 'eq'; column: string; value: string | boolean }
  | { op: 'includes'; column: string; value: string }
  | { op: 'notnull'; column: string }

export function predicates(screen: ListScreen, filters: ListFilters): Predicate[] {
  const result: Predicate[] = []
  if (screen === 'saved') result.push({ op: 'eq', column: 'saved', value: true })
  if (screen === 'filled') result.push({ op: 'notnull', column: 'status' })
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
    if (pred.op === 'notnull') return value != null && value !== ''
    if (pred.op === 'eq') return value === pred.value
    return String(value ?? '').toLowerCase().includes(pred.value.toLowerCase())
  })
}

export function applyPredicates<Q extends Query>(query: Q, preds: Predicate[]): Q {
  let next = query
  for (const pred of preds) {
    if (pred.op === 'notnull') next = next.not(pred.column, 'is', null) as Q
    else if (pred.op === 'eq') next = next.eq(pred.column, pred.value) as Q
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
  status: TenderStatus | null
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

export async function bidsMissingEvaluation(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from('tender').select('bid_number').is('evaluation_method', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.bid_number as string)
}

export async function bidsNeedingProducts(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from('tender').select('bid_number, product(name)')
  if (error) throw new Error(error.message)
  const weak = (name: string) =>
    name.trim().length < 3 || /^\d+\s*\/\s*\d+$/.test(name.trim()) || /batch no\b/i.test(name)
  return (data ?? [])
    .filter((row) => {
      const names = ((row.product as { name: string }[] | null) ?? []).map((item) => item.name)
      return names.length === 0 || names.some(weak)
    })
    .map((row) => row.bid_number as string)
}

export async function fillParsed(
  client: SupabaseClient,
  bidNumber: string,
  parsed: ParsedTender,
  options: { replaceDocuments?: boolean } = {},
): Promise<void> {
  const update: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (value != null && value !== '') update[column] = value
  }
  set('bid_end', parsed.bidEnd)
  set('offer_validity', parsed.offerValidity)
  set('ministry_or_state', parsed.ministryOrState)
  set('department', parsed.department)
  set('buyer_email', parsed.buyerEmail)
  set('hod_email', parsed.hodEmail)
  set('evaluation_method', parsed.evaluationMethod)
  set('type_of_bid', parsed.typeOfBid)
  set('bid_to_ra', parsed.bidToRa)
  set('ra_qualification_rule', parsed.raQualificationRule)
  set('payment_timeline_days', parsed.paymentTimelineDays)
  set('bidder_documents_shown', parsed.bidderDocumentsShown)
  set('mse', parsed.mse)
  set('mii', parsed.mii)
  set('l1_plus_percent', parsed.l1PlusPercent)
  set('quantity_percent', parsed.quantityPercent)
  set('emd_required', parsed.emdRequired)
  set('emd_amount', parsed.emdAmount)
  set('epbg_required', parsed.epbgRequired)
  set('epbg_percentage', parsed.epbgPercentage)
  set('epbg_months', parsed.epbgMonths)
  set('beneficiary_name', parsed.beneficiaryName)
  if (parsed.requiredDocumentNames.length > 0) update.required_document_names = parsed.requiredDocumentNames
  if (Object.keys(update).length > 0) {
    const { error } = await client.from('tender').update(update).eq('bid_number', bidNumber)
    if (error) throw new Error(error.message)
  }
  if (parsed.products.length > 0) {
    const { error: deleteError } = await client.from('product').delete().eq('bid_number', bidNumber)
    if (deleteError) throw new Error(deleteError.message)
    const { error: productError } = await client.from('product').insert(
      parsed.products.map((product) => ({
        bid_number: bidNumber,
        name: product.name,
        quantity: product.quantity,
        delivery_period: product.deliveryPeriod,
        schedule_number: product.scheduleNumber,
      })),
    )
    if (productError) throw new Error(productError.message)
  }
  const { data, error } = await client.from('document').select('name, storage_key').eq('bid_number', bidNumber)
  if (error) throw new Error(error.message)
  const wanted = documentNamesFor(parsed.requiredDocumentNames)
  if (options.replaceDocuments && parsed.requiredDocumentNames.length > 0) {
    const keep = new Set(wanted.map((name) => name.toLowerCase()))
    const stale = (data ?? [])
      .filter((row) => !row.storage_key && !keep.has((row.name as string).toLowerCase()))
      .map((row) => row.name as string)
    if (stale.length > 0) {
      const { error: staleError } = await client.from('document').delete().eq('bid_number', bidNumber).in('name', stale)
      if (staleError) throw new Error(staleError.message)
    }
  }
  const have = new Set((data ?? []).map((row) => row.name as string))
  const missing = wanted.filter((name) => !have.has(name))
  if (missing.length > 0) {
    const { error: insertError } = await client.from('document').insert(
      missing.map((name) => ({ bid_number: bidNumber, name, storage_key: null })),
    )
    if (insertError) throw new Error(insertError.message)
  }
}

export async function setSaved(client: SupabaseClient, bidNumber: string, saved: boolean): Promise<void> {
  const { error } = await client.from('tender').update({ saved }).eq('bid_number', bidNumber)
  if (error) throw new Error(error.message)
}

export async function deleteTender(client: SupabaseClient, bidNumber: string): Promise<void> {
  const { data, error } = await client.from('document').select('storage_key').eq('bid_number', bidNumber)
  if (error) throw new Error(error.message)
  const keys = (data ?? []).map((row) => row.storage_key as string | null).filter((key): key is string => Boolean(key))
  const { error: deleteError } = await client.from('tender').delete().eq('bid_number', bidNumber)
  if (deleteError) throw new Error(deleteError.message)
  if (keys.length > 0) await client.storage.from(FILE_BUCKET).remove(keys)
}

export async function setStatus(client: SupabaseClient, bidNumber: string, status: TenderStatus | null): Promise<void> {
  const { error } = await client.from('tender').update({ status }).eq('bid_number', bidNumber)
  if (error) throw new Error(error.message)
}

export async function listTenders(
  client: SupabaseClient,
  root: string,
  screen: ListScreen,
  filters: ListFilters,
): Promise<TenderSummary[]> {
  const preds = predicates(screen, filters)
  let query = client
    .from('tender')
    .select(
      'bid_number, bid_end, ministry_or_state, department, evaluation_method, mse, l1_plus_percent, quantity_percent, emd_required, emd_amount, saved, status, product(name)',
    )
  query = applyPredicates(query as unknown as Query, preds) as unknown as typeof query
  const { data, error } = await query.order('bid_number')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (Pick<
    TenderRecord,
    | 'bid_number'
    | 'bid_end'
    | 'ministry_or_state'
    | 'department'
    | 'evaluation_method'
    | 'mse'
    | 'l1_plus_percent'
    | 'quantity_percent'
    | 'emd_required'
    | 'emd_amount'
    | 'saved'
    | 'status'
  > & { product?: { name: string }[] | null })[]
  const uploaded = new Map<string, string[]>()
  const storedPdf = new Set<string>()
  if (rows.length > 0) {
    const bidNumbers = rows.map((row) => row.bid_number)
    const { data: pdfs, error: pdfError } = await client
      .from('document')
      .select('bid_number, storage_key')
      .eq('name', GEM_PDF_NAME)
      .in('bid_number', bidNumbers)
    if (pdfError) throw new Error(pdfError.message)
    for (const pdf of pdfs ?? []) {
      if (pdf.storage_key) storedPdf.add(pdf.bid_number as string)
    }
    if (screen === 'filled') {
      const { data: docs, error: docError } = await client
        .from('document')
        .select('bid_number, name, storage_key')
        .in('bid_number', bidNumbers)
        .not('storage_key', 'is', null)
      if (docError) throw new Error(docError.message)
      for (const doc of docs ?? []) {
        const bid = doc.bid_number as string
        const list = uploaded.get(bid) ?? []
        list.push(doc.name as string)
        uploaded.set(bid, list)
      }
    }
  }
  const localPdf = new Map<string, boolean>()
  await Promise.all(
    rows.map(async (row) => {
      localPdf.set(row.bid_number, await documentIsLocal(root, row.bid_number, GEM_PDF_NAME))
    }),
  )
  return rows.map((row) => ({
    bidNumber: row.bid_number,
    bidEnd: row.bid_end,
    ministryOrState: row.ministry_or_state,
    department: row.department,
    evaluationMethod: row.evaluation_method,
    mse: row.mse,
    l1PlusPercent: row.l1_plus_percent == null ? null : Number(row.l1_plus_percent),
    quantityPercent: row.quantity_percent == null ? null : Number(row.quantity_percent),
    emdRequired: row.emd_required,
    emdAmount: row.emd_amount == null ? null : Number(row.emd_amount),
    productCount: row.product?.length ?? 0,
    productNames: (row.product ?? []).map((item) => item.name),
    pdf: fileAction(localPdf.get(row.bid_number) === true, storedPdf.has(row.bid_number)),
    saved: row.saved,
    status: row.status,
    uploadedFiles: uploaded.get(row.bid_number) ?? [],
  }))
}

export async function openTender(
  client: SupabaseClient,
  root: string,
  bidNumber: string,
): Promise<TenderDetail | null> {
  const [tenderResult, productResult, documentResult] = await Promise.all([
    client.from('tender').select('*').eq('bid_number', bidNumber).maybeSingle(),
    client
      .from('product')
      .select('name, quantity, delivery_period, schedule_number')
      .eq('bid_number', bidNumber)
      .order('id'),
    client.from('document').select('name, storage_key').eq('bid_number', bidNumber).order('id'),
  ])
  if (tenderResult.error) throw new Error(tenderResult.error.message)
  if (productResult.error) throw new Error(productResult.error.message)
  if (documentResult.error) throw new Error(documentResult.error.message)
  if (!tenderResult.data) return null
  const row = tenderResult.data as TenderRecord
  const products = productResult.data
  const documents = documentResult.data
  const views: DocumentView[] = await Promise.all(
    (documents ?? []).map(async (doc) => {
      const name = doc.name as string
      const stored = Boolean(doc.storage_key)
      const filename = await localDocumentFileName(root, bidNumber, name)
      return { name, filename, action: fileAction(filename != null, stored), template: name !== GEM_PDF_NAME }
    }),
  )
  return {
    ...toParsed(row),
    bidNumber: row.bid_number,
    saved: row.saved,
    status: row.status,
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

export async function loadCompany(client: SupabaseClient, root: string): Promise<CompanyProfile> {
  const [companyResult, documentResult] = await Promise.all([
    client.from('company').select('name, authorized_signatory, address, drug_license_number').eq('id', 1).maybeSingle(),
    client.from('company_document').select('name, storage_key').order('id'),
  ])
  if (companyResult.error) throw new Error(companyResult.error.message)
  if (documentResult.error) throw new Error(documentResult.error.message)
  const row = companyResult.data
  const documents = await Promise.all(
    (documentResult.data ?? []).map(async (doc) => {
      const name = doc.name as string
      const local = (await localCompanyDocumentPath(root, name)) != null
      return { name, action: fileAction(local, Boolean(doc.storage_key)) }
    }),
  )
  return {
    name: (row?.name as string | null) ?? '',
    signatory: (row?.authorized_signatory as string | null) ?? '',
    address: (row?.address as string | null) ?? '',
    drugLicenseNumber: (row?.drug_license_number as string | null) ?? '',
    documents,
  }
}

export async function saveCompany(client: SupabaseClient, fields: CompanyFields): Promise<void> {
  const { error } = await client.from('company').upsert(
    {
      id: 1,
      name: fields.name,
      authorized_signatory: fields.signatory,
      address: fields.address,
      drug_license_number: fields.drugLicenseNumber,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

export async function addCompanyDocument(client: SupabaseClient, name: string): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) return false
  const { data, error } = await client.from('company_document').select('name')
  if (error) throw new Error(error.message)
  const taken = (data ?? []).some((row) => (row.name as string).toLowerCase() === trimmed.toLowerCase())
  if (taken) return false
  const { error: insertError } = await client.from('company_document').insert({ name: trimmed, storage_key: null })
  if (insertError) {
    if (insertError.code === '23505') return false
    throw new Error(insertError.message)
  }
  return true
}

export async function companyStorageKey(client: SupabaseClient, name: string): Promise<string | null> {
  const { data, error } = await client.from('company_document').select('storage_key').eq('name', name).maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.storage_key as string | null) ?? null
}

export async function removeCompanyDocument(client: SupabaseClient, name: string): Promise<void> {
  const key = await companyStorageKey(client, name)
  const { error } = await client.from('company_document').delete().eq('name', name)
  if (error) throw new Error(error.message)
  if (key) await client.storage.from(FILE_BUCKET).remove([key])
}

export async function uploadCompanyStored(
  client: SupabaseClient,
  name: string,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage.from(FILE_BUCKET).upload(key, bytes, { upsert: true, contentType })
  if (error) throw new Error(error.message)
  const { data, error: updateError } = await client
    .from('company_document')
    .update({ storage_key: key })
    .eq('name', name)
    .select('name')
  if (updateError) throw new Error(updateError.message)
  if (!data || data.length === 0) throw new Error('missing')
}

function asTemplate(row: { id: number | string; name: string; body: string | null }): TextTemplate {
  return { id: Number(row.id), name: row.name, body: row.body ?? '' }
}

export async function listTemplates(client: SupabaseClient): Promise<TextTemplate[]> {
  const { data, error } = await client.from('template').select('id, name, body').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => asTemplate(row as { id: number; name: string; body: string | null }))
}

export async function templateById(client: SupabaseClient, id: number): Promise<TextTemplate | null> {
  const { data, error } = await client.from('template').select('id, name, body').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return asTemplate(data as { id: number; name: string; body: string | null })
}

export async function saveTemplate(
  client: SupabaseClient,
  fields: { id: number | null; name: string; body: string },
): Promise<boolean> {
  const name = fields.name.trim()
  if (!name) return false
  const { data, error } = await client.from('template').select('id, name')
  if (error) throw new Error(error.message)
  const taken = (data ?? []).some(
    (row) => (row.name as string).toLowerCase() === name.toLowerCase() && Number(row.id) !== fields.id,
  )
  if (taken) return false
  if (fields.id == null) {
    const { error: insertError } = await client.from('template').insert({ name, body: fields.body })
    if (insertError) {
      if (insertError.code === '23505') return false
      throw new Error(insertError.message)
    }
    return true
  }
  const { data: updated, error: updateError } = await client
    .from('template')
    .update({ name, body: fields.body })
    .eq('id', fields.id)
    .select('id')
  if (updateError) {
    if (updateError.code === '23505') return false
    throw new Error(updateError.message)
  }
  return (updated?.length ?? 0) > 0
}

export async function removeTemplate(client: SupabaseClient, id: number): Promise<void> {
  const { error } = await client.from('template').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function previewTemplate(
  client: SupabaseClient,
  root: string,
  id: number,
  bidNumber: string,
): Promise<TemplatePreview | null> {
  const template = await templateById(client, id)
  if (!template) return null
  const [company, tender] = await Promise.all([loadCompany(client, root), openTender(client, root, bidNumber)])
  if (!tender) return null
  return {
    id: template.id,
    name: template.name,
    fields: templateFields(template.body, templateValues(company, tender)),
  }
}
