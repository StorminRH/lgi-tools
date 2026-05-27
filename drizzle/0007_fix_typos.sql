-- Fix two upstream Sheet typos in site_resources.resource_name.
-- These misspellings were silently propagated by every prior
-- ingest from the Google Sheet; Phase 2.6 fixes them at the
-- source-of-truth (the local DB) now that the Sheet is no
-- longer authoritative.
--
-- Case-insensitive match so the migration is idempotent (after the
-- rename, the new LOWER() values don't match the predicate again) and
-- robust to the Sheet's mixed-case formatting.

UPDATE site_resources
SET resource_name = 'Luminous Kernite'
WHERE LOWER(resource_name) = 'luminous kermite';
--> statement-breakpoint
UPDATE site_resources
SET resource_name = 'Vivid Hemorphite'
WHERE LOWER(resource_name) = 'vivid hemorite';
