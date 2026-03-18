# WEBSITE LINK
**https://e-learning-six-iota.vercel.app/**

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





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

<!-- For backend -->
cd back-end
npx nodemon index.js

<!-- For frontend -->
npm run dev
http://localhost:5173/
