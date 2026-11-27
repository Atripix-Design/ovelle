# Volunteer workflow development migration

On November 20, 2026 UTC, migration `0017_volunteer_workflow.sql` (SHA-256
`ed8f64b4f6a522336cddcdfc28990ea017f26747cdc0fccc3d20db248db3e589`) was applied to
`ovelle-db-development`, database `d5d4e909-cac1-4ce4-ad56-888cdb24a05a`.
The development Worker binding was independently verified before the write.
The database contained migrations 0001–0016, two identity connections, no
accounts or organizations, and no volunteer schema objects.

A private export and Time Travel bookmark were captured outside the repository.
A direct Wrangler local import of the export failed because a referenced table
was not yet present. The original export was retained unchanged. For a local-only
restore, complete SQLite statements were reordered so all tables were created
before rows and dependent objects. The resulting local D1 restore matched an
independent offline SQLite restore for all 33 tables and every schema object;
integrity was `ok` and foreign-key check had no violations. Migration 0017 was
then applied to that restored D1 copy using Wrangler. Existing schema and data
were preserved, with no integrity or foreign-key violations.

The remote write submitted the complete migration and its history insertion in
one D1 batch, guarded against changed migration history, existing volunteer
objects, or newly created accounts or organizations. All 128 statements
succeeded. The remote database then reported 17 migrations, 39 volunteer tables,
zero foreign-key violations, two identity connections, and no accounts or
organizations. All 238 schema objects matched the migrated local D1 copy. The
development `/health` endpoint remained healthy. The private receipt records the
backup digest, recovery bookmark and migration verification; it is not in Git.

This is a development schema change only. The public identity and volunteer API
remain closed, and these checks do not establish provider login, mail delivery,
real organization data, or an installed Mac app workflow. Do not apply or
restore anything in production based on this receipt. Any restore would replace
later data and requires a fresh recovery decision.
