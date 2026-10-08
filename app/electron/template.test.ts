import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fillTemplate, PLACEHOLDERS, productStarterTable, productsLine, renderTemplateDocument, templateFields, templateTokens, templateValues } from './template.js'

const company = { name: 'Acme', signatory: 'Ada', address: 'Pune', drugLicenseNumber: 'DL-1' }

function tender(products: { name: string; quantity: number | null }[]) {
  return {
    bidNumber: 'GEM/2026/B/1',
    bidEnd: null,
    offerValidity: null,
    ministryOrState: null,
    department: null,
    buyerEmail: null,
    hodEmail: null,
    evaluationMethod: null,
    beneficiaryName: null,
    emdAmount: null,
    products,
  }
}

function productGrid(body: string, products: { name: string; quantity: number | null }[]) {
  const fields = templateFields(body, templateValues(company, tender(products)))
  const field = fields.find((item) => item.key === 'productRows')
  assert.ok(field)
  return JSON.parse(field.value) as {
    columns: { key: string; label: string }[]
    rows: Record<string, string>[]
  }
}

test('suggestion chips omit buyer, evaluation, emd, and products', () => {
  const keys = PLACEHOLDERS.map((item) => item.key)
  for (const key of ['buyerEmail', 'hodEmail', 'evaluationMethod', 'emdAmount', 'products']) {
    assert.equal(keys.includes(key), false)
  }
  assert.equal(
    productStarterTable,
    [
      '| Product name | Qty | Offer price | MRP | OEM |',
      '| --- | --- | --- | --- | --- |',
      '| {{product.name}} | {{product.quantity}} | {{product.offerPrice}} | {{product.mrp}} | {{product.oem}} |',
    ].join('\n'),
  )
  const card = readFileSync(new URL('../src/components/TemplatesCard.tsx', import.meta.url), 'utf8')
  const dialog = readFileSync(new URL('../src/TemplateDialog.tsx', import.meta.url), 'utf8')
  assert.ok(card.includes(productStarterTable))
  assert.match(card, />\s*Products\s*</)
  assert.match(dialog, />\s*Add product\s*</)
  const rowStart = dialog.indexOf('parsed.rows.map')
  const removeAt = dialog.indexOf('aria-label="Remove"', rowStart)
  const inputAt = dialog.indexOf('aria-label={column.label}', rowStart)
  assert.ok(removeAt !== -1 && inputAt !== -1 && removeAt < inputAt)
})

test('template tokens keep first-seen order and skip duplicates', () => {
  assert.deepEqual(templateTokens('{{bidNumber}} and {{ companyName }} {{bidNumber}} {{note}}'), [
    'bidNumber',
    'companyName',
    'note',
  ])
})

test('fill replaces checked values and leaves other tokens', () => {
  assert.equal(
    fillTemplate('Bid {{bidNumber}} for {{companyName}}', { bidNumber: 'GEM/1' }),
    'Bid GEM/1 for {{companyName}}',
  )
})

test('fill writes an empty checked value', () => {
  assert.equal(fillTemplate('{{signatory}}', { signatory: '' }), '')
})

test('products join name and quantity', () => {
  assert.equal(
    productsLine([
      { name: 'Mask', quantity: 10 },
      { name: 'Glove', quantity: null },
    ]),
    'Mask 10; Glove',
  )
})

test('known values fill the matching tokens', () => {
  const values = templateValues(
    { name: 'Acme', signatory: 'Ada', address: 'Pune', drugLicenseNumber: 'DL-1' },
    {
      bidNumber: 'GEM/2026/B/1',
      bidEnd: '08-10-2026',
      offerValidity: '90',
      ministryOrState: 'Defence',
      department: 'Depot',
      buyerEmail: 'buyer@example.com',
      hodEmail: null,
      evaluationMethod: 'Total value',
      beneficiaryName: 'Central Depot',
      emdAmount: 5000,
      products: [{ name: 'Mask', quantity: 10 }],
    },
  )
  assert.equal(values.companyName, 'Acme')
  assert.equal(values.hodEmail, '')
  assert.equal(values.emdAmount, '5000')
  assert.equal(values.products, 'Mask 10')
  assert.deepEqual(templateFields('{{bidNumber}} {{note}}', values), [
    { key: 'bidNumber', label: 'Bid number', value: 'GEM/2026/B/1' },
    { key: 'note', label: 'note', value: '' },
  ])
})

test('markdown download keeps bold, tables, and centered html', () => {
  const document = renderTemplateDocument(
    '<p align="center"><u><strong>CERTIFICATE</strong></u></p>\n\n**{{companyName}}**\n\n| Item | Qty |\n| --- | --- |\n| Mask | 10 |',
    { companyName: 'A * B <C>' },
  )
  assert.match(document, /align="center"/)
  assert.match(document, /<u>/)
  assert.match(document, /<strong>CERTIFICATE<\/strong>/)
  assert.match(document, /<strong>A \* B &lt;C&gt;<\/strong>/)
  assert.match(document, /<table>/)
  assert.doesNotMatch(document, /<em>/)
})

test('preview leaves placeholders when no bid is chosen', () => {
  const document = renderTemplateDocument('Bid {{bidNumber}}', {})
  assert.match(document, /\{\{bidNumber\}\}/)
})

test('a plain template downloads as paragraphs', () => {
  const document = renderTemplateDocument('Hello {{bidNumber}}', { bidNumber: 'GEM/1' })
  assert.match(document, /<p>Hello GEM\/1<\/p>/)
})

test('starter table prefills name and quantity and leaves other cells empty', () => {
  const grid = productGrid(productStarterTable, [
    { name: 'Mask', quantity: 10 },
    { name: 'Glove', quantity: null },
  ])
  assert.deepEqual(
    grid.columns.map((column) => column.label),
    ['Product name', 'Qty', 'Offer price', 'MRP', 'OEM'],
  )
  assert.deepEqual(grid.rows, [
    { name: 'Mask', quantity: '10', offerPrice: '', mrp: '', oem: '' },
    { name: 'Glove', quantity: '', offerPrice: '', mrp: '', oem: '' },
  ])
})

test('a blank product name still gets a row', () => {
  const grid = productGrid(productStarterTable, [
    { name: '', quantity: 2 },
    { name: 'Mask', quantity: 1 },
  ])
  assert.equal(grid.rows.length, 2)
  assert.equal(grid.rows[0]?.name, '')
  assert.equal(grid.rows[0]?.quantity, '2')
})

test('a custom product column starts empty', () => {
  const body = `| Product name | Note |
| --- | --- |
| {{product.name}} | {{product.note}} |`
  const grid = productGrid(body, [{ name: 'Mask', quantity: 10 }])
  assert.deepEqual(grid.columns, [
    { key: 'name', label: 'Product name' },
    { key: 'note', label: 'Note' },
  ])
  assert.deepEqual(grid.rows, [{ name: 'Mask', note: '' }])
})

test('edited product rows are what the word file uses', () => {
  const grid = productGrid(productStarterTable, [
    { name: 'Mask', quantity: 10 },
    { name: 'Glove', quantity: null },
  ])
  grid.rows[0] = { ...grid.rows[0], name: 'Mask plus', offerPrice: '15' }
  const document = renderTemplateDocument(productStarterTable, { productRows: JSON.stringify(grid) })
  assert.match(document, /Mask plus/)
  assert.match(document, />15</)
  assert.match(document, /Glove/)
})

test('removing a row and adding a blank row changes only the document', () => {
  const products = [
    { name: 'Mask', quantity: 10 },
    { name: 'Glove', quantity: null },
  ]
  const source = tender(products)
  const fields = templateFields(productStarterTable, templateValues(company, source))
  const field = fields.find((item) => item.key === 'productRows')
  assert.ok(field)
  const grid = JSON.parse(field.value) as { rows: Record<string, string>[] }
  assert.deepEqual(source.products, products)
  grid.rows = [grid.rows[0], { name: '', quantity: '', offerPrice: '', mrp: '', oem: '' }]
  const document = renderTemplateDocument(productStarterTable, {
    productRows: JSON.stringify(grid),
    products: productsLine(source.products),
  })
  assert.match(document, /Mask/)
  assert.doesNotMatch(document, /Glove/)
  assert.equal(document.match(/<td[\s>]/g)?.length, 10)
  assert.equal(productsLine(source.products), 'Mask 10; Glove')
})

test('a tender with no products leaves the table header and no body cells', () => {
  const grid = productGrid(productStarterTable, [])
  assert.equal(grid.columns.length, 5)
  assert.deepEqual(grid.rows, [])
  const document = renderTemplateDocument(productStarterTable, { productRows: JSON.stringify(grid) })
  assert.match(document, /<th>Product name<\/th>/)
  assert.equal(document.match(/<td[\s>]/g), null)
})

test('a scalar cell still fills inside a product table', () => {
  const body = `| {{bidNumber}} | Product name |
| --- | --- |
| {{bidNumber}} | {{product.name}} |`
  const document = renderTemplateDocument(body, {
    bidNumber: 'GEM/9',
    productRows: JSON.stringify({
      columns: [{ key: 'name', label: 'Product name' }],
      rows: [{ name: 'Mask' }, { name: 'Glove' }],
    }),
  })
  assert.equal(document.match(/GEM\/9/g)?.length, 3)
  assert.match(document, /Mask/)
  assert.match(document, /Glove/)
})

test('two product tables share rows and print their own columns', () => {
  const body = `| Product name | Qty |
| --- | --- |
| {{product.name}} | {{product.quantity}} |

| Item | OEM |
| --- | --- |
| {{product.name}} | {{product.oem}} |`
  const grid = productGrid(body, [{ name: 'Mask', quantity: 10 }])
  assert.deepEqual(grid.columns, [
    { key: 'name', label: 'Product name' },
    { key: 'quantity', label: 'Qty' },
    { key: 'oem', label: 'OEM' },
  ])
  assert.deepEqual(grid.rows, [{ name: 'Mask', quantity: '10', oem: '' }])
  grid.rows[0] = { ...grid.rows[0], oem: 'Acme' }
  const document = renderTemplateDocument(body, { productRows: JSON.stringify(grid) })
  const tables = document.match(/<table>[\s\S]*?<\/table>/g)
  assert.equal(tables?.length, 2)
  const [first, second] = tables ?? []
  assert.match(first ?? '', /<th>Product name<\/th>/)
  assert.match(first ?? '', /<th>Qty<\/th>/)
  assert.doesNotMatch(first ?? '', /OEM/)
  assert.match(first ?? '', /Mask/)
  assert.match(first ?? '', />10</)
  assert.match(second ?? '', /<th>Item<\/th>/)
  assert.match(second ?? '', /<th>OEM<\/th>/)
  assert.doesNotMatch(second ?? '', /Qty/)
  assert.match(second ?? '', /Mask/)
  assert.match(second ?? '', /Acme/)
})

test('products line still fills when the template has no pattern row', () => {
  const document = renderTemplateDocument('Items {{products}}', { products: 'Mask 10; Glove' })
  assert.match(document, /Mask 10; Glove/)
  assert.doesNotMatch(document, /\{\{products\}\}/)
})

test('a cell with a pipe or markup stays text inside the table', () => {
  const document = renderTemplateDocument(productStarterTable, {
    productRows: JSON.stringify({
      columns: [
        { key: 'name', label: 'Product name' },
        { key: 'quantity', label: 'Qty' },
        { key: 'offerPrice', label: 'Offer price' },
        { key: 'mrp', label: 'MRP' },
        { key: 'oem', label: 'OEM' },
      ],
      rows: [{ name: 'A | B <b>bold</b>', quantity: '1', offerPrice: '', mrp: '', oem: '' }],
    }),
  })
  assert.match(document, /A \| B &lt;b&gt;bold&lt;\/b&gt;/)
  assert.doesNotMatch(document, /<b>/)
  assert.equal(document.match(/<td[\s>]/g)?.length, 5)
  assert.equal(document.match(/<th[\s>]/g)?.length, 5)
})

test('settings preview leaves product tokens when no bid is chosen', () => {
  const document = renderTemplateDocument(productStarterTable, {})
  assert.match(document, /\{\{product\.name\}\}/)
  assert.match(document, /\{\{product\.offerPrice\}\}/)
  assert.match(document, /\{\{product\.oem\}\}/)
})
