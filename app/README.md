# CareReach — WhatsApp Patient Messaging (front end)

Front-end only React Native (Expo + TypeScript) app built from the Figma design
"WhatsApp Patient Messaging – Reporting". Runs on iOS, Android and web from one codebase.
There is **no backend**: data is mock data in `src/data.ts`, and state is saved on the device with AsyncStorage.

## Run

```bash
cd app
npm install
npm run web        # browser
npm run android    # or: npm run ios  (Expo Go / emulator)
npm run typecheck
```

## Screens (all from the Figma file)

| Screen | File | What works |
| --- | --- | --- |
| Account login / sign up | `src/screens/Auth.tsx` | Email + password (stored on this device), Google sign-in (web) |
| WhatsApp API setup | `src/screens/Login.tsx` | Field validation, connect, saved session |
| API Cloud | `ApiCloud.tsx` | Save keys for ChatGPT, Gemini, Claude, Groq or any OpenAI-compatible AI |
| Upload Sheet | `SheetScreen.tsx` | CSV / Excel upload with preview |
| Agent AI | `Agent.tsx` | Chat with your chosen AI, optionally using the uploaded sheet |
| Dashboard | `Dashboard.tsx` | Stats, donut chart, 7-day bars, recent messages |
| WhatsApp Inbox | `Inbox.tsx` | Search, All/Unread/Failed tabs, read state, send message, send approved template, patient details |
| Messages | `Messages.tsx` | Search, status filters, pagination, CSV export |
| Reports | `Reports.tsx` | Search, date filters, generate report, open report |
| Detailed report | `ReportDetail.tsx` | KPIs, charts, results by doctor, failure reasons, export |
| Settings | `Settings.tsx` | Sheet / file upload, column mapping, template picker + preview, toggles, save, send now |

Phones get a bottom tab bar; wide screens (>= 900px) get the sidebar layout from the design.

## Structure

```
App.tsx                simple state-based router (no navigation library)
src/store.tsx          one context: session, settings, reports, conversations, toast
src/data.ts            mock data + helpers
src/theme.ts           colors from the design
src/components/        ui.tsx (buttons, inputs, select, sheet), Charts.tsx, Shell.tsx, MessageTable.tsx
src/screens/           one file per screen
```

## Connecting a real backend later

Replace the mock parts only: `connect()` in `Login.tsx`, `MESSAGES` / `SEED_REPORTS` / `SEED_CONVERSATIONS`
in `src/data.ts`, and the "Send now" / "Sync now" handlers in `Settings.tsx`.

## Notes on the AI features

- Accounts, AI keys and the uploaded sheet are saved only in the device/browser (per account). Nothing goes to a server of ours;
  chat requests go directly from the app to the AI company you chose. Do not use shared computers.
- Google sign-in is web only. Add your OAuth Client ID (API Cloud page or the login prompt) and your site URL as an authorized JavaScript origin.
- The earlier plain HTML/JS version (`index.html`, `app.js`, `styles.css` at the repo root) is kept for reference; this app replaces it.
