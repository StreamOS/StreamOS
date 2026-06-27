const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  hasExactCompositeUniqueCoverageGuard,
  normalizeSql,
} = require("./lib/composite-unique-coverage.cjs");

const migrationPath = path.join(
  __dirname,
  "..",
  "packages",
  "database",
  "supabase",
  "migrations",
  "20260625161515_p4_creator_growth_intelligence_contract.sql",
);

test("metrics snapshots compatibility guard accepts exact unique coverage checks", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.equal(hasExactCompositeUniqueCoverageGuard(sql), true);
});

test("metrics snapshots compatibility guard rejects legacy name-only guards", () => {
  const sql = `
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'metrics_snapshots_id_user_id_unique'
          and conrelid = 'public.metrics_snapshots'::regclass
      ) then
        alter table public.metrics_snapshots
        add constraint metrics_snapshots_id_user_id_unique unique (id, user_id);
      end if;
    end
    $$;
  `;

  assert.equal(hasExactCompositeUniqueCoverageGuard(sql), false);
});

test("metrics snapshots compatibility guard rejects reversed or partial coverage checks", () => {
  const reversedSql = `
    select 1
    from pg_constraint
    where conrelid = 'public.metrics_snapshots'::regclass
      and contype in ('p', 'u')
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'user_id'
            and attnum > 0
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'id'
            and attnum > 0
            and not attisdropped
        )
      ]::smallint[];
    select 1
    from pg_index
    where indrelid = 'public.metrics_snapshots'::regclass
      and indisunique
      and indpred is null
      and indexprs is null
      and indnkeyatts = 2
      and indnatts = 2
      and indkey::smallint[] = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'user_id'
            and attnum > 0
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'id'
            and attnum > 0
            and not attisdropped
        )
      ]::smallint[];
  `;
  const partialIndexSql = `
    select 1
    from pg_constraint
    where conrelid = 'public.metrics_snapshots'::regclass
      and contype in ('p', 'u')
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'id'
            and attnum > 0
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'user_id'
            and attnum > 0
            and not attisdropped
        )
      ]::smallint[];
    select 1
    from pg_index
    where indrelid = 'public.metrics_snapshots'::regclass
      and indisunique
      and indpred is not null
      and indexprs is null
      and indnkeyatts = 2
      and indnatts = 2
      and indkey::smallint[] = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'id'
            and attnum > 0
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'user_id'
            and attnum > 0
            and not attisdropped
        )
      ]::smallint[];
  `;

  assert.equal(hasExactCompositeUniqueCoverageGuard(reversedSql), false);
  assert.equal(hasExactCompositeUniqueCoverageGuard(partialIndexSql), false);
});

test("normalizeSql strips block comments before composite coverage matching", () => {
  const sql = `
    select 1
    /* misleading block comment with public.metrics_snapshots and conkey */
    from pg_constraint
    where conrelid = 'public.metrics_snapshots'::regclass;
  `;

  assert.equal(normalizeSql(sql).includes("misleading block comment"), false);
});
