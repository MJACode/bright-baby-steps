// "This week's meal plan" (Solids tab) — builds a one-week set of 5–7 solid
// food ideas for a child from the curated food catalog.
//
// Flare+ feature with 1 free plan per child. Wraps the `nutrition` persona
// (single source of truth in ../_shared/personas.ts) with
// MEAL_PLAN_INSTRUCTION and returns a sanitized MealPlan. Plan:
// tasks/todo.md "Food page restructure + AI meal plan — Nov 2026", Phase A.
//
// CONTRACT (POST, JSON, user JWT; non-streaming, supabase.functions.invoke)
//   Request  { childId: uuid, weekStart: "YYYY-MM-DD" (the UTC Monday of
//              now±1 day), correctedAgeMonths: number 4–36 (floored),
//              method: "blw" | "traditional" | "mix" }
//            introducedAllergens / reactionAllergens are still accepted from
//            old clients and IGNORED (see "Allergens" below). Body cap 16 KB.
//   Model    returns { ideas: [{ mealSlot, foods: catalogSlug[1–3] }] } and
//            nothing else is read: it writes no text a parent sees.
//   200      MealPlan { weekStart, method,
//              intro (fixed per method, MEAL_PLAN_INTROS; ≤240),
//              ideas: 3–7 × { id ("idea-N"),
//                name (built from catalog names, buildIdeaName; ≤60),
//                mealSlot: breakfast|lunch|dinner|snack,
//                foods: catalogSlug[1–3],
//                blwPrep? / traditionalPrep? (catalog prep for the age band,
//                  "Food name: prep" per food; blw -> blwPrep only,
//                  traditional -> traditionalPrep only, mix -> both),
//                allergens: slug[] (union of the foods' catalog allergens),
//                foodCategory (first food's category) } }
//            No servingTip (removed 2026-11-22; old stored rows may still
//            carry one, and the client ignores it).
//            The plan is also upserted into meal_plans before the 200.
//   Errors   { error: code } with
//            400 invalid_input, 401 unauthorized,
//            403 no_write_access | premium_required (+ upgradeUrl "/upgrade"),
//            409 plan_exists_this_week (checked before premium),
//            422 no_eligible_foods (fewer than MIN_ELIGIBLE_FOODS catalog foods
//                fit this child — e.g. under the catalog's 6-month minimum, or
//                an avoid list that leaves fewer than 5 —
//                returned BEFORE any Anthropic call),
//            422 unusable_plan (non-JSON, or < 3 ideas survive sanitizing),
//            500 save_failed | internal_error, 502 coach_unavailable.
//
// Design:
//   * Data minimization: only childId, weekStart, correctedAgeMonths and
//     method are read from the body. The model receives the corrected age,
//     the method and the list of ELIGIBLE catalog foods (slug, name,
//     category, iron-rich marker) — no allergen lists, no name, no DOB.
//   * Allergens come from the DATABASE: the child's allergen_introductions
//     (+ exposure reactions) are read under the caller's RLS and run through
//     the getAllergenStatus port (deriveAllergenLists). Eligible foods are
//     those with minAgeMonths <= age whose catalog allergens are all
//     introduced without a reaction, so a stale offline cache or a reaction
//     logged on another phone can't put a reacted-to allergen in the plan.
//   * Avoid list from the DATABASE too: child_food_avoidances.food_slug rows
//     (reason reaction OR preference; free-text custom_food rows are
//     record-only) are read under the caller's RLS and removed from the
//     eligible list (deriveAvoidSlugs -> ValidInput.avoidSlugs). Nothing new
//     reaches Anthropic: the model still sees only the eligible list, and an
//     avoided slug it returns anyway drops its idea in sanitizePlan.
//   * The model picks foods ONLY (founder decision 2026-11-22): no name, no
//     tip, no intro, no prep. sanitizePlan (../_shared/mealPlan.ts) reads
//     just mealSlot + foods from each idea, drops ideas with unknown /
//     ineligible slugs, a repeated combination, a food used in more than 2
//     ideas, or a PLAN_LIMITS breach (canned tuna, rice products, cottage
//     cheese: once per plan), then builds the name, allergens, category and
//     prep from ../_shared/foodCatalog.ts and uses a fixed intro. Any other
//     key the model returns is discarded.
//   * Gate: Flare+ (the caller's own subscription, as generate-activity-plan
//     checks it, OR the child's owner via child_owner_is_premium so partners
//     on a Flare+ family qualify) OR no meal_plans row exists for the child
//     (the free plan). All enforced HERE, before the paid Anthropic call.
//   * The server persists the plan itself, upserting meal_plans on child_id
//     with the caller's JWT (NOT the service-role key), so the table's RLS is
//     the write gate. parent_id is the child OWNER, resolved from children.
//
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS } from "../_shared/personas.ts";
import {
  AVOIDANCES_SELECT,
  INTRODUCTIONS_SELECT,
  MIN_ELIGIBLE_FOODS,
  buildUserText,
  deriveAllergenLists,
  deriveAvoidSlugs,
  eligibleFoods,
  mealPlanGate,
  sanitizePlan,
  validateInput,
  type AvoidanceRow,
  type IntroductionRow,
  type ValidInput,
} from "../_shared/mealPlan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Same model as generate-sign-plan / generate-activity-plan. Bump here.
const MEAL_PLAN_MODEL = "claude-sonnet-4-6";
const MEAL_PLAN_MAX_TOKENS = 2000;

const MAX_BODY_BYTES = 16 * 1024;

// Appended to the nutrition persona prompt.
const MEAL_PLAN_INSTRUCTION = `You are now choosing this week's meal ideas: a short set of food combinations that one tired parent can make at home for their baby. You are given the baby's corrected age in months, how the family offers solids, and a list of foods chosen for this baby. You only choose which foods go together and when to offer them. The app writes every name, preparation step and message the parent sees, from its own checked food list, so you write no text at all.

Return ONLY this JSON object, with no prose and no code fences:
{
  "ideas": [
    { "mealSlot": "breakfast" | "lunch" | "dinner" | "snack", "foods": ["1 to 3 food slugs, exactly as listed"] }
  ]
}

Rules:
- ideas: 5 to 7, spread across meal slots. Pick foods ONLY from the provided list, spelled exactly as given. Never invent a food.
- Each idea is a combination that makes sense together at that meal. Do not repeat the same combination.
- Follow the plan limits given with the food list: at least 2 ideas include an iron-rich food, no food in more than 2 ideas, and the listed once-per-plan foods at most once.
- No other keys: no names, tips, intro, preparation, allergens or notes. Anything else you add is discarded.`;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Authenticate.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // User-JWT client: every query and the final upsert run under RLS.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json(401, { error: "unauthorized" });

    // 2. Validate. The body is read as text so it can be size-capped; it is
    // never logged. (Before the gate, unlike generate-sign-plan: the free-plan
    // gate needs childId.)
    const bodyText = await req.text();
    if (bodyText.length > MAX_BODY_BYTES) return json(400, { error: "invalid_input" });
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return json(400, { error: "invalid_input" });
    }
    const request = validateInput(body, Date.now());
    if (!request) return json(400, { error: "invalid_input" });

    // 3. Access, Flare+ state and the stored plan, under the caller's RLS.
    const [childRes, planRes, subRes, ownerPlusRes, introsRes, avoidRes] = await Promise.all([
      supabase.from("children").select("id, parent_id").eq("id", request.childId).maybeSingle(),
      supabase.from("meal_plans").select("week_start").eq("child_id", request.childId).maybeSingle(),
      supabase.from("subscriptions").select("tier, status").eq("user_id", userId).maybeSingle(),
      supabase.rpc("child_owner_is_premium", { _child_id: request.childId }),
      // RLS: select_child_access_allergen_introductions /
      // _allergen_exposure_logs (can_access_child); allergens is readable by
      // every authenticated user. Every row for the child is needed, so no
      // limit (at most one per allergen: UNIQUE (child_id, allergen_id)).
      supabase.from("allergen_introductions").select(INTRODUCTIONS_SELECT).eq("child_id", request.childId),
      // RLS: select_child_access_child_food_avoidances (can_access_child).
      // Only catalog-slug rows matter here (custom_food rows are record-only),
      // and every one is needed: at most one per catalog food per child
      // (child_food_avoidances_child_slug_key).
      supabase
        .from("child_food_avoidances")
        .select(AVOIDANCES_SELECT)
        .eq("child_id", request.childId)
        .not("food_slug", "is", null),
    ]);
    if (childRes.error) throw new Error(`children lookup failed: ${childRes.error.message}`);
    const ownerId = childRes.data?.parent_id as string | undefined;
    if (!ownerId) return json(403, { error: "no_write_access" });

    const { data: canWrite, error: canWriteErr } = await supabase.rpc("partner_can_write", {
      _owner_id: ownerId,
    });
    if (canWriteErr) throw new Error(`partner_can_write failed: ${canWriteErr.message}`);
    if (canWrite !== true) return json(403, { error: "no_write_access" });

    if (planRes.error) throw new Error(`meal_plans lookup failed: ${planRes.error.message}`);
    // Fail closed: without the child's real allergen state there is no safe
    // allowed list, and the client's copy is not trusted.
    if (introsRes.error) throw new Error(`allergen_introductions lookup failed: ${introsRes.error.message}`);
    // Same for the avoid list: a food the parent marked "reaction" must not
    // come back because the read failed.
    if (avoidRes.error) throw new Error(`child_food_avoidances lookup failed: ${avoidRes.error.message}`);
    const input: ValidInput = {
      ...request,
      ...deriveAllergenLists(introsRes.data as unknown as IntroductionRow[]),
      avoidSlugs: deriveAvoidSlugs(avoidRes.data as unknown as AvoidanceRow[]),
    };
    // A failed premium lookup counts as "not premium" (the free plan still
    // works); it never grants access.
    const sub = subRes.data;
    const callerPlus =
      sub?.tier === "plus" && (sub?.status === "active" || sub?.status === "trialing");
    const ownerPlus = !ownerPlusRes.error && ownerPlusRes.data === true;

    // This read is only a real limit because the caller can't reset the row
    // through the API: meal_plans has no DELETE policy, and the
    // meal_plans_guard_write trigger (20261122000000_meal_plans.sql) rejects
    // any UPDATE that doesn't move week_start forward or that changes
    // child_id / parent_id, plus any week_start > 1 day ahead.
    const gate = mealPlanGate({
      isPremium: callerPlus || ownerPlus,
      existingWeekStart: planRes.data?.week_start,
      requestedWeekStart: input.weekStart,
    });
    if (gate === "plan_exists_this_week") return json(409, { error: "plan_exists_this_week" });
    if (gate === "premium_required") {
      return json(403, { error: "premium_required", upgradeUrl: "/upgrade" });
    }

    // Nothing safe to offer (e.g. younger than every catalog food's
    // minAgeMonths): stop before the paid call. Checked after the gate so a
    // used free plan still reports premium_required.
    const eligible = eligibleFoods(input);
    if (eligible.length < MIN_ELIGIBLE_FOODS) return json(422, { error: "no_eligible_foods" });

    // 4. Anthropic.
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MEAL_PLAN_MODEL,
          max_tokens: MEAL_PLAN_MAX_TOKENS,
          system: `${PERSONA_PROMPTS.nutrition}\n\n${MEAL_PLAN_INSTRUCTION}`,
          messages: [{ role: "user", content: buildUserText(input, eligible) }],
        }),
      });
    } catch (e) {
      console.error("generate-meal-plan Anthropic fetch failed:", e instanceof Error ? e.message : e);
      return json(502, { error: "coach_unavailable" });
    }

    if (!response.ok) {
      // Status and length only: an error body can echo parts of the request.
      const t = await response.text().catch(() => "");
      console.error("generate-meal-plan Anthropic error:", response.status, "body length", t.length);
      return json(502, { error: "coach_unavailable" });
    }

    // 5. Parse + build the plan from the catalog (only mealSlot + foods are read).
    const completion = await response.json();
    const text = (completion?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("generate-meal-plan: model returned non-JSON, length", cleaned.length);
      return json(422, { error: "unusable_plan" });
    }

    const plan = sanitizePlan(parsed, input);
    if (!plan) {
      // Don't log the model output here: it can name allergens the child eats.
      console.error("generate-meal-plan: fewer than 3 ideas survived the filter");
      return json(422, { error: "unusable_plan" });
    }

    // 6. Persist under the caller's RLS (meal_plans INSERT/UPDATE policies
    // require partner_can_write(parent_id) and child_id owned by parent_id).
    const { error: upsertErr } = await supabase.from("meal_plans").upsert(
      {
        child_id: input.childId,
        parent_id: ownerId,
        week_start: input.weekStart,
        plan,
      },
      { onConflict: "child_id" },
    );
    if (upsertErr) {
      // Two concurrent generates for the same week both pass the 409 read;
      // the guard trigger rejects the slower upsert. Report it as the limit.
      if (upsertErr.code === "23514" && upsertErr.message === "meal_plan_week_must_advance") {
        return json(409, { error: "plan_exists_this_week" });
      }
      console.error("generate-meal-plan upsert failed:", upsertErr.code, upsertErr.message);
      return json(500, { error: "save_failed" });
    }

    // 7. Done.
    return json(200, plan);
  } catch (e) {
    console.error("generate-meal-plan error:", e instanceof Error ? e.message : e);
    return json(500, { error: "internal_error" });
  }
});
