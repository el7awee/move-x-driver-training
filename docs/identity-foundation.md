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

- Delete revoked or expired sessions after 30 days; retain only the minimum
  period required for incident review.
- Delete login-attempt rows after 30 days. The 15-minute throttling window does
  not require longer online retention.
- Define a separate approved retention period for audit logs before production;
  audit deletion must be controlled and documented.
- Run cleanup as a bounded scheduled job using the retention indexes. Cleanup
  automation and production scheduling are outside this pull request.
