# stakeandclaim.com — recovered from Cloudflare

This folder is a **backup of code recovered directly from the live Cloudflare account**
for `stakeandclaim.com`. It was pulled on 2026-06-02 because no clean local copy of the
source could be located.

> ⚠️ **Important:** This is the *bundled/compiled* output of the live Cloudflare Worker
> (esbuild output), **not** the original clean source project. It is fully functional and
> editable, but it is one large generated file rather than the nicely-organized source you
> would normally edit. If the original source can be recovered (e.g. from the Claude
> conversation where the site was built), prefer that for ongoing development.

## What's actually hosted where

Cloudflare is doing several jobs for this site. What lives where:

| Piece | Where it lives | Recoverable from Cloudflare? |
|-------|----------------|------------------------------|
| **Domain + DNS + CDN** | Cloudflare (registrar: Cloudflare, DNS setup: Full) | n/a (config) |
| **Backend API** | Cloudflare Worker `vcx-api` | ✅ Yes — saved here as `vcx-api/index.bundled.js` |
| **User data** | Cloudflare KV: `VCX_USERS`, `VCX_IPS`, `VCX_ERRORS` | data only (not code) |
| **Database** | Cloudflare D1 (`env.DB`) | data only (not code) |
| **Payments** | Stripe (key stored as Worker secret `STRIPE_SECRET_KEY`) | n/a |
| **Frontend (the visible website)** | **NOT in the Worker** — served from the DNS origin / a separate host | ❌ Not retrievable via the Cloudflare API tools used here |

### The frontend is still missing

The `vcx-api` Worker contains **only `/api/*` routes** — there is no HTML in it. The actual
pages visitors see are served from somewhere else (whatever the root/`www` DNS record points
to — possibly a Cloudflare Pages project or an external origin). To recover the frontend:

1. In the Cloudflare dashboard, open **DNS → Records** and look at the root (`@`) and `www`
   records — the target reveals where the visible site is hosted.
2. Or recover it from the original Claude conversation where the site was built.

## Backend API surface (`vcx-api`)

The Worker exposes these endpoints (auth via `Bearer` token or `vcx_session` cookie):

- **Auth:** `/api/register`, `/api/login`, `/api/logout`, `/api/me`, `/api/rate-limit-status`
- **App:** `/api/portfolio`, `/api/calculate/scenario`, `/api/tax-rates`, `/api/suggestions`,
  `/api/activity`, `/api/usage`, `/api/proxy`
- **Messaging/support:** `/api/messages`, `/api/messages/like`, `/api/messages/reply`,
  `/api/messages/delete`, `/api/support`, `/api/support/reply`
- **Payments:** `/api/stripe/checkout`, `/api/stripe/webhook`, `/api/stripe/status`
- **Logging:** `/api/log-ip`, `/api/ip-log`, `/api/errors`, `/api/errors/recent`, `/api/health`
- **Admin:** `/api/admin/users`, `/api/admin/logins`, `/api/admin/activity`,
  `/api/admin/stats`, `/api/admin/set-subscription`, `/api/admin/set-role`,
  `/api/admin/invite-codes`

### Environment bindings the Worker expects

KV: `VCX_USERS`, `VCX_IPS`, `VCX_ERRORS` · D1: `DB` · Secrets/vars: `STRIPE_SECRET_KEY`,
`ADMIN_EMAIL`, `ADMIN_INVITE_CODE`, `TEST_INVITE_CODE`

No secrets are hardcoded in the recovered code — all sensitive values are read from these
bindings, which is why this backup is safe to keep in version control.

## How to edit & redeploy the backend

Because this is a Worker (not a static Pages site), editing it means editing the Worker
source and redeploying with Cloudflare's `wrangler` CLI (or wiring the repo up to Cloudflare's
Git integration for the Worker). A minimal local setup:

```bash
npm install -g wrangler
wrangler login
# create a wrangler.toml that declares the KV namespaces, the D1 DB, and the secrets above,
# then:
wrangler deploy
```

(The exact `wrangler.toml` bindings need to match the IDs in the Cloudflare dashboard.)
