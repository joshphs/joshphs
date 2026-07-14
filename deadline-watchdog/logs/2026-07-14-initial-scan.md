# Initial scan — 2026-07-14 (setup session)

Seed scan performed during watchdog setup. Sources covered: Outlook (davis-lawgroup),
Gmail, Notion, Todoist, Audio Transcriber. CourtListener docket lookup pending (connector
was unstable during setup; first scheduled run should complete it — see WATCHDOG.md §1.4).

## Findings

- **Orlean v. Reiland, et al.** (Josh = defendant, unserved as of 6/26): removed to federal
  court 6/12; service documents circulated 6/26 (POS re removal, ADR notice, magistrate
  consent notice, assignment notice, interested-parties cert, Motion to Dismiss or Change
  Venue + proposed order). Meet-and-confer re venue sent by Hal Reiland to Fred Knez 6/26.
  → 4 registry items created (1 service watch, 2 needs-date, 1 meet-and-confer watch).
- **Fellner (Notion)**: 5/5 POD meeting discussed a sanction equal to estimated tax on
  $550,000; matter name and any deadline not yet identified. → 1 watch item.
- Gmail: no case-related deadline mail in the last 60 days.
- Todoist: empty (Inbox only) — not currently a deadline source.
- Audio Transcriber: no cases/transcripts registered yet.

## Open setup items (first scheduled run should complete)

1. Find the federal docket on CourtListener (q: "Orlean"), record docket id in
   `cases.json`, and `subscribe_to_docket_alert`.
2. Extract hearing date from the venue-motion notice PDF and the magistrate-consent
   deadline from its notice (both are Outlook attachments on the 6/26 Knez email).
