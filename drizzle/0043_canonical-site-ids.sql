-- Fresh databases were historically seeded with site ids 71-139, while the
-- production catalogue already used the canonical public ids 1-69 and skipped
-- that empty-table seed. Reconcile only the exact fresh-local pattern. On
-- production and every already-correct database this migration is a no-op.
DO $$
BEGIN
  IF (
    SELECT COUNT(*) = 69
      AND MIN(id) = 71
      AND MAX(id) = 139
      AND COUNT(*) FILTER (WHERE id BETWEEN 1 AND 69) = 0
      AND BOOL_OR(id = 71 AND name = 'Forgotten Perimeter Coronation Platform')
      AND BOOL_OR(id = 139 AND name = 'Shattered Ice Field')
    FROM sites
  ) THEN
    -- The existing foreign keys do not cascade primary-key updates. Remove
    -- them inside this transactional migration, move every reference by the
    -- same offset, then restore the original constraints.
    ALTER TABLE waves DROP CONSTRAINT waves_site_id_sites_id_fk;
    ALTER TABLE site_resources DROP CONSTRAINT site_resources_site_id_sites_id_fk;

    UPDATE waves SET site_id = site_id - 70 WHERE site_id BETWEEN 71 AND 139;
    UPDATE site_resources SET site_id = site_id - 70 WHERE site_id BETWEEN 71 AND 139;
    UPDATE sites SET id = id - 70 WHERE id BETWEEN 71 AND 139;

    PERFORM setval(pg_get_serial_sequence('sites', 'id'), (SELECT MAX(id) FROM sites), true);

    ALTER TABLE waves
      ADD CONSTRAINT waves_site_id_sites_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
    ALTER TABLE site_resources
      ADD CONSTRAINT site_resources_site_id_sites_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
  END IF;
END $$;
