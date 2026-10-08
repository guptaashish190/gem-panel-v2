import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fillTemplate, PLACEHOLDERS, productsLine, renderTemplateDocument, templateFields, templateTokens, templateValues } from './template.js'

test('suggestion chips omit buyer, evaluation, emd, and products', () => {
  const keys = PLACEHOLDERS.map((item) => item.key)
  for (const key of ['buyerEmail', 'hodEmail', 'evaluationMethod', 'emdAmount', 'products']) {
    assert.equal(keys.includes(key), false)
  }
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
