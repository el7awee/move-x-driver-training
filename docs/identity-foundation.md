# Move X identity foundation

## Security boundaries

- Identity preview is disabled by default. It is available only when
  `NODE_ENV=development` and `NEXT_PUBLIC_ENABLE_IDENTITY_PREVIEW=true`.
  Preview never creates a server session and cannot authorize protected APIs.
- Protected handlers must use `requireReadyRequest`. Add an allowed-role list
  for supervisor or system-administrator operations.
- `/api/auth/me` is the source of profile and role data. Client state controls
  presentation only and is never an authorization source.
- A session with `mustChangePassword=true` may call only session restoration,
  logout, and password change. Normal protected handlers reject it.
- IP addresses are HMACed with `AUTH_IP_HASH_KEY`; the key is never stored in
  source control.

## Driver and vehicle boundary

`driver_profiles` contains driver identity and licence data only. Vehicles are
not permanent driver attributes. A future fleet module must model assignments
with a driver, vehicle, effective date/time range, and shift. That assignment
module is intentionally outside this pull request.

## Development and staging bootstrap

The bootstrap command is idempotent by login code and never updates an existing
account or silently creates default credentials:

```text
npm run identity:bootstrap
```

Provide all credentials through environment variables described in
`.env.example`. `BOOTSTRAP_TARGET` accepts only `development` or `staging`.
Staging additionally requires the explicit confirmation value documented in
the script. Production is rejected.

Every bootstrap/import record must explicitly supply `temporaryCredential` and
`mustChangePassword`. The agreed temporary initial credential is accepted only
for invited drivers or supervisors when both flags are `true`. A system
administrator can never use that temporary credential. A non-temporary
administrator password is supplied through the environment and its
`mustChangePassword` value is explicit. Bootstrap SQL contains only salted
password hashes and remains idempotent with `ON CONFLICT(login_code) DO NOTHING`.
The temporary initial credential is rejected by password replacement for every
role.

## Retention guidance

- Proposed, not activated: delete failed login attempts after 30 days.
- Proposed, not activated: delete revoked or expired sessions after 30 days.
- Proposed, not activated: retain successful authentication audit records for
  365 days.
- Proposed, not activated: retain blocked, failed, and security audit records
  for 730 days.
- Biometric verification retention remains undecided until the biometric and
  privacy policies are approved.
- Run cleanup as a bounded scheduled job using the retention indexes. Cleanup
  automation and production scheduling are outside this pull request.

## Isolated staging

`wrangler.jsonc` is deliberately staging-only: both its root name and
`env.staging.name` target `move-x-driver-training-staging`. It contains only the
non-secret staging D1 identifier and keeps `DB` as the application binding.
There are no production resource IDs, routes, or custom domains in the file.

Use only the explicit staging commands:

```text
npx vinext build
npx vinext deploy --env staging
npm run identity:bootstrap
```

Set `BOOTSTRAP_TARGET=staging`,
`BOOTSTRAP_D1_DATABASE=move-x-driver-training-staging`, and the documented
staging confirmation only for the bootstrap process. Store
`AUTH_IP_HASH_KEY` with `wrangler secret put --env staging`; never place it in
an environment file or committed configuration. Identity preview stays false.
The staging authorization-check route exists only while
`IDENTITY_STAGING_VALIDATION=true`; remove that variable and route before any
production release.
