# Vehicle authorizations, custody, and handovers

Move X separates three operational facts:

- `vehicle_assignments` records which active drivers are authorized to drive a vehicle, including shift and validity. A vehicle can have several active authorizations.
- `vehicle_custodies` records who physically holds the vehicle. A partial unique index permits only one open custody per vehicle.
- `vehicle_handovers` is the immutable receipt and delivery history. Completing a handover closes the previous custody, opens the recipient custody, and writes the operational audit entry in one D1 batch.

Migration `0003_vehicle_handover_model.sql` preserves every existing assignment row. Existing active rows become `primary` flexible authorizations with `valid_from` copied from `assigned_at`; ended rows retain their history.

Only an active, authorized driver can receive an active vehicle. Maintenance, inactive, and retired vehicles cannot be handed over. Ending an authorization is blocked while that driver has the vehicle in custody.
