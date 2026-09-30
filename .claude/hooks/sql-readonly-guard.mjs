#!/usr/bin/env node
// PreToolUse hook for mcp__Supabase__execute_sql.
//
// Auto-approves SQL that is provably read-only (SELECT / WITH / EXPLAIN / SHOW / TABLE / VALUES)
// so QA and verification queries against the live DB don't prompt every time.
// Anything else — writes, DDL, unknown function calls, or SQL we can't parse
// confidently — falls through to the normal approval prompt. This hook never
// denies; its failure mode is always "ask the human", never "run silently".
//
// apply_migration is intentionally not matched: schema changes always prompt.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ALLOWED_LEADING = new Set(["select", "with", "explain", "show", "table", "values"]);

// Any of these words anywhere in the (comment- and string-stripped) SQL → prompt.
// `analyze` is here because EXPLAIN ANALYZE actually executes the statement.
// `into` catches SELECT ... INTO new_table.
const FORBIDDEN_WORDS = new Set([
  "insert", "update", "delete", "merge", "upsert", "truncate", "drop", "alter",
  "create", "grant", "revoke", "comment", "copy", "vacuum", "analyze", "analyse",
  "reindex", "cluster", "refresh", "lock", "call", "do", "execute", "prepare",
  "deallocate", "set", "reset", "listen", "notify", "unlisten", "discard",
  "security", "into", "import", "load", "begin", "commit", "rollback",
  "savepoint", "release", "checkpoint", "nothing",
]);

// SQL keywords that are legitimately followed by "(" and aren't function calls.
const PAREN_KEYWORDS = new Set([
  "select", "from", "join", "where", "and", "or", "not", "in", "exists", "any",
  "all", "some", "as", "on", "using", "over", "filter", "within", "values",
  "when", "then", "else", "case", "is", "distinct", "by", "having", "lateral",
  "union", "intersect", "except", "with", "array", "row", "between", "like",
  "ilike", "similar", "partition", "order", "group", "limit", "offset",
  "materialized", "recursive", "cast", "extract", "interval", "varchar",
  "char", "numeric", "decimal", "timestamp", "timestamptz", "time", "bit",
]);

// Built-in functions known to be side-effect free. Unknown function → prompt,
// so SELECT delete_user_account() or SELECT cron.schedule(...) can't slip through.
const SAFE_FUNCTIONS = new Set([
  "count", "sum", "avg", "min", "max", "coalesce", "nullif", "greatest", "least",
  "lower", "upper", "length", "char_length", "trim", "btrim", "ltrim", "rtrim",
  "substring", "substr", "replace", "split_part", "position", "strpos", "concat",
  "concat_ws", "left", "right", "format", "md5", "starts_with", "regexp_replace",
  "regexp_match", "regexp_matches", "now", "current_date", "current_timestamp",
  "date_trunc", "date_part", "to_char", "to_date", "to_timestamp", "age",
  "make_interval", "timezone", "array_agg", "json_agg", "jsonb_agg",
  "string_agg", "bool_and", "bool_or", "json_build_object", "jsonb_build_object",
  "json_build_array", "jsonb_build_array", "row_to_json", "to_json", "to_jsonb",
  "jsonb_array_length", "json_array_length", "jsonb_object_keys",
  "jsonb_each", "jsonb_each_text", "jsonb_array_elements",
  "jsonb_array_elements_text", "jsonb_typeof", "jsonb_pretty",
  "json_object_agg", "jsonb_object_agg", "array_length", "array_to_string",
  "cardinality", "unnest", "generate_series", "round", "floor", "ceil", "abs",
  "percentile_cont", "percentile_disc", "row_number", "rank", "dense_rank",
  "lag", "lead", "first_value", "last_value", "current_setting",
  "pg_get_functiondef", "pg_get_function_arguments", "pg_get_function_result",
  "pg_get_viewdef", "pg_get_constraintdef", "pg_get_triggerdef",
  "pg_get_indexdef", "pg_get_expr", "pg_get_userbyid", "pg_size_pretty",
  "pg_total_relation_size", "pg_relation_size", "pg_table_size",
  "pg_indexes_size", "pg_database_size", "format_type", "obj_description",
  "col_description", "has_table_privilege", "has_function_privilege",
  "has_schema_privilege", "pg_has_role", "version", "uid", "role", "jwt",
]);
// Schemas whose functions we allow when the bare name is in SAFE_FUNCTIONS.
const SAFE_SCHEMAS = new Set(["pg_catalog", "auth"]);

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

// Strip comments and string/identifier literals. Returns null if anything is
// unterminated — we can't reason about SQL we can't tokenize.
function stripLiterals(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      out += " ";
    } else if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return null;
      i = end + 2;
      out += " ";
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) return null;
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; } // escaped quote
          break;
        }
        j++;
      }
      i = j + 1;
      out += c === "'" ? " '' " : " _ident_ ";
    } else if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (!m) { out += c; i++; continue; }
      const end = sql.indexOf(m[0], i + m[0].length);
      if (end === -1) return null;
      i = end + m[0].length;
      out += " '' ";
    } else {
      out += c;
      i++;
    }
  }
  return out.toLowerCase();
}

export function isReadOnly(sql) {
  if (typeof sql !== "string" || !sql.trim()) return false;
  const clean = stripLiterals(sql);
  if (clean === null) return false;

  const statements = clean.split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length === 0) return false;

  for (const stmt of statements) {
    const first = /^\(*\s*([a-z_]+)/.exec(stmt);
    if (!first || !ALLOWED_LEADING.has(first[1])) return false;
  }

  for (const word of clean.match(/[a-z_][a-z0-9_$]*/g) ?? []) {
    if (FORBIDDEN_WORDS.has(word)) return false;
  }

  // Every "name(" must be a keyword or a known-safe function.
  for (const m of clean.matchAll(/([a-z_][a-z0-9_$]*(?:\s*\.\s*[a-z_][a-z0-9_$]*)*)\s*\(/g)) {
    const parts = m[1].split(".").map((p) => p.trim());
    const name = parts[parts.length - 1];
    if (parts.length === 1) {
      if (!PAREN_KEYWORDS.has(name) && !SAFE_FUNCTIONS.has(name)) return false;
    } else if (!(parts.length === 2 && SAFE_SCHEMAS.has(parts[0]) && SAFE_FUNCTIONS.has(name))) {
      return false;
    }
  }
  return true;
}

// Only run as a hook when executed directly (lets tests import isReadOnly).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = readInput();
  if (input && isReadOnly(input.tool_input?.query)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "Read-only SQL auto-approved by .claude/hooks/sql-readonly-guard.mjs",
      },
    }));
  }
  // No output → Claude Code's normal permission flow (i.e. the approval prompt).
  process.exit(0);
}
