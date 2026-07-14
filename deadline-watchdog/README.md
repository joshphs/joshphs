# Deadline Watchdog

An automated agent that monitors case deadlines across every place Josh works, on a
recurring schedule, and emails a digest of what it finds.

**This is a safety net, not a docketing system.** Computed deadlines (e.g. "response due
~21 days after service") are marked UNVERIFIED until confirmed by an attorney. Never rely
on this in place of firm docketing procedures.

## Sources scanned each run

| Source | What it looks for |
|---|---|
| Outlook (jdavis@davis-lawgroup.com) | Case emails: service, hearings, motions, discovery, meet-and-confer |
| Gmail (joshphs@gmail.com) | Case-related email arriving on the personal account |
| Notion (Fellner Law Group workspace) | Meeting notes and matter pages that mention dates/deadlines |
| CourtListener / RECAP | New filings on tracked federal dockets (docket alerts) |
| Audio Transcriber | New transcripts → extract dates & deadlines mentioned aloud |

## Output

- A digest email to **joshphs@gmail.com** each run: new deadlines found, everything due in
  the next 14 days, red flags due within 7 days, and unverified items needing confirmation.
- The master registry in `registry/deadlines.json`, committed to this repo on every change.
- A per-run log in `logs/`.

## Schedule

Weekday mornings ~6:53am Pacific, via the Claude Code session scheduler.

### Limitations to know about

- The schedule lives inside the Claude session that created it. If the session/container is
  ended or reclaimed, the schedule stops — reopen the session (or start a new one) and say
  "re-arm the deadline watchdog" and it will resume from this repo's state.
- Recurring jobs auto-expire after 7 days; each run re-arms the schedule to counter this.
- Connectors (Outlook, Notion, etc.) occasionally drop mid-run. The watchdog retries, and
  any source it could not scan is named in that day's digest rather than silently skipped.

## Changing the defaults

These were set up with recommended defaults without explicit confirmation — change any of
them by telling Claude:

- **Where alerts go**: email digest → can also mirror into Todoist tasks, Google Calendar
  events, or a Notion tracker database.
- **Alert inbox**: joshphs@gmail.com → jdavis@davis-lawgroup.com, or both.
- **Cadence**: weekday mornings → twice daily, or hourly during business hours.

## Files

- `WATCHDOG.md` — the operating instructions the agent follows on every scheduled run
- `registry/cases.json` — known cases, aliases, counsel, and docket references
- `registry/deadlines.json` — the master deadline/watch-item registry
- `logs/` — one markdown log per run
