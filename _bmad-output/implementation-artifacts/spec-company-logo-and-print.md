---
title: 'Company logo placeholder and template printing'
type: 'feature'
created: '2026-10-09'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 042ee4c7188d824b89f6f7196804c784a1fbaaae
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Letterheads need the company logo, but templates can only hold text values, so users cannot put a logo on generated documents. Users also cannot print a filled template directly from Prepare.

**Approach:** Settings → Company gets a logo upload stored with the company row. Templates use `{{logo}}`, which renders as the image in preview, saved/downloaded documents and print. Prepare gets a Print button that opens the system print dialog for the filled document.

## Boundaries & Constraints

**Always:**
- Logo is PNG or JPEG, at most 500 KB, stored as a `data:image/png|jpeg;base64,...` string in a new `company.logo` text column (default `''`). Saved with the existing Company Save, removable.
- Main validates the logo on save (type prefix, base64 alphabet only, length cap) and refuses the whole save when invalid.
- `{{logo}}` is a built-in placeholder chip (label Company logo), reserved like other built-ins.
- `{{logo}}` renders as `<img>` from the company record loaded in main; never from renderer-sent values. Empty logo renders nothing.
- Settings preview (no bid) leaves `{{logo}}` as text, like other tokens.
- Prepare never shows `logo` as an editable field.
- Print renders the same document as Download (same values), in a hidden window, and opens the native print dialog. Cancel is silent; failure shows a notice.
- If the `logo` column is missing, templates still render (logo empty).

**Never:**
- No change to `.doc` output format or to other placeholders' escaping.
- No logo upload to Storage bucket; no new table.
- No silent printing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload | 120 KB PNG | Preview shows; Save stores it | N/A |
| Too big / wrong type | 2 MB PNG, or GIF | Not applied | Notice: Use a PNG or JPEG under 500 KB. |
| Render | Template `{{logo}}`, logo set | `<img src="data:image/png;base64,...">` in output | N/A |
| No logo | Logo empty | Token disappears | N/A |
| Forged value | Renderer sends `logo: "<script>"` | Ignored; company logo used | N/A |
| Bad stored logo | Column holds non-data-URL text | Token renders nothing | N/A |
| Print | Click Print in Prepare | System print dialog with filled A4 document | Failure → Could not print that document. |

</frozen-after-approval>

## Code Map

- `supabase/schema.sql` -- add `alter table company add column if not exists logo text not null default '';` after the `fields` alter.
- `app/electron/types.ts`, `app/src/panel.d.ts` -- `CompanyFields` gains `logo: string`; add `TemplatePrint = 'printed' | 'cancelled' | 'failed'`; `PanelApi.printTemplate(id, values)`.
- `app/electron/template.ts` -- add `{ key: 'logo', label: 'Company logo' }` to `PLACEHOLDERS`; export `isLogoData(value)` (regex + length ≤ 700 000). `renderTemplateDocument(body, values, logo?)`: when `logo` is a string, `{{logo}}` → `<img>` if valid else `''`; when undefined, token stays. Escape slot text at push time so the logo slot can hold raw HTML. `templateFields` drops `logo`. `templateValues` does not emit `logo`.
- `app/electron/store.ts` -- `loadCompany` returns `logo` (tolerant: `''` when absent/invalid); `saveCompany` upserts `logo`; new `companyLogo(client)` selects only `logo`, returns `''` on error or invalid.
- `app/electron/main.ts` -- `companyFieldsOf` validates `logo` via `isLogoData` (or `''`). `render-template`, `save-template-document`, `download-template` pass `await store.companyLogo(db)` to `renderTemplateDocument`. New `print-template` handler: render, write to temp `.html`, load in hidden `BrowserWindow` (no preload, `javascript: false`), `webContents.print({}, cb)`, close window and delete temp file.
- `app/electron/preload.cts` -- expose `printTemplate`.
- `app/src/SettingsPanel.tsx` -- add `'logo'` to local `RESERVED_KEYS`; logo row in Company form: preview `<img>`, Upload/Replace (reuse `FileButton`, `accept` png/jpeg), Remove; read via `FileReader.readAsDataURL`; include `logo` in Save.
- `app/src/TemplateDialog.tsx` -- Print button between Preview and Download, same busy/ready rules.
- `app/src/app.css` -- small `.logo-preview` rule only.
- `app/electron/template.test.ts` -- company fixtures gain `logo: ''`.
- Do not touch: `TemplatePreview.tsx` (sandboxed iframe already shows data-URL images), `expandPatternRows` behavior.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/schema.sql` -- add `logo` column -- storage.
- [x] `app/electron/types.ts`, `app/src/panel.d.ts` -- `logo`, `TemplatePrint`, `printTemplate` -- shared shape.
- [x] `app/electron/template.ts` -- placeholder, `isLogoData`, logo rendering, field filter -- render path.
- [x] `app/electron/store.ts` -- load/save `logo`, `companyLogo` -- persistence.
- [x] `app/electron/main.ts`, `app/electron/preload.cts` -- validation, logo into renders, `print-template` -- IPC.
- [x] `app/src/SettingsPanel.tsx`, `app/src/TemplateDialog.tsx`, `app/src/app.css` -- upload UI, Print button -- UI.
- [x] `app/electron/template.test.ts` -- matrix rows: render, empty, forged value, bad stored value, settings preview keeps token, field filtered, `isLogoData` accepts/rejects.

**Acceptance Criteria:**
- Given a saved logo, when the app restarts, then Settings shows the logo preview.
- Given a template with `{{logo}}`, when Save to document or Download runs, then the `.doc` file contains the logo `<img>`.
- Given the Prepare dialog, when the user clicks Print and cancels, then no notice appears and the dialog stays open.

## Implementation Notes

- Slot text is escaped when it is pushed, not when it is filled, so `{{logo}}` can insert a raw `<img>` while every other value still goes through `htmlText`. Existing markup tests still pass.
- Print treats a failure reason matching `/cancel/i` as cancelled, so both "cancelled" and "canceled" stay silent.
- The Settings screen checks file type, the 500 KB limit, and the data-URL shape before showing a preview. Main refuses the whole save when `logo` is not `isLogoData` or empty.

## Spec Change Log

## Review Triage Log

## Design Notes

Logo comes from main, not from Prepare values, so a multi-hundred-KB string never round-trips through IPC fields and a renderer cannot inject HTML through it. Rendered tag: `<img src="DATA" alt="Company logo" height="80" style="height:80px;width:auto">` — the `height` attribute is what Word honours. Template usage: `<p align="center">{{logo}}</p>`.

## Verification

**Commands:**
- `npm test` in `app/` -- expected: all tests pass
- `npm run typecheck` in `app/` -- expected: exit 0

**Manual checks:**
- Run the `schema.sql` alter in Supabase, upload a logo, add `{{logo}}` to a template, Prepare → Preview, Download (open in Word), Print.
