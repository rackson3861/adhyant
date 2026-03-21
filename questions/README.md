# Source question papers (PDF)

Place exam PDFs here (e.g. `ABQuest_Class_IX_22_03_26.pdf`).

From the repo root:

```bash
npm run extract:papers
```

This will:

1. Read **pages 1–2** only for duration / marks / title hints; **questions** are parsed from **page 3 through the second-to-last page** (last page is treated as blank).
2. Parse each PDF with the same logic as the in-app parser (sections + question numbers).
3. Write per-question JPEG crops to `public/questions/papers/<slug>/q-<N>.jpg`. Crops **exclude** inter-question lines such as `SECTION-C : …`, Part headers, and the standard “This section contains … Multiple Choice Questions” boilerplate so those do not appear inside question images.
4. Write `public/questions/papers/<slug>/paper.json` (no answer keys).
5. Update `public/questions/papers-index.json` (default **display names** = PDF file name; **active** paper = first file unless you change it).

Commit the generated files under `public/questions/` so the deployed app loads quickly without Drive.

**Class IX / X (80 questions):** the PDF parser can confuse Biology vs Mathematics when section headers sit next to repeated “This section contains…” blocks. The extract script **forces the official layout**: 1–20 Mental Ability, 21–40 Physics, 41–50 Chemistry, 51–65 Biology (15), 66–80 Mathematics (15), for slugs `abquest-class-ix-*` and `abquest-class-x-*` (not Class XI).

To rename papers for students or switch the active paper, use **Admin → Bundled papers** and download the updated `papers-index.json`.
