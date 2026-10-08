export type TenderStatus =
  | 'Documentation'
  | 'Bid Participated'
  | 'Technically Qualified'
  | 'Tender Completed'

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

export type Product = {
  name: string
  quantity: number | null
  deliveryPeriod: string | null
  scheduleNumber: number | null
}

export type TenderDocument = {
  name: string
  filename: string | null
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
  status: TenderStatus | null
  documents: TenderDocument[]
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

export type MergeSource =
  | { kind: 'company'; name: string }
  | { kind: 'upload'; name: string; data: Uint8Array }

export type MergeResult = { ok: true } | { ok: false; message: string } | { ok: false; cancelled: true }

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

export type PanelApi = {
  reachable: () => Promise<{ ok: true } | { ok: false; message: string }>
  list: (screen: ScreenName, filters: Filters) => Promise<Summary[]>
  fetch: (keyword: string, pages: number, mode?: 'slate' | 'next') => Promise<{ started: boolean }>
  open: (bidNumber: string) => Promise<TenderDetail | null>
  openWindow: (bidNumber: string) => Promise<boolean>
  save: (bidNumber: string) => Promise<boolean>
  unsave: (bidNumber: string) => Promise<boolean>
  setStatus: (bidNumber: string, status: TenderStatus | null) => Promise<boolean>
  deleteTender: (bidNumber: string) => Promise<boolean>
  reanalyze: (bidNumber: string) => Promise<boolean>
  upload: (bidNumber: string, name: string, data: Uint8Array, filename: string) => Promise<boolean>
  download: (bidNumber: string, name: string) => Promise<boolean>
  exportDocument: (bidNumber: string, name: string) => Promise<TemplateDownload>
  openLocal: (bidNumber: string, name: string) => Promise<boolean>
  company: () => Promise<CompanyProfile | null>
  saveCompany: (fields: CompanyFields) => Promise<boolean>
  addCompanyDocument: (name: string) => Promise<boolean>
  removeCompanyDocument: (name: string) => Promise<boolean>
  uploadCompanyDocument: (name: string, data: Uint8Array, filename: string) => Promise<boolean>
  downloadCompanyDocument: (name: string) => Promise<boolean>
  exportCompanyDocument: (name: string) => Promise<TemplateDownload>
  openCompanyDocument: (name: string) => Promise<boolean>
  templates: () => Promise<TextTemplate[] | null>
  templatePlaceholders: () => Promise<TemplatePlaceholder[]>
  saveTemplate: (fields: { id: number | null; name: string; body: string }) => Promise<boolean>
  removeTemplate: (id: number) => Promise<boolean>
  previewTemplate: (id: number, bidNumber: string) => Promise<TemplatePreview | null>
  previewTemplateText: (body: string) => Promise<string | null>
  renderTemplate: (id: number, values: Record<string, string>) => Promise<string | null>
  saveTemplateDocument: (
    id: number,
    bidNumber: string,
    documentName: string,
    values: Record<string, string>,
  ) => Promise<boolean>
  mergeDocument: (bidNumber: string, documentName: string, sources: MergeSource[]) => Promise<MergeResult>
  mergeDownload: (bidNumber: string, documentName: string, sources: MergeSource[]) => Promise<MergeResult>
  downloadTemplate: (id: number, bidNumber: string, values: Record<string, string>) => Promise<TemplateDownload>
  printTemplate: (id: number, values: Record<string, string>) => Promise<TemplatePrint>
  onRow: (listener: () => void) => () => void
  onFetchDone: (listener: () => void) => () => void
  onFetchProgress: (listener: (event: FetchProgress) => void) => () => void
}

declare global {
  interface Window {
    panel?: PanelApi
  }
}
