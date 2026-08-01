# Move X driver profiles and private documents

`User Account`, `Driver Profile`, and `Driver Documents` are separate responsibilities:

- `users` owns login code, password hash, role, account state, and `must_change_password`.
- `driver_profiles` owns the captain's personal, employment, compliance, and operational profile.
- `driver_documents` stores private-file metadata only. File bytes are never stored in Git or D1.

Creating a captain writes the `users` and `driver_profiles` rows through one D1 batch transaction. A failure in either insert rolls back both. The temporary password is generated in memory, returned once with `Cache-Control: no-store`, and the account is created with `must_change_password=1`.

## Field matrix

| Area | Fields | Storage and access |
| --- | --- | --- |
| Account | login code, password hash, role, account status, must-change flag | `users`; system administrators manage it |
| Basic profile | full name, driver code, profile photo document, phone, secondary phone, email, date of birth, address, branch/location, hire date, primary shift, employment status, emergency contact, notes | `driver_profiles`; admin full access, supervisor/driver limited projection |
| National ID | encrypted value, deterministic keyed hash, last four digits | AES-GCM ciphertext and HMAC only; explicit admin reveal is audited; key is a Cloudflare Secret |
| Driving licence | number, type, issue/expiry dates, status, notes | admin edits; supervisor and owner see status and expiry only |
| Criminal record | status, issue/expiry dates, reference, notes | admin edits; supervisor and owner see status and expiry only |
| Drug test | status, date, next due/expiry, lab, reference, notes | admin edits; supervisor and owner see status and expiry only; positive is always textual |
| Document metadata | type, original filename, detected MIME, size, provider key/ID, dates, verification, uploader/reviewer, archive timestamp | `driver_documents`; provider identifiers never enter public API responses |
| Vehicle operations | authorizations, shift, current custody, handover history | existing shared-vehicle model remains unchanged |

## Private Google Drive adapter

The current document adapter uploads only to a private Google Drive folder owned by or shared with a dedicated service account. It never creates public permissions and never returns a direct Drive URL. View/download is proxied through an authenticated Move X endpoint with `no-store` and `nosniff` headers.

Required Staging/Production secrets are intentionally absent from Git:

- `DRIVER_DOCUMENTS_GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `DRIVER_DOCUMENTS_GOOGLE_PRIVATE_KEY`
- `DRIVER_DOCUMENTS_GOOGLE_DRIVE_FOLDER_ID`

If any value is absent, the UI shows a setup blocker and does not render an upload action.

The data-protection secret `DRIVER_DATA_PROTECTION_KEY` must contain at least 32 characters. It is used through HKDF to derive separate AES-GCM encryption and HMAC deduplication keys.

## Upload policy

- Maximum size: 8 MiB.
- Allowed content: JPEG, PNG, WEBP, and PDF.
- The server detects magic bytes and requires the claimed MIME type to match.
- SVG, executables, empty files, oversized files, and extension-only disguises are rejected.
- Storage names are random UUIDs.
- Archiving is logical in D1; audit history remains immutable.
- Only a system administrator can retrieve document bytes in version one. Supervisors and drivers receive status/expiry projections only.
