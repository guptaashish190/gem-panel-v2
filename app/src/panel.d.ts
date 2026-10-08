export type ScreenName = 'search' | 'saved' | 'filled'

export type Filters = {
  ministryOrState: string
  evaluationMethod: string
  mse: boolean | null
  emd: boolean | null
}

export type Summary = {
  bidNumber: string
  bidEnd: string | null
  ministryOrState: string | null
  department: string | null
  evaluationMethod: string | null
  saved: boolean
  filled: boolean
  uploadedFiles: string[]
}

export type Product = {
  name: string
  quantity: number | null
  deliveryPeriod: string | null
  scheduleNumber: number | null
}

export type TenderDocument = {
  name: string
  action: 'ready' | 'download' | 'upload'
  template: boolean
}

export type TenderDetail = {
  bidNumber: string
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
  products: Product[]
  saved: boolean
  filled: boolean
  documents: TenderDocument[]
}

export type PanelApi = {
  reachable: () => Promise<{ ok: true } | { ok: false; message: string }>
  list: (screen: ScreenName, filters: Filters) => Promise<Summary[]>
  fetch: (keyword: string, pages: number) => Promise<{ started: boolean }>
  open: (bidNumber: string) => Promise<TenderDetail | null>
  save: (bidNumber: string) => Promise<boolean>
  unsave: (bidNumber: string) => Promise<boolean>
  markFilled: (bidNumber: string) => Promise<boolean>
  upload: (bidNumber: string, name: string, data: Uint8Array, filename: string) => Promise<boolean>
  download: (bidNumber: string, name: string) => Promise<boolean>
  onRow: (listener: () => void) => () => void
  onFetchDone: (listener: () => void) => () => void
}

declare global {
  interface Window {
    panel?: PanelApi
  }
}
