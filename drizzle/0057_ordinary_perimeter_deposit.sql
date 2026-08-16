-- Catalogue seed spelled the common C1–C3 ore anomaly "Permiter".
-- EVE's scanner (and paste) uses "Perimeter". Rename so /sites and the
-- scanner name index share the live client string. Idempotent: after the
-- rename the old spelling no longer matches.
UPDATE sites
SET name = 'Ordinary Perimeter Deposit'
WHERE name = 'Ordinary Permiter Deposit';
