# Vehicle authorizations, custody, and handovers

Move X and its D1 database are the only authoritative source for operational drivers, vehicles, authorizations, custody, and handovers. There is no Google Sheets, legacy-file, or background import/synchronization path.

- `driver_profiles` and `vehicles` created through the administrator UI use `source='manual_admin'`.
- `vehicle_assignments` records which active drivers are authorized to drive an active vehicle, including shift, assignment type, and validity. A vehicle can have several active authorizations.
- `vehicle_custodies` records who physically holds the vehicle. A partial unique index permits only one open custody per vehicle.
- `vehicle_handovers` is the immutable receipt and delivery history. Completing a handover closes the previous custody, opens the recipient custody, and writes the operational audit entry in one D1 batch.

Migrations `0003_vehicle_handover_model.sql` and `0004_manual_operational_source.sql` preserve pre-existing rows only for technical traceability. They close old assignments and mark pre-existing profiles, vehicles, authorizations, custodies, and handovers as `legacy_unverified`; those rows are excluded from operational lists and cannot authorize a handover. No legacy row creates custody or a handover automatically.

The dedicated `/admin/settings/drivers` page creates the identity account and driver profile in one D1 batch, sets a strong temporary password with `must_change_password=1`, and exposes that password only in the immediate response. Drivers are never hard-deleted. Deactivation revokes sessions, ends current authorizations, and closes any custody without deleting history.

Only an active `manual_admin` driver can be authorized, and only an active `manual_admin` vehicle can be assigned or handed over. Maintenance, inactive, and retired vehicles cannot be handed over. Ending an authorization is blocked while that driver has the vehicle in custody.

Production migration remains a separately approved operation. Applying these migrations or deploying code is not part of PR review.
