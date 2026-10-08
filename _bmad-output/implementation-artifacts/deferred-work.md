- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-gem-tender-panel.md`
  summary: Accounts and row-level security are not in this build.
  evidence: The app uses the service key in the main process. Login and billing were left out of the PRD.

- source_spec: `/Users/ashishgupta/Documents/gem-panel2/_bmad-output/implementation-artifacts/spec-gem-tender-panel.md`
  summary: No timing test for the no-pause fetch rule.
  evidence: The overlap test and a source check cover it. A sleep-based assertion would be brittle.
