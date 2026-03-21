# WEBSITE LINK
**https://e-learning-six-iota.vercel.app/**

**Restart local setup:** see **[SETUP.md](./SETUP.md)** (fresh `npm install`, `.env`, `npm run dev`).

## Auth0 login – fixing HTTP 403

If you see **HTTP ERROR 403** when logging in with Google (Auth0), fix it in the **Auth0 Dashboard**:

1. Go to [Auth0 Dashboard](https://manage.auth0.com/) → **Applications** → your application.
2. **Application Type:** must be **Single Page Application**.
3. **Allowed Callback URLs:** add the exact URL(s) where your app runs, one per line, e.g.  
   `http://localhost:5173`  
   `https://e-learning-six-iota.vercel.app`
   (no trailing slash; must match the origin the browser uses.)
4. **Allowed Logout URLs:** add the same URL(s).
5. **Allowed Web Origins:** add the same URL(s) (origin only, no path).
6. Save changes.

To use a different Auth0 tenant or app, set in `.env`:
- `VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com`
- `VITE_AUTH0_CLIENT_ID=your_client_id`

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh




<!-- For backend -->
cd back-end
npx nodemon index.js

<!-- For frontend -->
npm run dev
http://localhost:5173/

## Local dev + Google Apps Script (CORS)

The admin UI calls your Apps Script web app with `fetch`. Browsers block cross-origin requests to `script.google.com` from `http://localhost:5173` (CORS).

**Fix:** Vite proxies `/__gas/exec?...` to your deployed web app URL. The app builds that path in dev when `NEXT_PUBLIC_RECORDING_UPLOAD_URL` / `VITE_RECORDING_UPLOAD_URL` / `VITE_TEST_SUBMISSION_URL` contains `/macros/s/{deploymentId}/`.

- Restart `npm run dev` after changing `.env`.
- To disable the proxy and use the full `script.google.com` URL (e.g. for debugging), set `VITE_GAS_DEV_PROXY=false`.
- **Important:** For the proxy to receive JSON, Google must allow **anonymous** access to that deployment. **Anyone with Google account** makes Google return an HTML sign-in page to the Vite server (it is not logged in) → errors about **HTML instead of JSON**.

**If you want to keep “Anyone with Google account” for production:** add a **second** web app deployment from the **same** Apps Script project with **Who has access: Anyone** (dev-only URL). Put that `/exec` URL in **`.env.development.local`** as `VITE_RECORDING_UPLOAD_URL` (and/or `NEXT_PUBLIC_RECORDING_UPLOAD_URL`). Vite loads this file only in `npm run dev`, so production can keep using a restricted URL via `.env.production` / Vercel env. See **`.env.development.example`** in the repo.

**Admin “Unauthorized” on Test codes:** set `VITE_ADMIN_SECRET` in `.env` to the same value as **ADMIN_SECRET** in Apps Script → Project Settings → **Script properties** (same deployment you use in the web app URL).

Production builds still call `script.google.com` directly (same origin as your deployed site is not localhost, or use a server-side proxy if needed).
