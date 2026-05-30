import { describe, it, expect } from "vitest";
import { MCP_READ_CATEGORIES } from "@/lib/mcpReadCategories";

// Canonical tool names from supabase/functions/_shared/childDataTools.ts.
// Mirror this list when CHILD_DATA_TOOLS changes server-side; this test exists
// so that drift between the two surfaces fails CI loud rather than silently
// misrepresenting what an external Claude connection can read.
const CANONICAL_TOOL_NAMES = new Set([
  "list_accessible_children",
  "get_child_profile",
  "get_recent_sleep",
  "get_recent_feeds",
  "get_recent_diapers",
  "get_growth",
  "get_milestones",
  "get_illnesses",
  "get_vaccinations",
  "get_allergens",
  "get_summary",
]);

describe("MCP_READ_CATEGORIES", () => {
  it("references only canonical CHILD_DATA_TOOLS tool names", () => {
    for (const cat of MCP_READ_CATEGORIES) {
      for (const tool of cat.tools) {
        expect(CANONICAL_TOOL_NAMES.has(tool)).toBe(true);
      }
    }
  });

  it("covers every canonical tool exactly once", () => {
    const seen = new Set<string>();
    for (const cat of MCP_READ_CATEGORIES) {
      for (const tool of cat.tools) {
        expect(seen.has(tool)).toBe(false);
        seen.add(tool);
      }
    }
    expect(seen.size).toBe(CANONICAL_TOOL_NAMES.size);
    for (const name of CANONICAL_TOOL_NAMES) {
      expect(seen.has(name)).toBe(true);
    }
  });

  it("has a non-empty label for every category", () => {
    for (const cat of MCP_READ_CATEGORIES) {
      expect(cat.label.trim().length).toBeGreaterThan(0);
      expect(cat.tools.length).toBeGreaterThan(0);
    }
  });
});
