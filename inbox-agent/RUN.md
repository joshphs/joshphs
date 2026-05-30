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

| Connector       | Used for                                       | Notes                |
| --------------- | ---------------------------------------------- | -------------------- |
| Gmail           | read inbox, create drafts, apply labels        | full read + write    |
| Google Calendar | cross-check events (corroborate/conflict)      | read                 |
| Microsoft/Outlook | read davis-lawgroup mail + calendar          | **read-only**        |
| Todoist         | push action items                              | write                |

If Gmail shows "requires re-authorization", reconnect it in the web app's
connector settings, then re-run. Each connector authorizes independently.

## Adding the other work mailboxes (dlhalaw, fellner)

The Microsoft/Outlook connector signs into **one** Microsoft 365 tenant — it is
currently authenticated as `jdavis@davis-lawgroup.com`. `josh@dlhalaw.com` and
`jdavis@fellnerlawgroup.com` live in **separate organizations**, so the same
connector returns `ErrorInvalidUser` for them. Two ways to bring them in:

### Option 1 — Connect each as its own connector (best fidelity)
1. In the **Claude web app → Settings → Connectors** (the same place Gmail/
   Outlook/Todoist were added), add the Microsoft/Outlook connector again and
   complete OAuth signed in as **josh@dlhalaw.com**; repeat for
   **jdavis@fellnerlawgroup.com**.
2. If the directory connector only holds one account, add the others via
   **"Add custom connector"** using the same Microsoft MCP server URL — each
   instance carries its own login.
3. Ask in-session: *"probe the dlhalaw / fellner mailbox"* and the agent will
   re-run the access test (an `outlook_email_search`) to confirm before relying
   on it. Then add them to the `Accounts` table in `AGENT.md`.

> Note: cross-tenant **delegate/shared-mailbox** access (`mailboxOwnerEmail`)
> only works *within* a tenant, so it cannot bridge davis-lawgroup → dlhalaw or
> fellner. Each truly needs its own login.

### Option 2 — Forward into Gmail (no extra connector)
Set a server-side rule at dlhalaw and fellner to forward/redirect incoming mail
to `joshphs@gmail.com`. The agent then catches them in the Gmail scan with zero
extra setup. Trade-off: triage, drafts, and labels all live in Gmail, and
replies send from Gmail unless you switch the "from" address.

> Either way, the Outlook connector stays **read-only** — on any Microsoft
> mailbox the agent proposes draft text and flags triage in the digest rather
> than writing drafts or categories into Outlook.

## Notes from the first live run (2026-05-30)

- 26 unread threads scanned; only 3 were actionable — the rest promos/social.
- Calendar corroborated the Mattress Firm email against a "Mattress delivery"
  event the same day → escalated to P1.
- Every actionable sender was a `no-reply@` address, so no drafts were needed
  that run (correct behavior, not a miss).
- Todoist tasks were created successfully; Gmail label/draft writes were
  blocked by an expired Gmail token (reconnect and re-run to finish those).
