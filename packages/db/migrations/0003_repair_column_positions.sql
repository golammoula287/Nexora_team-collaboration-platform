-- Repair board columns that were seeded with duplicate ordering keys.
--
-- Every project created before this migration got its four columns from
-- `keyBetween(index === 0 ? null : String(index), null)`, which treated the
-- loop index as if it were an ordering key and produced ["V", "W", "W", "X"].
-- Two columns therefore shared the position "W": their order on the board was
-- whatever Postgres happened to return, and reordering either of them raised
-- `"W" is not before "W"`.
--
-- The seeding is fixed in `createProject`. This repairs the rows already
-- written, keeping each project's current visible order (position, then
-- created_at as the tiebreaker for the pair that collided) and rewriting the
-- keys to the short, evenly spaced sequence `keySequence` would have produced:
-- 10, 11, 12, ... in base-62, which is what the application generates.
WITH ordered AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "project_id"
      ORDER BY "position", "created_at", "id"
    ) - 1 AS "rank"
  FROM "task_statuses"
)
UPDATE "task_statuses" AS t
SET "position" = '1' || substr(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  ((o."rank" % 62) + 1)::int,
  1
)
FROM "ordered" o
WHERE o."id" = t."id"
  -- Only projects that actually collided; leave hand-ordered boards alone.
  AND t."project_id" IN (
    SELECT "project_id"
    FROM "task_statuses"
    GROUP BY "project_id", "position"
    HAVING count(*) > 1
  );
