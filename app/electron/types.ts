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
  saved: boolean
  filled: boolean
  uploadedFiles: string[]
}

export type DocumentView = {
  name: string
  action: 'ready' | 'download' | 'upload'
  template: boolean
}

export type TenderDetail = ParsedTender & {
  bidNumber: string
  saved: boolean
  filled: boolean
  documents: DocumentView[]
}

export const UNREACHABLE = 'the panel cannot reach its records'
export const FILE_BUCKET = 'tender-files'
export const GEM_PDF_NAME = 'GeM PDF'
