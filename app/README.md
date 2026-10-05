# CareReach app (Expo / React Native)

Web, iOS and Android from one codebase. See the top-level `README.md` for the whole system (database, backend, setup).

```bash
npm install
npm run web           # or: npm run android / npm run ios
npm run typecheck
```

- `App.tsx` simple router (no navigation library): sign-in, connect WhatsApp, then the app.
- `src/store.tsx` signed-in user, live Firestore data (settings, contacts, campaigns, last sheet).
- `src/api.ts` calls to the backend functions, with plain-language errors.
- `src/hooks.ts` counts and live queries used by the Dashboard and Messages.
- `src/screens/` Auth, Connect, Dashboard, Inbox, Messages, Reports, ReportDetail, Settings (Patient source + AI Agent).
- `EXPO_PUBLIC_EMULATOR=1` makes the app use the local Firebase emulators.
