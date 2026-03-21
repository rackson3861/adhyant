# Restart local setup

Use this when you want a clean dev environment or after pulling big changes.

## 1. Stop the dev server

In the terminal where Vite is running, press **Ctrl+C**.

## 2. Environment files

- **`.env`** — copy from `.env.example` if you are starting from scratch:
  ```bash
  cp .env.example .env
  ```
  Then edit `.env` and set:
  - `NEXT_PUBLIC_RECORDING_UPLOAD_URL` (or `VITE_RECORDING_UPLOAD_URL`) — your Apps Script **Web app** `/exec` URL  
  - `VITE_ADMIN_SECRET` — same value as `ADMIN_SECRET` in Apps Script → Project settings → Script properties  

- **Optional (local dev + GAS proxy):** copy `.env.development.example` → `.env.development.local` and fill the dev deployment URL.  
  Restart dev after any `.env` change.

## 3. Dependencies

From the project root:

```bash
cd /Users/sumrai/Documents/Adhyant/adhyant   # or your path
rm -rf node_modules
npm install
```

Skip `rm -rf node_modules` if you only changed env vars — then just `npm install` is enough.

## 4. Start again

```bash
npm run dev
```

Open **http://localhost:5173/** (or the URL Vite prints).

## 5. Production build check

```bash
npm run build
```

## Apps Script (backend for tests / admin)

This repo’s **`GoogleAppsScript-Registration.js`** is not auto-deployed. After you change it:

1. Open the script in [script.google.com](https://script.google.com).
2. **Deploy → Manage deployments → Edit** (pencil) → **New version** → **Deploy**.

Online test **question images** are served through the web app (`action=servePaperQuestionImage`). If images are missing in the test UI after upload, redeploy the script so this handler is live, and ensure each question finished uploading (sheet stores `imageFileId` per question).

**Student gate:** New test codes have an **AccessPassword** column (shown in the admin console). Students enter **test code + password** at the gate from any browser or tab. **SessionToken** may still be stored in the sheet for logging; the app no longer blocks other browsers. **Start over** calls `abandonTestSession` with the student’s **registration email** to release the server row. **Legacy** codes with an empty `AccessPassword` still accept **email** in the password field at the gate.

---

## “Reset” test data (not the dev machine)

To wipe sheet rows + Drive trash for exams, use the **Admin** page → **Clear all test data** (type `everything` to confirm). There is no per–test-code or per-row delete in the UI. That reset does **not** reinstall Node or change `.env`.
