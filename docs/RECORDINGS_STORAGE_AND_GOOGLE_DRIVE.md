# Recordings: Frontend Storage & Google Drive

## Storing and viewing recordings on the frontend (current setup)

Recordings are saved **in the browser** using **IndexedDB** so they stay on the same device after the test.

### Minimal file size

To keep recordings small:

- **Video**: Resolution is set to 320×240 and `videoBitsPerSecond: 250000` (250 kbps).
- **Audio**: `audioBitsPerSecond: 64000` (64 kbps).

You can change these in `OnlineTest.jsx` (getUserMedia constraints and MediaRecorder options) if you want slightly better quality and larger files.

### How to see recordings

1. **Same device, same browser**: After submitting the test, use the link **“View in My Recordings”** on the result page, or go to **Take Test → “My Recordings”**.
2. On **My Recordings** you can:
   - **Play** – play the video in the page.
   - **Download** – save the `.webm` file to your computer.
   - **Delete** – remove it from IndexedDB.

**Important**: Frontend storage is **per device, per browser**. Only that browser on that device can see those recordings. If you need to see **all students’ recordings** in one place, you must use a server or cloud (e.g. Google Drive) as below.

---

## Pushing recordings to Google Drive (minimal size)

To save recordings to **Google Drive** (so you can see them in one place, share, etc.), you need a **backend** that talks to the Drive API. The browser cannot safely use a service account key, and Drive does not offer “presigned upload URLs” like S3.

### Option 1: Backend uploads to Drive (recommended)

1. **Backend** (Node.js on Vercel serverless, Railway, or any host):
   - Use a **Google service account** with a shared Drive folder (or create files in a folder the service account can access).
   - Expose an endpoint that:
     - Accepts the recording (e.g. multipart upload).
     - Uses the Drive API (e.g. `drive.files.create` with `uploadType: 'multipart'` or resumable upload) to upload the file to that folder.
   - Because Vercel has a **small request body limit** (~4.5 MB), either:
     - Host this upload endpoint elsewhere (e.g. Railway, Render), or
     - Use **resumable upload**: backend returns an upload URL, frontend uploads the blob in chunks (more work).

2. **Frontend**: Set `VITE_RECORDING_UPLOAD_URL` to your backend’s upload URL. After submit, the app will POST the recording there; your backend then uploads it to Drive.

3. **Minimal size**: The same small recording (low bitrate/resolution) is what the frontend sends, so Drive gets the same minimal-size file.

### Option 2: User signs in with Google and uploads to their Drive

- Use **OAuth 2.0** so the user signs in with Google.
- After the test, the frontend (or your backend) uses the user’s access token to call the Drive API and upload the file to **their** Drive. Then only that user sees it in their own Drive; you don’t get a single folder with everyone’s recordings unless you also copy files (e.g. via backend) to a shared folder.

### Summary

| Goal                         | Approach                                              |
|-----------------------------|--------------------------------------------------------|
| See recordings on same device | Use **My Recordings** (IndexedDB); play or download. |
| See all students’ recordings in one place | Backend that uploads to **Google Drive** (or S3/R2) and optionally stores metadata in a DB. |
| Minimal size                 | Already applied in the app (low bitrate, 320×240); same blob can be sent to your backend for Drive. |

For a ready-made backend that uploads to Drive, you’d add a serverless function or small server that uses the [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk) with a service account and implements the upload endpoint that `VITE_RECORDING_UPLOAD_URL` points to.
