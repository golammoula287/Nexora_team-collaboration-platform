-- Finish the repair 0003 started.
--
-- 0003 rewrote the colliding column keys but drew its digits from the full
-- base-62 alphabet, so rank 0 became "10" - a key ending in '0'. That is not a
-- canonical ordering key: `keyBetween` refuses one as a neighbour, so the first
-- column of every repaired board still could not be reordered. The generator
-- (`nthPosition`) now counts in base 61 with no zero digit, and this brings the
-- stored rows in line.
--
-- 0003 is left as it was written rather than edited: it has already been
-- applied to running databases, and rewriting an applied migration means two
-- databases claiming the same version with different contents.
--
-- Idempotent: it only touches keys that actually end in '0', so running it on a
-- board someone has since reordered by hand leaves that ordering alone.
WITH ordered AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "project_id"
      ORDER BY "position", "created_at", "id"
    ) AS "rank"
  FROM "task_statuses"
  WHERE "project_id" IN (
    SELECT DISTINCT "project_id" FROM "task_statuses" WHERE "position" LIKE '%0'
  )
)
UPDATE "task_statuses" AS t
SET "position" = '1' || substr(
  -- The same alphabet as `NONZERO_DIGITS` in packages/db/src/ordering.ts.
  '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  (((o."rank" - 1) % 61) + 1)::int,
  1
)
FROM "ordered" o
WHERE o."id" = t."id";
