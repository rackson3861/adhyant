# Bundled question assets (generated)

- **`papers-index.json`** — list of papers, `displayName` per PDF (editable in Admin), and `activePaperId` for the test UI.
- **`papers/<slug>/`** — `paper.json` + `q-1.jpg`, `q-2.jpg`, … (one image per paper question number).

Do not hand-edit JPEGs; re-run `npm run extract:papers` from the repo root after changing PDFs in `/questions/`.
