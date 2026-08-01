# Move X training system

## Baseline inventory

Before this work, course, video, quiz, result, report, and supervisor screens in
`app/page.tsx` were presentation-only. Their buttons changed React state or a
toast; they did not call an API, persist to D1, authorize roles on the server,
or store video in R2. The authenticated identity and password-change flow were
the only reusable server-backed foundation.

## Implemented foundation

- Courses start as `draft`; publication is a separate, explicit manager action.
- Only ready supervisors and system administrators can create or edit courses,
  import DOCX, upload video, publish/archive, assign drivers, and read reports.
- Drivers see only published courses assigned to their authenticated user.
- Quiz answers and explanations stay server-side until submission. Public quiz
  reads contain only the prompt and option labels.
- Video objects use `courses/<course-id>/<sha256>.mp4`, are fetched through an
  authorized Worker route, and support single HTTP byte ranges.
- Progress, attempts, answers, assignment completion, and latest results persist
  in D1. The server calculates scores and attempt limits.
- The management UI supports draft creation, metadata and policy editing, DOCX
  preview, manual question correction, MP4 upload, publication/archiving,
  assignment to active drivers, and progress/result review.

## Content import rules

Run the read-only inventory without copying MP4 or DOCX files into Git:

```text
npm run training:inventory -- "D:\New folder (2)\New folder" "D:\MOVE-X-CONTENT-INVENTORY.json"
```

Each immediate subdirectory must contain exactly one MP4 and one non-empty DOCX.
The inventory records SHA-256, MP4 duration/codec when readable, parsed Arabic
questions, declared/extracted counts, and review errors. A failed folder is
skipped independently. Imported courses must remain drafts until a manager has
reviewed and published them.

## Environment boundary and pending R2 setup

Production and Staging require separate private R2 buckets bound as
`TRAINING_VIDEOS`. Do not add the binding until the corresponding bucket is
created and its exact name is confirmed. Production and Staging must never share
a bucket. At the time this foundation was prepared, Cloudflare returned error
10042 because R2 was not enabled for the account, so no bucket, binding, upload,
remote migration, or deployment was attempted.

The migration `drizzle/0001_training_courses.sql` is schema-only: it creates no
users, assignments, attempts, course rows, or seed content. Validate locally
with `npm run test:d1-local` before applying it remotely.
