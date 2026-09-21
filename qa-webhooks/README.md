# ConvoFlow QA — webhooks (step 1)

This is the smallest possible project that gets you a **public URL on Vercel**
so VAPI and WhatsApp have somewhere real to send events. It doesn't do any
analysis or ticket creation yet — that's step 2 onward. Right now it just
proves the wiring works end to end.

## What's in here

- `api/webhook-vapi.js` — VAPI will POST here after every call ends.
- `api/webhook-whatsapp.js` — Meta will call this to verify the webhook (GET),
  then POST message events here.
- `api/tickets.js` — placeholder, returns an empty list for now.
- `public/index.html` — a status page so you can confirm the deploy is live.

## 1. Deploy it

1. Push this folder to a new GitHub repo (or use Vercel's CLI / drag-and-drop
   deploy if you don't want to touch git yet).
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. In **Project Settings → Environment Variables**, add:
   - `WHATSAPP_VERIFY_TOKEN` — make up any random string, e.g. `convoflow-2026`
4. Deploy. Vercel gives you a URL like `https://your-project.vercel.app`.
5. Visit that URL — you should see the "Deployment is live" status page.

## 2. Point VAPI at it

In your VAPI assistant settings, set the **Server URL** to:

```
https://your-project.vercel.app/api/webhook-vapi
```

Make a test call through VAPI, then check **Vercel → your project →
Deployments → Functions logs** — you should see the full event payload
printed there.

## 3. Point WhatsApp at it

In Meta's App Dashboard → WhatsApp → Configuration → Webhook:

- **Callback URL:** `https://your-project.vercel.app/api/webhook-whatsapp`
- **Verify token:** the exact same string you set as `WHATSAPP_VERIFY_TOKEN`
  in Vercel.

Meta will send a GET request to confirm the token matches before it lets
you save the subscription — that's the handshake `webhook-whatsapp.js`
already handles. Then subscribe to the `messages` field. Send a test
WhatsApp message and check the same Functions logs.

## What's next (one at a time)

Once both webhooks show real payloads in the logs, we'll add, in order:

1. A real place to store tickets (so they survive between requests).
2. Logic that pulls the transcript out of each payload and compares it
   against the expected scenario script.
3. Ticket creation when something doesn't match, wired into the format the
   dashboard already expects.
4. Pointing the dashboard's "Tickets" view at this API instead of its
   in-memory demo data.
