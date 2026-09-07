-- Remove the Amp's Laboratory fixture.
--
--   pnpm db:seed db/seed/mock-lab-remove.sql
--
-- Deletes by ownership rather than by name, so it can only ever remove rows the
-- fixture created: everything it inserts belongs to a `mock-…@grains.invalid`
-- user, and the seven real labs belong to `seed@grains.app`. Renaming the lab in
-- the browser would not hide it from this.
--
-- Order matters. `labs` cascades to its children, but `edit_history.entity_id`
-- is a plain uuid with no foreign key — history is meant to outlive what it
-- describes — so those rows have to go explicitly, and before the users they
-- reference.

DELETE FROM edit_history
WHERE editor_id IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

DELETE FROM labs
WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

-- Only the stocks this fixture created. If Track B's catalog seed already held a
-- name, ON CONFLICT meant the fixture never owned that row and it stays.
DELETE FROM film_stocks
WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

DELETE FROM users WHERE email LIKE 'mock-%@grains.invalid';
