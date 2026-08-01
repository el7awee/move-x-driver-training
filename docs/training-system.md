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

Prepare idempotent Draft-only SQL outside the repository after choosing an
existing synthetic Staging manager ID:

```text
npm run training:prepare-drafts -- D:\MOVE-X-CONTENT-INVENTORY.json <manager-id> D:\MOVE-X-TRAINING-DRAFTS.sql
```

The generated rows use `video_source_type=google_drive`, a null source reference,
and `video_status=awaiting_google_drive_url`. The command does not publish or
assign a course, and re-running it does not overwrite an existing manager edit.

## Video sources

`google_drive` is the current operational source. A manager pastes a supported
`drive.google.com` file URL; the server validates the exact host and URL shape,
stores only the file ID, and creates the canonical `/preview` URL internally.
Raw HTML, iframe markup, script/data URLs, lookalike hosts, and unparseable Drive
links are rejected. New imported courses use `awaiting_google_drive_url` until a
manager supplies a link.

Drive sharing can be either `Anyone with the link` or `Restricted`. Restricted
files must be shared with the drivers' Google accounts; Move X cannot infer that
permission ahead of playback. A missing preview can mean a deleted file, invalid
link, required Google login, missing sharing permission, or disabled preview.
Drive does not prevent URL sharing or screen capture.

R2 remains an optional future source. `TRAINING_VIDEOS` is an optional binding;
its absence does not block building, deploying, creating Drive courses, or Drive
playback. If R2 is later enabled, Production and Staging must use separate
private buckets and must never share a binding.

The migration `drizzle/0001_training_courses.sql` is schema-only: it creates no
users, assignments, attempts, course rows, or seed content. Validate locally
with `npm run test:d1-local` before applying it remotely.
