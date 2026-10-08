export type ProductRow = {
  name: string
  quantity: number | null
  deliveryPeriod: string | null
  scheduleNumber: number | null
}

export type ParsedTender = {
  bidEnd: string | null
  offerValidity: string | null
  ministryOrState: string | null
  department: string | null
  buyerEmail: string | null
  hodEmail: string | null
  evaluationMethod: string | null
  typeOfBid: string | null
  bidToRa: string | null
  raQualificationRule: string | null
  paymentTimelineDays: number | null
  bidderDocumentsShown: boolean | null
  requiredDocumentNames: string[]
  mse: boolean | null
  mii: boolean | null
  l1PlusPercent: number | null
  quantityPercent: number | null
  emdRequired: boolean | null
  emdAmount: number | null
  epbgRequired: boolean | null
  epbgPercentage: number | null
  epbgMonths: number | null
  beneficiaryName: string | null
  products: ProductRow[]
}

export type ListingHit = {
  bidNumber: string
  listingId: string
  bidEnd: string | null
  ministry: string | null
  department: string | null
}

export type TenderInsert = ParsedTender & {
  bidNumber: string
  listingId: string
}

export const TENDER_STATUSES = [
  'Documentation',
  'Bid Participated',
  'Technically Qualified',
  'Tender Completed',
] as const

export type TenderStatus = (typeof TENDER_STATUSES)[number]

export function isTenderStatus(value: unknown): value is TenderStatus {
  return typeof value === 'string' && (TENDER_STATUSES as readonly string[]).includes(value)
}

export type ListScreen = 'search' | 'saved' | 'filled'

export type ListFilters = {
  ministryOrState?: string
  evaluationMethod?: string
  mse?: boolean | null
  emd?: boolean | null
}

export type TenderSummary = {
  bidNumber: string
  bidEnd: string | null
  ministryOrState: string | null
  department: string | null
  evaluationMethod: string | null
  mse: boolean | null
  l1PlusPercent: number | null
  quantityPercent: number | null
  emdRequired: boolean | null
  emdAmount: number | null
  productCount: number
  productNames: string[]
  pdf: 'ready' | 'download' | 'upload'
  saved: boolean
  status: TenderStatus | null
  uploadedFiles: string[]
}

export type DocumentView = {
  name: string
  filename: string | null
  action: 'ready' | 'download' | 'upload'
  template: boolean
}

export type TenderDetail = ParsedTender & {
  bidNumber: string
  saved: boolean
  status: TenderStatus | null
  documents: DocumentView[]
}

export type CompanyField = {
  key: string
  label: string
  value: string
}

export type CompanyFields = {
  name: string
  signatory: string
  address: string
  drugLicenseNumber: string
  gstin: string
  email: string
  phone: string
  udyamNumber: string
  logo: string
  fields: CompanyField[]
}

export type CompanyDocument = {
  name: string
  action: 'ready' | 'download' | 'upload'
}

export type CompanyProfile = CompanyFields & {
  documents: CompanyDocument[]
}

export type TextTemplate = {
  id: number
  name: string
  body: string
}

export type TemplatePlaceholder = {
  key: string
  label: string
}

export type TemplateField = {
  key: string
  label: string
  value: string
}

export type TemplatePreview = {
  id: number
  name: string
  fields: TemplateField[]
}

export type TemplateDownload = 'saved' | 'cancelled' | 'failed'

export type TemplatePrint = 'printed' | 'cancelled' | 'failed'

export const UNREACHABLE = 'the panel cannot reach its records'
export const FILE_BUCKET = 'tender-files'
export const GEM_PDF_NAME = 'GeM PDF'

export type FetchProgress =
  | { kind: 'phase'; phase: 'fetching' | 'downloading'; replace?: boolean }
  | { kind: 'pages'; last: boolean }
  | {
      kind: 'bid'
      bidNumber: string
      bidEnd: string | null
      ministryOrState: string | null
      department: string | null
      status: 'downloading' | 'analyzing' | 'downloaded' | 'failed'
    }
