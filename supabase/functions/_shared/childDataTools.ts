// Shared child-data tool registry.
//
// Single source of truth used by:
//   - `chat/index.ts` (in-app Anthropic tool-use, Stage 1)
//   - `mcp/index.ts`  (external MCP server, Stage 2 — not built yet)
//
// Both surfaces share one tool surface and one dispatcher so the schemas
// Claude sees can't drift between in-app and MCP. The dispatcher trusts
// whatever Supabase client it's handed — callers are responsible for passing
// a user-authenticated client so RLS via SECURITY INVOKER does the work.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ToolName =
  | "list_accessible_children"
  | "get_child_profile"
  | "get_recent_sleep"
  | "get_recent_feeds"
  | "get_recent_diapers"
  | "get_growth"
  | "get_milestones"
  | "get_illnesses"
  | "get_vaccinations"
  | "get_allergens"
  | "get_summary";

export interface AnthropicTool {
  name: ToolName;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolDispatchResult {
  ok: boolean;
  content: string; // JSON-stringified payload OR a short error message
  is_error?: boolean;
}

// ---------------------------------------------------------------------------
// Tool schemas. Descriptions are tuned for Claude — they tell it WHEN to call
// each tool. Keep them precise; bad descriptions cause Claude to over- or
// under-call.
// ---------------------------------------------------------------------------

const CHILD_ID_PROP = {
  type: "string",
  description: "UUID of the child. Get this from list_accessible_children if you don't have it.",
} as const;

export const CHILD_DATA_TOOLS: AnthropicTool[] = [
  {
    name: "list_accessible_children",
    description:
      "Lists every child the current parent (or partner caregiver) can see. Returns id, name, gender, date_of_birth, is_premature, photo_url, next_appointment, and other profile fields. Call this first when you don't know which child the parent is asking about, or when they mention a name you haven't mapped to an id yet.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_child_profile",
    description:
      "Returns a single child's profile: name, gender, date_of_birth, age_in_days (computed), is_premature, birth_weight_oz, discharge_weight_oz, next_appointment, photo_url, interests (parent-selected activity interests like music or water_play), and temperament (easygoing/sensitive/spirited/slow_to_warm, may be null). Use this when you need the child's exact age in days, premature status, birth weight, or their interests/temperament for tailoring activity suggestions.",
    input_schema: {
      type: "object",
      properties: { child_id: CHILD_ID_PROP },
      required: ["child_id"],
    },
  },
  {
    name: "get_recent_sleep",
    description:
      "Returns the child's sleep log entries from the last N hours (default 48). Use this when the parent asks about recent naps, last night's sleep, sleep patterns, or how long the baby has been awake. Each entry has started_at, ended_at, duration_minutes, sleep_type ('nap' or 'night'), quality, notes.",
    input_schema: {
      type: "object",
      properties: {
        child_id: CHILD_ID_PROP,
        hours: {
          type: "integer",
          description: "How many hours back to look. Defaults to 48.",
          minimum: 1,
          maximum: 720,
        },
      },
      required: ["child_id"],
    },
  },
  {
    name: "get_recent_feeds",
    description:
      "Returns the child's feeding log entries from the last N hours (default 48). Each entry has feeding_type (one of: 'breast' = direct nursing, 'bottle_breast_milk' = bottle of pumped breast milk, 'bottle_formula' = formula bottle, 'pump' = pumping session with no infant intake, 'solid'), amount_oz, duration_minutes, food_description, logged_at, notes. Use this for questions about recent feeds, intake volume, feeding frequency, or solids progress.",
    input_schema: {
      type: "object",
      properties: {
        child_id: CHILD_ID_PROP,
        hours: {
          type: "integer",
          description: "How many hours back to look. Defaults to 48.",
          minimum: 1,
          maximum: 720,
        },
      },
      required: ["child_id"],
    },
  },
  {
    name: "get_recent_diapers",
    description:
      "Returns the child's diaper log entries from the last N hours (default 48). Each entry has diaper_type (one of: 'wet', 'dirty', 'both' — 'both' means pee and poop in one diaper), color, consistency, flag_for_attention, logged_at, notes. Use this for hydration questions, output-tracking, or when the parent asks about recent diaper patterns.",
    input_schema: {
      type: "object",
      properties: {
        child_id: CHILD_ID_PROP,
        hours: {
          type: "integer",
          description: "How many hours back to look. Defaults to 48.",
          minimum: 1,
          maximum: 720,
        },
      },
      required: ["child_id"],
    },
  },
  {
    name: "get_growth",
    description:
      "Returns every growth measurement on file for the child (weight_oz, length_cm, head_circumference_cm), oldest first. Use this for percentile/growth-curve questions, comparing measurements over time, or when the parent asks about weight gain since birth or since a recent pediatrician visit.",
    input_schema: {
      type: "object",
      properties: { child_id: CHILD_ID_PROP },
      required: ["child_id"],
    },
  },
  {
    name: "get_milestones",
    description:
      "Returns developmental milestones in three buckets: achieved (canonical speech/language milestones the parent has marked complete), custom (parent-created milestones), and flagged (canonical milestones the system has raised concern about). Pass status='achieved' to return only achieved+custom, status='flagged' to return only flags, or omit status for everything. Use this for milestone questions, progress check-ins, or concerns about delays.",
    input_schema: {
      type: "object",
      properties: {
        child_id: CHILD_ID_PROP,
        status: {
          type: "string",
          description: "Optional filter: 'achieved' or 'flagged'. Omit for all three buckets.",
          enum: ["achieved", "flagged"],
        },
      },
      required: ["child_id"],
    },
  },
  {
    name: "get_illnesses",
    description:
      "Returns illness logs for the child with their medications joined as nested arrays. Each illness has illness_name, start_date, end_date (null = still active), notes, and medications[]. Pass active_only=true to return only illnesses without an end_date. Use this for sick-day questions, medication tracking, or assessing recent illness history.",
    input_schema: {
      type: "object",
      properties: {
        child_id: CHILD_ID_PROP,
        active_only: {
          type: "boolean",
          description: "If true, only returns illnesses with end_date IS NULL (ongoing).",
        },
      },
      required: ["child_id"],
    },
  },
  {
    name: "get_vaccinations",
    description:
      "Returns the child's vaccination records: vaccine_name, date_administered, next_due_date, provider_name, declined, lot_number. Pass upcoming_only=true to return only doses with next_due_date in the future. Use this for vaccine-schedule questions and 'what's coming up at the next visit'.",
    input_schema: {
      type: "object",
      properties: {
        child_id: CHILD_ID_PROP,
        upcoming_only: {
          type: "boolean",
          description: "If true, only returns doses with next_due_date >= today.",
        },
      },
      required: ["child_id"],
    },
  },
  {
    name: "get_allergens",
    description:
      "Returns allergen introduction records for the child with nested exposure logs and any reactions. Each introduction has allergen_name, allergen_category, status (not_started/in_progress/completed/etc.), is_high_risk, pediatrician_cleared, exposures[], and reactions[]. Use this for allergen-introduction questions, exposure history, or when the parent asks whether something has been confirmed safe.",
    input_schema: {
      type: "object",
      properties: { child_id: CHILD_ID_PROP },
      required: ["child_id"],
    },
  },
  {
    name: "get_summary",
    description:
      "Returns aggregated totals over the last N days (default 7): total sleep minutes, longest sleep stretch, feed counts (bucketed by breast/bottle_breast_milk/bottle_formula/pump/solid) plus total ounces, diaper counts (bucketed by wet/dirty/both), milestones achieved, and active milestone flags raised in the window. Use this for 'how was last week', 'how is she doing overall', weekly snapshots, or when the parent asks for a quick rollup before drilling into specifics.",
    input_schema: {
      type: "object",
      properties: {
        child_id: CHILD_ID_PROP,
        days: {
          type: "integer",
          description: "How many days back to roll up. Defaults to 7.",
          minimum: 1,
          maximum: 90,
        },
      },
      required: ["child_id"],
    },
  },
];

// MCP `tools/list` shape. The MCP spec uses `inputSchema` (camelCase) where
// Anthropic's tool-use API uses `input_schema`. Same JSON Schema underneath —
// this is purely a key rename so both surfaces stay in sync from one registry.
export interface McpTool {
  name: string;
  description: string;
  inputSchema: AnthropicTool["input_schema"];
}

export function toMcpTools(): McpTool[] {
  return CHILD_DATA_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  }));
}

// Build a name-keyed lookup once so dispatch is O(1) and unknown names are
// rejected uniformly.
const TOOL_BY_NAME: Record<string, AnthropicTool> = Object.fromEntries(
  CHILD_DATA_TOOLS.map((t) => [t.name, t]),
);

// ---------------------------------------------------------------------------
// Dispatcher.
//
// Translates Claude's tool-input shape (which uses `child_id` per the
// schemas above) into the RPC parameter names (which use the `_child_id`
// underscore-prefix convention all SECURITY INVOKER functions follow).
// On any Postgres error or unknown tool, returns { ok: false, is_error: true }
// — the caller is expected to forward this to Claude as a tool_result with
// is_error: true so Claude can recover gracefully.
// ---------------------------------------------------------------------------

export async function dispatchChildDataTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolDispatchResult> {
  const tool = TOOL_BY_NAME[toolName];
  if (!tool) {
    return {
      ok: false,
      is_error: true,
      content: `Unknown tool: ${toolName}`,
    };
  }

  // Validate required keys present. Anthropic generally respects the
  // schema, but defensive validation is cheap and avoids confusing
  // Postgres errors when child_id is missing.
  const required = tool.input_schema.required ?? [];
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      return {
        ok: false,
        is_error: true,
        content: `Missing required arg: ${key}`,
      };
    }
  }

  try {
    let rpcName: string;
    let rpcArgs: Record<string, unknown>;

    switch (toolName as ToolName) {
      case "list_accessible_children":
        rpcName = "list_accessible_children";
        rpcArgs = {};
        break;

      case "get_child_profile":
        rpcName = "get_child_profile";
        rpcArgs = { _child_id: args.child_id };
        break;

      case "get_recent_sleep":
        rpcName = "get_recent_sleep";
        rpcArgs = { _child_id: args.child_id };
        if (typeof args.hours === "number") rpcArgs._hours = args.hours;
        break;

      case "get_recent_feeds":
        rpcName = "get_recent_feeds";
        rpcArgs = { _child_id: args.child_id };
        if (typeof args.hours === "number") rpcArgs._hours = args.hours;
        break;

      case "get_recent_diapers":
        rpcName = "get_recent_diapers";
        rpcArgs = { _child_id: args.child_id };
        if (typeof args.hours === "number") rpcArgs._hours = args.hours;
        break;

      case "get_growth":
        rpcName = "get_growth";
        rpcArgs = { _child_id: args.child_id };
        break;

      case "get_milestones":
        rpcName = "get_milestones";
        rpcArgs = { _child_id: args.child_id };
        if (typeof args.status === "string") rpcArgs._status = args.status;
        break;

      case "get_illnesses":
        rpcName = "get_illnesses";
        rpcArgs = { _child_id: args.child_id };
        if (typeof args.active_only === "boolean") rpcArgs._active_only = args.active_only;
        break;

      case "get_vaccinations":
        rpcName = "get_vaccinations";
        rpcArgs = { _child_id: args.child_id };
        if (typeof args.upcoming_only === "boolean") rpcArgs._upcoming_only = args.upcoming_only;
        break;

      case "get_allergens":
        rpcName = "get_allergens";
        rpcArgs = { _child_id: args.child_id };
        break;

      case "get_summary":
        rpcName = "get_summary";
        rpcArgs = { _child_id: args.child_id };
        if (typeof args.days === "number") rpcArgs._days = args.days;
        break;

      default: {
        // Exhaustiveness check — TypeScript will flag a missing case here.
        const _exhaustive: never = toolName as never;
        void _exhaustive;
        return {
          ok: false,
          is_error: true,
          content: `Unhandled tool: ${toolName}`,
        };
      }
    }

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);

    if (error) {
      console.error(`dispatchChildDataTool[${toolName}] RPC error:`, error);
      return {
        ok: false,
        is_error: true,
        content: error.message ?? `RPC ${rpcName} failed`,
      };
    }

    // RLS-filtered rows can legitimately come back as null / empty array.
    // Stringify whatever we got — Claude needs a string content block.
    return {
      ok: true,
      content: JSON.stringify(data ?? null),
    };
  } catch (err) {
    console.error(`dispatchChildDataTool[${toolName}] threw:`, err);
    return {
      ok: false,
      is_error: true,
      content: err instanceof Error ? err.message : String(err),
    };
  }
}
