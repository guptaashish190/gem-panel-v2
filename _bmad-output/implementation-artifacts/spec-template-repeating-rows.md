---
title: 'Repeating product rows in template tables'
type: 'feature'
created: '2026-10-08'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 39009abfd88f06e077b0fbe7a1ea2e38945a6862
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A template can include a Markdown table, and a placeholder can fill one cell, but a product list cannot grow one row per product. `{{products}}` is a single line (`Mask 10; Glove`) and is not offered as a chip. Offer price, MRP, and OEM are not stored on the product.

**Approach:** A Markdown table whose body row uses `{{product.field}}` tokens is a repeating row. Prepare copies one row per product on the tender, prefills name and quantity, and leaves every other column empty. The user can edit any cell and add or remove rows for that document. The Products chip inserts a starter table. Columns stay in the template.

## Boundaries & Constraints

**Always:**
- The pattern is a Markdown table: header row, a `| --- |` separator, then one body row of `{{product.field}}` tokens. Column headers are the header cells the user wrote. Field names are the tokens in that body row.
- Name and quantity are the only prefilled cells. Quantity is blank when the tender has no quantity. Offer price, MRP, OEM, delivery period, schedule number, and any other `{{product.field}}` start empty.
- Every cell is editable. Add product appends a blank row. Remove drops that row. Both affect this document only. The tender's stored products stay as they were.
- Preview, download, and save write the rows still on screen, in that order, into every product pattern table in the template. One shared row list. The prepare grid's columns are the first-seen fields; each table still prints only its own columns.
- A scalar placeholder such as `{{bidNumber}}` inside any cell still fills as one value. Settings preview, with no bid, leaves `{{product.field}}` tokens in place.
- The existing `{{products}}` line fill stays for a template that already uses it. It is not a chip.
- The Products chip inserts this starter table:

```markdown
| Product name | Qty | Offer price | MRP | OEM |
| --- | --- | --- | --- | --- |
| {{product.name}} | {{product.quantity}} | {{product.offerPrice}} | {{product.mrp}} | {{product.oem}} |
```

- Screen words are Products and Add product. Each prepare row starts with a delete icon labeled Remove. Cell text is escaped so a name cannot break the table or inject markup.

**Never:**
- Do not add or remove columns on prepare. Do not write offer price, MRP, OEM, or edited rows back onto the tender.
- Do not add a second repeating list. `product` is the only list name.
- Do not drop a stored product because its name is blank. Do not change fetch, parse, or the product columns in the database.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Starter table | Products chip in Settings | Inserts the five-column table at the cursor | N/A |
| Prefill | Tender products Mask qty 10 and Glove qty empty; template has the starter table | Two rows. Name and qty filled. Offer price, MRP, and OEM empty | N/A |
| Edit | User types an offer price and changes a name | Word file uses the edited cells | N/A |
| Add and remove | User removes Glove and adds a blank row | Document has the remaining tender row plus one empty row. Tender products unchanged | N/A |
| No products | Tender has no products | Header only, plus Add product | N/A |
| Custom column | Body row also has `{{product.note}}` | Prepare shows that column empty and editable | N/A |
| Scalar cell | Header or another table cell is `{{bidNumber}}` | That cell fills with the bid number | N/A |
| Two product tables | Template has two pattern tables with different columns | Both tables use the same rows. Each prints its own columns | N/A |
| Old token | Body contains `{{products}}` and no pattern row | Still fills `Name qty; Name` | N/A |
| Unsafe cell | Product name contains `\|` or `<` | Table shape holds. Markup is shown as text | N/A |

</frozen-after-approval>

## Code Map

- `app/electron/template.ts` — `tokenPattern` rejects dotted names. `templateFields` emits one text field per token. `renderTemplateDocument` lifts tokens, runs `marked`, then `htmlText`. Expand pattern rows into sentinel cells before `marked`. Keep `productsLine`.
- `app/electron/template.test.ts` — the chip test omits `products`. Extend it. Keep the line-fill test.
- `app/electron/main.ts` — `templateValuesOf` accepts an alphanumeric string key. Carry the rows as one string, `productRows`. No new IPC.
- `app/electron/store.ts` — `previewTemplate` already calls `templateFields` and `templateValues`. Products already have `name` and `quantity`. Do not change store or schema.
- `app/src/TemplateDialog.tsx` — one input per field. `productRows` becomes the grid, Add product, and Remove.
- `app/src/components/TemplatesCard.tsx` — `insertToken` inserts `{{key}}`. The Products chip inserts the starter table. Other chips stay tokens.
- `app/src/panel.d.ts`, `app/electron/types.ts`, `app/electron/preload.cts` — `TemplateField` stays `{ key, label, value }`.
- `app/src/app.css` — reuse `.table-scroll`. The grid spans the form. Inputs in it stay inside their cells.

## Tasks & Acceptance

**Execution:**
- [ ] `app/electron/template.ts` — accept `{{product.field}}`, build one `productRows` value from the pattern tables and the tender, expand those rows before Markdown, and keep `{{products}}` — one list fills every pattern table.
- [ ] `app/electron/template.test.ts` — cover prefill, a custom column, add/remove via the row JSON, a scalar cell, the old `{{products}}` line, an empty product list, and a cell that contains `|` or `<`.
- [ ] `app/src/components/TemplatesCard.tsx` — Products chip inserts the starter table at the cursor.
- [ ] `app/src/TemplateDialog.tsx` — show the shared grid, edit every cell, add a blank row, and remove a row. Preview, download, and save send the rows on screen.
- [ ] `app/src/app.css` — make the prepare grid readable inside the dialog.

**Acceptance Criteria:**
- Given a saved template with the starter table, when Prepare opens for a tender, then each stored product is a row with name and quantity filled and offer price, MRP, and OEM empty.
- Given that grid, when the user edits a cell, adds a row, and removes a row, then preview and the saved document show those rows and the tender's products are unchanged.
- Given Settings, when the user clicks Products, then the starter table is inserted into the template text.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

`productRows` is JSON on the existing string field: `{ "columns": [{ "key": "name", "label": "Product name" }], "rows": [{ "name": "Mask", "quantity": "10", "offerPrice": "" }] }`. The dialog edits that JSON. Render looks up each pattern cell by field key.

A pattern row is the body line after a Markdown separator that contains `{{product.field}}`. The token is `product`, one dot, then a field of letters and digits. Replace that line with one sentinel row per data row, then run the current `marked` and `htmlText` path.

## Verification

**Commands:**
- `npm test` in `app/` — expected: template tests pass, including the new row cases
- `npm run typecheck` in `app/` — expected: exit 0
