- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-gem-tender-panel.md`
  summary: Accounts and row-level security are not in this build.
  evidence: The app uses the service key in the main process. Login and billing were left out of the PRD.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-gem-tender-panel.md`
  summary: No timing test for the no-pause fetch rule.
  evidence: The overlap test and a source check cover it. A sleep-based assertion would be brittle.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: The PDF parser keeps the first label match on a line and never replaces that field.
  evidence: `matchLabel` in `app/electron/parse.ts` uses `indexOf` and `parseBidText` skips a key already in `found`. A passing phrase can lock EMD or documents before the real line.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: An empty "document required" value is filled from the lines above it.
  evidence: `parseBidText` walks previous lines when the documents label has no remainder, so names printed under the heading can be missed.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: Specification headings can replace the labeled product list and misread quantity.
  evidence: `parseBidText` uses specification blocks when they return more rows, numbers item-wise schedules as 1..n, and takes the first line ending in two integers within 25 lines as quantity and days.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: Startup repair can rewrite the same bids on every launch and drop their products if the rewrite fails.
  evidence: `repairParsed` has no completed mark. `fillParsed` deletes products before inserting replacements, and a failed insert is swallowed.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: Each new tender row restats the whole library.
  evidence: `tender-row` refreshes the visible list and three count queries, and each list stats the GeM PDF for every row.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: A failed download is not tried again in the same search, and a listing error has no message.
  evidence: `searchKeyword` adds the bid to `seen` before ingest, and a `listPage` throw ends the loop with no status text.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: A rejected fetch call can leave the Fetch button disabled.
  evidence: `onFetch` sets fetching true and only clears it when the invoke returns `{ started: false }` or `fetch-done` fires.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: Opening a local file can pick the wrong sibling and a bid folder named `..` leaves the data root.
  evidence: `localDocumentPath` returns the first `readdir` name equal to the base or starting with `base.`. `bidDirName` only replaces slashes, so `path.join` with `..` climbs out of the data root.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: Evaluation and EMD filters do not cover every stored value, and the detail MSE tile drops the list's percents.
  evidence: Evaluation options are only "Item wise" and "Total Value wise". EMD options are one checkbox per rounded amount. The detail MSE stat uses yes/no only.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-fetch-tender-status.md`
  summary: A saved bid with no local PDF loses its saved color, and product rows use the list pointer.
  evidence: `tbody tr.warn` is declared after `tbody tr.saved`, so the warning background wins. `tbody tr { cursor: pointer }` also applies to product and document tables.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-custom-company-fields.md`
  summary: The old-database company load (`select('*')` with no `fields` column) has no test that runs the query.
  evidence: Only `storedCompanyFields` is tested; naming `fields` in the select still passes all tests. Needs a fake Supabase client.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-custom-company-fields.md`
  summary: Settings add-field refusals (clash, duplicate, no key) are only checked by source-text tests, and `fieldKey`/reserved keys are copied into the renderer.
  evidence: Deleting the `taken.some(...)` check in `SettingsPanel.tsx` still passes; a shared renderer-and-electron module would let one tested function serve both.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-settings-preview-company-values.md`
  summary: Older specs still say Settings preview leaves company, custom, and logo tokens unfilled.
  evidence: `spec-custom-company-fields.md` and `spec-company-logo-and-print.md` (frozen blocks) still require leaving those tokens; this change supersedes that behavior but must not edit their frozen intent.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-settings-preview-company-values.md`
  summary: No automated test covers the `preview-template-text` IPC wiring through `loadCompany`.
  evidence: Unit tests exercise `companyValues` + `renderTemplateDocument` only; other IPC handlers in main follow the same untested pattern.
