// "This week's meal plan" (Solids tab) — builds a one-week set of 5–7 solid
// food ideas for a child.
//
// Flare+ feature with 1 free plan per child. Wraps the `nutrition` persona
// (single source of truth in ../_shared/personas.ts) with
// MEAL_PLAN_INSTRUCTION and returns a sanitized MealPlan. Plan:
// tasks/todo.md "Food page restructure + AI meal plan — Nov 2026", Phase A.
//
// Non-streaming (called via supabase.functions.invoke), cloned from
// generate-sign-plan:
//   * Data minimization: the request is allowlisted to childId, weekStart,
//     correctedAgeMonths, method, introducedAllergens, reactionAllergens
//     (allergen slugs only). Every other body field (name, DOB, free text) is
//     ignored and never read. The prompt receives only "already eats" and
//     "leave out" allergen lists — never which allergens had a reaction.
//   * Gate: Flare+ (the caller's own subscription, as generate-activity-plan
//     checks it, OR the child's owner via child_owner_is_premium so partners
//     on a Flare+ family qualify) OR no meal_plans row exists for the child
//     (the free plan). A row covering this week or later -> 409 first.
//     All enforced HERE, before the paid Anthropic call.
//   * The server persists the plan itself, upserting meal_plans on child_id
//     with the caller's JWT (NOT the service-role key), so the table's RLS is
//     the write gate. parent_id is the child OWNER, resolved from children.
//   * Model output goes through a deterministic hazard + allergen filter
//     (../_shared/mealPlan.ts sanitizePlan): choking hazards, under-12-month
//     rules, un-introduced or reaction allergens, off-tone text -> idea
//     dropped. Fewer than 3 ideas survive -> 422.
//
// Neither the request body nor the model output is logged: both can name the
// allergens a child eats. Failures log status codes and lengths only.
//
// Uses the same Anthropic pattern as generate-sign-plan — ANTHROPIC_API_KEY
// env var, model in MEAL_PLAN_MODEL.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS } from "../_shared/personas.ts";
import { buildUserText, mealPlanGate, sanitizePlan, validateInput } from "../_shared/mealPlan.ts";

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
const MEAL_PLAN_INSTRUCTION = `You are now building this week's meal ideas: a short, warm set of solid food ideas that one tired parent can make at home for their baby. You are given only the baby's corrected age in months, how the family offers solids, and which allergens the baby already eats. You do not know the baby's name, and you never need it — say "your baby".

Return ONLY this JSON object — no prose, no code fences:
{
  "intro": "one or two warm sentences, at most 240 characters",
  "ideas": [
    {
      "name": "short food idea, at most 60 characters",
      "mealSlot": "breakfast" | "lunch" | "dinner" | "snack",
      "blwPrep": "how to prepare it as a finger food: size, shape and softness, at most 220 characters",
      "traditionalPrep": "how to prepare it for spoon-feeding: texture, at most 220 characters",
      "servingTip": "optional, one practical tip, at most 160 characters",
      "allergens": ["every allergen slug the idea contains, from: peanut, egg, milk, wheat, soy, tree-nuts, fish, shellfish, sesame"],
      "foodCategory": "fruit" | "vegetable" | "grain_cereal" | "protein" | "dairy" | "other"
    }
  ]
}

Rules:
- ideas: 5 to 7, spread across meal slots, simple and made from everyday groceries. Lean on iron-rich foods (meat, beans, lentils, fortified cereal) paired with a fruit or vegetable.
- Include only the prep fields the feeding method asks for.
- Under 12 months, milk (breast milk or formula) is still your baby's main nutrition and solids are for learning and exploring. Say so warmly in the intro.
- Allergens: use only allergens listed as already eaten, and list every one an idea contains in "allergens". Never include an allergen from the leave-out list, in any form or amount.
- Safety: always describe a safe size and texture. Soft enough to squash between your fingers. Quarter grapes, cherry tomatoes and blueberries lengthwise or smash them. Cook hard fruit and vegetables (carrot, apple) until soft. Spread nut butters thinly or stir them into food, never in a lump. Never suggest whole nuts, popcorn, hot dog rounds, marshmallows, hard candy or gum.
- Under 12 months: no honey in any form, no cow's milk as a drink (it is fine cooked into food), no added salt or sugar.
- Follow the division of responsibility: you decide what, when and where food is offered; your baby decides whether and how much to eat. Never pressure, never count calories, portions or bites, never suggest "one more bite".
- No medical claims, no diagnosis, no "superfoods", nothing about weight. This is everyday food inspiration, not medical advice.
- Plain, friendly language for a parent, not a clinician. Keep every string within its character limit.`;

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
    const input = validateInput(body, Date.now());
    if (!input) return json(400, { error: "invalid_input" });

    // 3. Access, Flare+ state and the stored plan, under the caller's RLS.
    const [childRes, planRes, subRes, ownerPlusRes] = await Promise.all([
      supabase.from("children").select("id, parent_id").eq("id", input.childId).maybeSingle(),
      supabase.from("meal_plans").select("week_start").eq("child_id", input.childId).maybeSingle(),
      supabase.from("subscriptions").select("tier, status").eq("user_id", userId).maybeSingle(),
      supabase.rpc("child_owner_is_premium", { _child_id: input.childId }),
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
          messages: [{ role: "user", content: buildUserText(input) }],
        }),
      });
    } catch (e) {
      console.error("generate-meal-plan Anthropic fetch failed:", e instanceof Error ? e.message : e);
      return json(502, { error: "coach_unavailable" });
    }

    if (!response.ok) {
      const t = await response.text();
      // Anthropic's error body describes the request, not the child; truncated.
      console.error("generate-meal-plan Anthropic error:", response.status, t.slice(0, 300));
      return json(502, { error: "coach_unavailable" });
    }

    // 5. Parse + sanitize (hazard and allergen filter).
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
