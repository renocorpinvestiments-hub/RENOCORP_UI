# RENOCORP UI

React/Vite production frontend for RENOCORP.

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

For reproducible CI/release installs, commit `package-lock.json` and use `npm ci`.

## Production

The frontend is built as static assets and served through Nginx. The production API is same-origin under `/api/auth` unless explicitly overridden with `VITE_API_BASE`.

Do not place payment secrets, private API keys, database credentials, or other server-side secrets in Vite environment variables: frontend variables are delivered to the browser.

Currency conversion in the UI is presentation-only. Backend/database values remain authoritative for all financial operations.
