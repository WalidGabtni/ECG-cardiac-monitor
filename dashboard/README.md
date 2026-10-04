# ECG Doctor Dashboard

React 19 + Vite + Tailwind dashboard backed by Supabase. Doctors see live patient vitals, the ECG trace, the on-device prediction, alerts and an emergency map.

```bash
cp .env.example .env     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
npm run build
```

`supabase/migrations/` holds the schema and row-level-security policies; `supabase/functions/send-alert-email` is an edge function that needs a `RESEND_API_KEY` secret.
