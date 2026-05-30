# Running the Inbox Triage Agent

This agent runs *inside a Claude session* that has the Gmail, Google Calendar,
and Todoist connectors authorized. It is not a standalone script — the
connectors live in the Claude harness, so Claude is the runtime.

## One-off run

In a session, say:

> Run the inbox triage agent (inbox-agent/AGENT.md).

Claude will execute the full procedure and return the digest.

## Twice-daily schedule (the chosen cadence)

The cadence you picked is **twice a day, ~7:30am and ~4:30pm America/Los_Angeles**.
Two ways to get there:

### Option A — `/loop` (works today, session-bound)
In an active session run:

> /loop 12h Run the inbox triage agent in inbox-agent/AGENT.md and send me the digest.

This re-runs every 12 hours while the session is alive. Because these cloud
containers are ephemeral, the loop stops when the session ends — best for a
day where you keep a session open. Start it twice (morning/evening) or use a
shorter interval if you want tighter coverage.

### Option B — Scheduled triggers (durable)
Use Claude Code on the web **scheduled sessions / triggers** to start a fresh
session at 7:30am and 4:30pm that runs this agent. This survives container
recycling because each run is a new session. Configure two triggers pointing
at the prompt:

> Run the inbox triage agent described in inbox-agent/AGENT.md.

See https://code.claude.com/docs/en/claude-code-on-the-web for trigger setup.

## Required connectors

| Connector       | Used for                                  |
| --------------- | ----------------------------------------- |
| Gmail           | read inbox, create drafts, apply labels   |
| Google Calendar | cross-check events (corroborate/conflict) |
| Todoist         | push action items                         |

If Gmail shows "requires re-authorization", reconnect it in the web app's
connector settings, then re-run. Calendar and Todoist auth independently.

## Notes from the first live run (2026-05-30)

- 26 unread threads scanned; only 3 were actionable — the rest promos/social.
- Calendar corroborated the Mattress Firm email against a "Mattress delivery"
  event the same day → escalated to P1.
- Every actionable sender was a `no-reply@` address, so no drafts were needed
  that run (correct behavior, not a miss).
- Todoist tasks were created successfully; Gmail label/draft writes were
  blocked by an expired Gmail token (reconnect and re-run to finish those).
