# inbox-agent

A personal **email triage agent**. Twice a day it reads the unread inbox,
summarizes it, builds a priority list, drafts replies to real person-to-person
mail, pushes action items to Todoist, cross-checks Google Calendar, and labels
threads `Act` / `Review` in Gmail.

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
