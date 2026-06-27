const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeSql(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildAttnumSelectPattern(tableName, columnName) {
  return `\\(\\s*select\\s+attnum\\s+from\\s+pg_attribute\\s+where\\s+attrelid\\s*=\\s*'${escapeRegex(
    tableName,
  )}'::regclass\\s+and\\s+attname\\s*=\\s*'${escapeRegex(
    columnName,
  )}'\\s+and\\s+attnum\\s*>\\s*0\\s+and\\s+not\\s+attisdropped\\s*\\)`;
}

function buildExactAttnumArrayPattern(tableName, columns) {
  return `array\\s*\\[\\s*${columns
    .map((columnName) => buildAttnumSelectPattern(tableName, columnName))
    .join("\\s*,\\s*")}\\s*\\]\\s*::\\s*smallint\\s*\\[\\s*\\]`;
}

function hasExactCompositeUniqueCoverageGuard(
  sql,
  { columns = ["id", "user_id"], tableName = "public.metrics_snapshots" } = {},
) {
  const normalizedSql = normalizeSql(sql);
  const attnumArrayPattern = buildExactAttnumArrayPattern(tableName, columns);
  const expectedColumnCount = columns.length;
  const constraintPattern = new RegExp(
    `from\\s+pg_constraint\\s+where\\s+conrelid\\s*=\\s*'${escapeRegex(
      tableName,
    )}'::regclass\\s+and\\s+contype\\s+in\\s*\\(\\s*'p'\\s*,\\s*'u'\\s*\\)\\s+and\\s+conkey\\s*=\\s*${attnumArrayPattern}`,
    "i",
  );
  const indexPattern = new RegExp(
    `from\\s+pg_index\\s+where\\s+indrelid\\s*=\\s*'${escapeRegex(
      tableName,
    )}'::regclass\\s+and\\s+indisunique\\s+and\\s+indpred\\s+is\\s+null\\s+and\\s+indexprs\\s+is\\s+null\\s+and\\s+indnkeyatts\\s*=\\s*${expectedColumnCount}\\s+and\\s+indnatts\\s*=\\s*${expectedColumnCount}\\s+and\\s+indkey\\s*::\\s*smallint\\s*\\[\\s*\\]\\s*=\\s*${attnumArrayPattern}`,
    "i",
  );

  return (
    constraintPattern.test(normalizedSql) && indexPattern.test(normalizedSql)
  );
}

module.exports = {
  hasExactCompositeUniqueCoverageGuard,
  normalizeSql,
};
