# CareReach: WhatsApp patient messaging

Upload a patient sheet, pick an approved WhatsApp template, and CareReach messages every patient one by one,
tracks delivered / failed / not-on-WhatsApp, stores every reply, and (optionally) lets an AI agent answer patients safely.

| Folder | What it is |
| --- | --- |
| `app/` | The app (Expo / React Native: web, iOS, Android). Sign-in, screens, live data from Firestore. |
| `functions/` | The backend (Firebase Cloud Functions, TypeScript). Sending, webhook, AI agent, validation. |
| `firestore.rules`, `firestore.indexes.json` | Database security rules and indexes. |
| `index.html`, `app.js`, `styles.css` | Old plain-JS prototype, kept for reference only. |

## How it works

```
Settings ─ upload sheet ─▶ importSheetFn ─▶ contacts (one per phone number)
                                │
                                └▶ campaign + one queued message per contact ─▶ Cloud Tasks queue
                                                                                    │ (one task per message, spaced by "messages/minute")
                                                                                    ▼
                                         sendMessageTask ─▶ WhatsApp Cloud API ─▶ message = sent / failed / not_on_whatsapp
                                                                                    ▲
Meta ─▶ whatsappWebhook ─▶ delivery receipts (delivered / read / failed) ───────────┘
              └▶ patient replies ─▶ messages + contact (unread) ─▶ [Agent mode] agentReplyTask ─▶ AI ─▶ WhatsApp reply
```

The app never talks to WhatsApp or the AI. It only reads Firestore (live) and calls the backend functions.
WhatsApp tokens and AI keys live in `users/{uid}/private/secrets`, which the app can never read (rules deny everything).

## Database (Firestore)

Everything belongs to one user: `users/{uid}/...`

| Path | Written by | Purpose |
| --- | --- | --- |
| `users/{uid}` | app | profile (name, email) |
| `settings/main` | app | column mapping, template, variable columns, auto-send, speed, agent on/off |
| `settings/server` | server | WhatsApp connection (number, status, last error), AI provider and last AI error |
| `private/secrets` | server | WhatsApp token, AI key. Not readable by the app |
| `sheets/{id}` | server | one uploaded file: columns, rows, created / updated / skipped, first 50 row errors |
| `contacts/{phone}` | server (app may only set `unread: 0`) | one patient. **The id is the phone number**, so a number is never stored twice |
| `campaigns/{id}` | server | one sending run with live counters: `stats`, `byDoctor`, `failReasons`, `timeline` |
| `messages/{id}` | server | every message in and out: status, error code and plain-language hint, WhatsApp id, attempts |
| `phoneNumbers/{phoneNumberId}` | server | lets the webhook find which user owns a WhatsApp number |

Message status: `queued → sent → delivered → read`, or `failed` / `not_on_whatsapp` (final).
Counters are changed in one place only (`applyTransition`), inside a transaction, and never go backwards.

## Error handling

| Situation | What happens |
| --- | --- |
| Row has no / bad phone number | Row skipped, shown in the upload result with its row number. Import continues |
| Same number twice in a sheet, or the file is uploaded again | No duplicate contact (the phone number is the id) |
| Number is not on WhatsApp (code 131026) | Message becomes **Not on WhatsApp**; contact marked invalid |
| Other permanent error (for example a test number not allowed) | Message becomes **Failed** with a plain-language reason. "Retry failed" in the report |
| WhatsApp rate limit / outage / timeout | Retried by the queue with back-off, up to 5 tries, then **Failed** |
| Template wrong, or token expired | **Campaign pauses**, nothing else fails, messages stay queued. Fix it, press **Resume** |
| Same message processed twice (task retry, double click) | Sent once (claim lock + status check) |
| Webhook delivered twice, or out of order | Ignored safely (ids are idempotent, statuses only move forward) |
| Database problem while handling a webhook | Answers 500 so Meta sends it again. Writes are idempotent |
| Patient replies STOP | Always unsubscribed (even with Agent mode off); campaigns skip them. START subscribes again |
| Free text to a patient who has not written in 24 h | Blocked with a clear message. Use the template instead |

## AI agent (Agent mode)

Turn it on in **Settings → AI Agent**: pick a provider (Gemini, ChatGPT, Claude, Groq, or any OpenAI-compatible API) and paste the key.
Rules the code enforces (see `functions/src/agent.ts`, `agentSafety.ts`):
answers only a message the patient just sent; no medical advice; emergency words go to staff and never to the AI;
STOP unsubscribes; at most 8 automatic replies per patient per hour; replies are cleaned and limited to 900 characters;
temporary AI errors retry, permanent ones leave the message unread for staff. Custom API addresses must be public `https://` URLs.

## Set up (one time)

1. **Firebase console** (project `new-app-8f5f3`)
   - Build → **Firestore Database** → create (production mode).
   - Build → **Authentication** → Sign-in method → turn on **Email/Password** and **Google**.
   - Authentication → Settings → **Authorized domains** → add your Vercel domain (for example `carereach-gamma.vercel.app`).
   - Upgrade to the **Blaze** plan (required for Cloud Functions that call WhatsApp / AI; the free allowance is large).
2. **Backend**
   ```bash
   npm i -g firebase-tools && firebase login
   cp functions/.env.example functions/.env      # set WA_VERIFY_TOKEN (any long text), optionally WA_APP_SECRET
   cd functions && npm install && cd ..
   firebase deploy                                # rules, indexes and functions
   ```
   If sending says the queue could not start, give the Compute Engine default service account the roles **Cloud Tasks Enqueuer** and **Service Account User** (IAM page).
3. **Meta (WhatsApp Cloud API)**: App → WhatsApp → Configuration → Webhook
   - Callback URL: `https://us-central1-new-app-8f5f3.cloudfunctions.net/whatsappWebhook`
   - Verify token: the `WA_VERIFY_TOKEN` you chose. Subscribe to **messages**.
   - Put the App Secret in `WA_APP_SECRET` to have every webhook call signature-checked.
4. **App**: sign up, enter the WhatsApp details (the backend checks them with WhatsApp before saving), then Settings → upload a sheet.

## Run and test locally

```bash
cd app && npm install && npm run web          # web app against the real project
cd functions && npm install && npm test       # needs the Firestore emulator, see below
```
Backend tests (39) run against the Firestore emulator with a fake WhatsApp and a fake AI:
`firebase emulators:exec --only firestore "cd functions && npx tsx --test --test-concurrency=1 test/*.test.ts"`.
They cover import, phone formats, one-by-one sending, every error path above, delivery receipts, the webhook, the agent and the security rules.

To try the whole app locally: `firebase emulators:start --only functions,firestore,auth` (set `WA_API_BASE` to a fake WhatsApp server)
and `EXPO_PUBLIC_EMULATOR=1 npm run web` in `app/`.

## Notes

- The Firebase web config in `app/src/firebaseConfig.ts` is public by design. Data is protected by sign-in and `firestore.rules`.
- Google sign-in works on web. On phones use email and password.
- Approved templates must use numbered variables (`{{1}}`, `{{2}}`). Templates with named variables are not listed.
