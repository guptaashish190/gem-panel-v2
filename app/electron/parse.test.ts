import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linesFromPage, parseBidLines, parseBidText, type TextItem } from './parse.js'

function item(x: number, y: number, width: number, str: string): TextItem {
  return { str, transform: [1, 0, 0, 1, x, y], width, height: 9 }
}

const DOCUMENT_ROW = [
  item(45, 198.5, 127, 'Experience and Turnover'),
  item(276, 174.5, 68, 'Yes | Complete'),
  item(45, 168.5, 177, 'Relaxation for Years Of Experience'),
  item(276, 149.8, 201, 'Experience Criteria,Past Performance,Bidder'),
  item(276, 138.5, 266, 'Turnover,Certificate (Requested in ATC),OEM Authorization'),
  item(276, 127.3, 237, 'Certificate,OEM Annual Turnover,Compliance of BoQ'),
  item(45, 116, 24, 'विक्रेता'),
  item(151, 116, 101, '/Document required'),
  item(276, 116, 176, 'specification and supporting document'),
]

const EXPECTED_DOCUMENTS = [
  'Experience Criteria',
  'Past Performance',
  'Bidder Turnover',
  'Certificate (Requested in ATC)',
  'OEM Authorization Certificate',
  'OEM Annual Turnover',
  'Compliance of BoQ specification and supporting document',
]

test('documents come from the value column of the document row and stop at the note', () => {
  const parsed = parseBidLines(
    linesFromPage([
      ...DOCUMENT_ROW,
      item(276, 104.8, 269, '*In case any bidder is seeking exemption from Experience /'),
      item(45, 102.5, 55, 'from seller'),
      item(276, 93.5, 258, 'Turnover Criteria, the supporting documents to prove his'),
      item(276, 71, 44, 'the buyer'),
    ]),
  )
  assert.deepEqual(parsed.requiredDocumentNames, EXPECTED_DOCUMENTS)
})

test('documents without a note stop at the next table row', () => {
  const parsed = parseBidLines(
    linesFromPage([
      ...DOCUMENT_ROW,
      item(45, 102.5, 55, 'from seller'),
      item(276, 82, 20, 'Yes, Always'),
      item(45, 79, 120, 'Some Next Row'),
    ]),
  )
  assert.deepEqual(parsed.requiredDocumentNames, EXPECTED_DOCUMENTS)
})

test('wrapped labels, sub-rows, and shared cells read from the table rows', () => {
  const parsed = parseBidLines(
    linesFromPage([
      item(131, 636, 100, '/Bid End Date/Time'),
      item(276, 636, 90, '12-10-2026 10:00:00'),
      item(117, 578, 40, '/Bid Offer'),
      item(276, 573, 50, '180 (Days)'),
      item(45, 565, 120, 'Validity (From End Date)'),
      item(141, 451, 90, '/ Contact details of'),
      item(276, 451, 180, 'HOD Email id :sanilmohan.467m@gov.in'),
      item(276, 439, 160, 'Buyer Email id: antarad.074a@gov.in'),
      item(45, 437, 90, 'Grievance redressal'),
      item(128, 715, 90, '/Do you want to show'),
      item(276, 709, 20, 'Yes'),
      item(45, 702, 180, 'documents uploaded by bidders to all'),
      item(45, 691, 120, 'bidders participated in bid?'),
      item(94, 232, 50, '/EMD Detail'),
      item(87, 199, 40, '/Required'),
      item(277, 199, 12, 'No'),
      item(104, 154, 50, '/ePBG Detail'),
      item(127, 97, 90, '/ePBG Percentage(%)'),
      item(277, 97, 20, '3.00'),
      item(184, 60, 80, '/Duration of ePBG'),
      item(277, 55, 6, '5'),
      item(47, 47, 90, 'required (Months).'),
    ]),
  )
  assert.equal(parsed.bidEnd, '12-10-2026 10:00:00')
  assert.equal(parsed.offerValidity, '180 (Days)')
  assert.equal(parsed.hodEmail, 'sanilmohan.467m@gov.in')
  assert.equal(parsed.buyerEmail, 'antarad.074a@gov.in')
  assert.equal(parsed.bidderDocumentsShown, true)
  assert.equal(parsed.emdRequired, false)
  assert.equal(parsed.epbgRequired, true)
  assert.equal(parsed.epbgPercentage, 3)
  assert.equal(parsed.epbgMonths, 5)
})

const TOTAL_VALUE = `
Bid End Date/Time 08-10-2026 15:00:00
Bid Offer Validity (From End Date) 90 (Days)
Ministry/State Name Ministry of Defence
Department Name Department of Military Affairs
Buyer Email buyer@example.com
HOD Email hod@example.com
Evaluation Method Total value wise evaluation
Type of Bid Two Packet Bid
Bid to RA enabled Yes
RA Qualification Rule 50% Lowest Priced Technically Qualified Bidders
Payment Timelines Payments shall be made to the Seller within 15 days of issue of consignee receipt-cum-acceptance certificate (CRAC)
Whether documents uploaded by bidders are shown to other bidders Yes
Document required from seller Experience Criteria, Certificate (Requested in ATC)
MSE Purchase Preference Yes
MII Purchase Preference No
If L-1 is not an MSE and MSE Seller has quoted price within L-1+ 15% of margin, such Seller shall be given opportunity to match L-1 price and contract will be awarded for percentage of 25% of total value.
EMD Detail Required
EMD Amount 5,000
ePBG Detail Required
ePBG Percentage(%) 3
Duration of ePBG required (Months) 14
Beneficiary Name Central Depot
Total Quantity 9999
Product Name Surgical Mask
Consignee Quantity 10
Consignee Quantity 15
Delivery Period 30
Product Name Gloves
Consignee Quantity 40
Delivery Period 12
`

test('total-value parse keeps one row per named block and ignores the header quantity', () => {
  const parsed = parseBidText(TOTAL_VALUE)
  assert.equal(parsed.ministryOrState, 'Ministry of Defence')
  assert.equal(parsed.department, 'Department of Military Affairs')
  assert.equal(parsed.buyerEmail, 'buyer@example.com')
  assert.equal(parsed.hodEmail, 'hod@example.com')
  assert.equal(parsed.offerValidity, '90 (Days)')
  assert.equal(parsed.bidEnd, '08-10-2026 15:00:00')
  assert.equal(parsed.evaluationMethod, 'Total value wise evaluation')
  assert.equal(parsed.typeOfBid, 'Two Packet Bid')
  assert.equal(parsed.bidToRa, 'Yes')
  assert.equal(parsed.paymentTimelineDays, 15)
  assert.equal(parsed.bidderDocumentsShown, true)
  assert.deepEqual(parsed.requiredDocumentNames, ['Experience Criteria', 'Certificate (Requested in ATC)'])
  assert.equal(parsed.mse, true)
  assert.equal(parsed.mii, false)
  assert.equal(parsed.l1PlusPercent, 15)
  assert.equal(parsed.quantityPercent, 25)
  assert.equal(parsed.emdRequired, true)
  assert.equal(parsed.emdAmount, 5000)
  assert.equal(parsed.epbgRequired, true)
  assert.equal(parsed.epbgPercentage, 3)
  assert.equal(parsed.epbgMonths, 14)
  assert.equal(parsed.beneficiaryName, 'Central Depot')
  assert.deepEqual(parsed.products, [
    { name: 'Surgical Mask', quantity: 25, deliveryPeriod: '30', scheduleNumber: null },
    { name: 'Gloves', quantity: 40, deliveryPeriod: '12', scheduleNumber: null },
  ])
})

test('labels match when other text precedes them on the line', () => {
  const parsed = parseBidText(`
prefix /Bid End Date/Time 08-10-2026 15:00:00
prefix /Evaluation Method Total value wise evaluation
prefix /EMD Amount 50000
prefix /MSE Purchase Preference No
Experience Criteria,Past Performance
/Document required
`)
  assert.equal(parsed.bidEnd, '08-10-2026 15:00:00')
  assert.equal(parsed.evaluationMethod, 'Total value wise evaluation')
  assert.equal(parsed.emdAmount, 50000)
  assert.equal(parsed.mse, false)
  assert.deepEqual(parsed.requiredDocumentNames, ['Experience Criteria', 'Past Performance'])
})

test('specification headings supply the product list when named blocks are absent', () => {
  const parsed = parseBidText(`
Evaluation Method Total value wise evaluation
Generic name of the product
Batch No.
Surgical Spirit 5 Litre Can
/Technical Specifications
1 Parina R stop Bangalore- 250 30
Antacid Gel 170 Ml
Content required for qualifying as Class 1 and Class 2 Local Supplier respectively)
/Technical Specifications
20 / 31
Pantoprazole 40MG
/Technical Specifications
1 Second Floor Seminary Hills 915 60
`)
  assert.deepEqual(parsed.products, [
    { name: 'Surgical Spirit 5 Litre Can', quantity: 250, deliveryPeriod: '30 days', scheduleNumber: null },
    { name: 'Antacid Gel 170 Ml', quantity: null, deliveryPeriod: null, scheduleNumber: null },
    { name: 'Pantoprazole 40MG', quantity: 915, deliveryPeriod: '60 days', scheduleNumber: null },
  ])
})

test('item-wise specification headings keep a schedule number', () => {
  const parsed = parseBidText(`
Evaluation Method Item wise evaluation
Inj Anti Snake Venom
/Technical Specifications
1 address line 100 15
Inj Anti Rabies Vaccine
/Technical Specifications
`)
  assert.deepEqual(parsed.products, [
    { name: 'Inj Anti Snake Venom', quantity: 100, deliveryPeriod: '15 days', scheduleNumber: 1 },
    { name: 'Inj Anti Rabies Vaccine', quantity: null, deliveryPeriod: null, scheduleNumber: 2 },
  ])
})

test('item-wise parse keeps one row per schedule and allows the same code twice', () => {
  const parsed = parseBidText(`
Evaluation Method Item wise evaluation
Total Quantity 9999
Schedule 1
Item Code ABC-1
Quantity 5
Delivery Period 10
Schedule 2
Item Code ABC-1
Quantity 7
Delivery Period 12
`)
  assert.deepEqual(parsed.products, [
    { name: 'ABC-1', quantity: 5, deliveryPeriod: '10', scheduleNumber: 1 },
    { name: 'ABC-1', quantity: 7, deliveryPeriod: '12', scheduleNumber: 2 },
  ])
})
