// Read-only category list shown on the MCP consent screen AND named on the
// Subprocessors page. Single source of truth for what we tell the user (and the
// FTC, via the Privacy Policy / Subprocessor list) the external Claude
// connection can read.
//
// CANONICAL tool names live server-side in
// `supabase/functions/_shared/childDataTools.ts` (`CHILD_DATA_TOOLS`). That
// file isn't importable from the React bundle (Deno-only ESM URLs), so this
// constant mirrors it by hand. `mcpReadCategories.test.ts` asserts the tool
// names we reference here exist in the published tools/list snapshot — bump
// both files together whenever a tool is added/removed/renamed.

export interface McpReadCategory {
  label: string;
  tools: string[];
}

export const MCP_READ_CATEGORIES: readonly McpReadCategory[] = [
  { label: "Profile", tools: ["list_accessible_children", "get_child_profile"] },
  { label: "Sleep", tools: ["get_recent_sleep"] },
  { label: "Feeds", tools: ["get_recent_feeds"] },
  { label: "Diapers", tools: ["get_recent_diapers"] },
  { label: "Growth", tools: ["get_growth"] },
  { label: "Milestones", tools: ["get_milestones"] },
  { label: "Illnesses", tools: ["get_illnesses"] },
  { label: "Vaccinations", tools: ["get_vaccinations"] },
  { label: "Allergens", tools: ["get_allergens"] },
  { label: "Summary", tools: ["get_summary"] },
] as const;
