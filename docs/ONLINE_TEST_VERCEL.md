# Online Test – Video & Audio on Vercel

## How it works

The online test uses **browser APIs only** for video and audio:

- **Capture**: `navigator.mediaDevices.getUserMedia({ video, audio })` – runs in the user’s browser.
- **Recording**: `MediaRecorder` – records to a blob (e.g. `video/webm`) in the browser.

So **capture and recording do not run on Vercel**. They run on the user’s device. The app deployed on Vercel is just the static frontend; when a user takes the test, their browser:

1. Asks for camera and microphone permission.
2. Shows a live preview (optional).
3. Records video + audio in the browser while they answer questions.
4. When they submit, the recording is available as a Blob in the browser.

Vercel only serves the React app and (if you add one) an API route. It does **not** do the actual video/audio capture or encoding.

## Where video/audio “live”

- **During the test**: In the browser (stream + `MediaRecorder`).
- **After submit**: The recording is a Blob in memory. To keep it after the user leaves, you must **upload** it to a storage service.

## Storing recordings on Vercel

Vercel is **not** meant for storing large binary files:

- Serverless functions have **request/response size limits** (e.g. 4.5 MB request body on Hobby).
- Video recordings are usually much larger, so sending the file in one request to a Vercel API route is not a good fit.

Recommended approach:

1. **Use external storage** (e.g. AWS S3, Cloudflare R2, Uploadthing).
2. **Option A – Presigned URL**  
   - Add a Vercel serverless function that:
     - Authenticates the user/session.
     - Calls your storage API to get a **presigned (upload) URL**.
     - Returns that URL to the frontend.
   - The frontend uses `fetch(url, { method: 'PUT', body: recordedBlob })` to upload **directly** to S3/R2. The file never goes through Vercel.
3. **Option B – Upload API that proxies to storage**  
   - If your backend (e.g. Node on another host) accepts multipart uploads and then uploads to S3/R2, the frontend can POST the blob to that backend. Vercel would only serve the frontend; the upload goes to your backend.

The app is prepared for an upload URL: set **`NEXT_PUBLIC_RECORDING_UPLOAD_URL`** (or `VITE_RECORDING_UPLOAD_URL`) in your Vercel project (Environment Variables). If set, the frontend will POST the recording to that URL after submit. That URL should point to your presigned endpoint or your own upload API that writes to S3/R2 (or similar).

## Summary

| What              | Where it runs / lives                          |
|------------------|-------------------------------------------------|
| Video/audio capture | User’s browser (`getUserMedia`)              |
| Recording        | User’s browser (`MediaRecorder` → Blob)         |
| Storing recording | External storage (S3, R2, etc.), not Vercel   |
| Vercel’s role    | Serve the React app (+ optional API for presigned URL) |

So: **video and audio work on Vercel** in the sense that the same React app runs there and the browser still has access to camera and mic. The only thing that does **not** run on Vercel is long‑term storage of the recording; that should be a separate storage service.
