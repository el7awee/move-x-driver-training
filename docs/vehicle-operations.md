# Vehicle authorizations, custody, and handovers

Move X and its D1 database are the only authoritative source for operational drivers, vehicles, authorizations, custody, and handovers. There is no Google Sheets, legacy-file, or background import/synchronization path.

- `driver_profiles` and `vehicles` created through the administrator UI use `source='manual_admin'`.
- `vehicle_assignments` records which active drivers are authorized to drive an active vehicle, including shift, assignment type, and validity. A vehicle can have several active authorizations.
- `vehicle_custodies` records who physically holds the vehicle. A partial unique index permits only one open custody per vehicle.
- `vehicle_handovers` is the immutable receipt and delivery history. Completing a handover closes the previous custody, opens the recipient custody, and writes the operational audit entry in one D1 batch.

Migrations `0003_vehicle_handover_model.sql` and `0004_manual_operational_source.sql` preserve pre-existing rows only for technical traceability. They close old assignments and mark pre-existing profiles, vehicles, authorizations, custodies, and handovers as `legacy_unverified`; those rows are excluded from operational lists and cannot authorize a handover. No legacy row creates custody or a handover automatically.

The dedicated `/admin/settings/drivers` page creates the identity account and driver profile in one D1 batch, sets a strong temporary password with `must_change_password=1`, and exposes that password only in the immediate response. Drivers are never hard-deleted. Deactivation revokes sessions, ends current authorizations, and closes any custody without deleting history.

Only an active `manual_admin` driver can be authorized, and only an active `manual_admin` vehicle can be assigned or handed over. Maintenance, inactive, and retired vehicles cannot be handed over. Ending an authorization is blocked while that driver has the vehicle in custody.

## Vehicle registration profile and images

The administrator vehicle form mirrors the operational fields found on Egyptian vehicle registration licences without attempting OCR or trusting an uploaded image as structured data. In addition to the existing plate, make, model, year, colour, VIN/chassis, engine number, fuel, odometer, vehicle type, registration expiry, insurance company and insurance expiry fields, it stores:

- owner name, traffic department, and traffic unit;
- licence issue, registration expiry, tax expiry, and technical-inspection expiry dates;
- insurance policy number;
- engine capacity in cubic centimetres and cylinder count;
- legal restrictions or sale-prohibition notes.

Licence images are separate private documents in `vehicle_documents`. D1 stores metadata only; image/PDF bytes use the same private Google Drive service-account adapter as driver documents. Only a system administrator can list, upload, review, view, or archive them. Accepted content is JPEG, PNG, WEBP, or PDF up to 8 MiB, validated by file signature rather than filename. SVG, HTML, executable content, and MIME mismatches are rejected. The original registration files supplied for field discovery are never committed or imported automatically.

When the three document-storage secrets are absent, structured vehicle data remains fully usable and the interface shows an explicit setup blocker instead of a nonfunctional upload button.

Production migration remains a separately approved operation. Applying these migrations or deploying code is not part of PR review.
