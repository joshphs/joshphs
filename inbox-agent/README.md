# inbox-agent

A personal **email triage agent** across multiple mailboxes (Gmail +
Outlook work mail). Twice a day it reads the unread inboxes, summarizes them,
builds one unified priority list, drafts replies to real person-to-person mail,
pushes action items to Todoist, cross-checks Google + Outlook calendars, and
labels threads `Act` / `Review` in Gmail.

See [`AGENT.md`](./AGENT.md) for the per-account capability matrix — notably the
Microsoft/Outlook connector is **read-only**, so on work mail the agent proposes
draft text and flags triage in the digest instead of writing into Outlook.

For the **multi-firm Outlook setup** (davis-lawgroup + dlhalaw + fellner), the
managed M365 connector only holds one account and can't be duplicated, so those
mailboxes run from the **Claude Desktop app** driving Outlook directly. That
handoff — cadence, "nothing missed" logic, priority/checklist format, and a
kick-off prompt for a fresh session — lives in [`DESKTOP.md`](./DESKTOP.md).

- **What it does & the rules it follows:** [`AGENT.md`](./AGENT.md)
- **How to run it (and the twice-daily schedule):** [`RUN.md`](./RUN.md)

It runs inside a Claude session using the Gmail, Calendar, and Todoist
connectors — Claude is the runtime, so there is no server to deploy. Drafts are
created but **never sent**; the inbox is otherwise read-only (plus the two
triage labels).

## Quick start

In a session with those connectors authorized:

> Run the inbox triage agent in inbox-agent/AGENT.md.

To schedule:

> /loop 12h Run the inbox triage agent in inbox-agent/AGENT.md and send me the digest.

(or set up morning/evening scheduled triggers — see `RUN.md`).
