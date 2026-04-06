import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subHours } from "date-fns";

export interface ChildContext {
  childName: string;
  childAge: string;
  childAgeWeeks: number;
  isPremature: boolean;
  twoCaregiversActive: boolean;
  recentActivity: string;
  confirmedAllergens: string[];
  activeIllnesses: string[];
  nextAppointment: string | null;
}

export function useChildContext(childId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["child-context", childId, user?.id],
    queryFn: async (): Promise<ChildContext | null> => {
      if (!childId || !user) return null;

      // 1. Get child info
      const { data: child } = await supabase
        .from("children")
        .select("name, date_of_birth, parent_id, is_premature, next_appointment")
        .eq("id", childId)
        .single();

      if (!child) return null;

      // 2. Check for active partner
      const ownerId = child.parent_id;
      let partnerIds: string[] = [];
      let twoCaregiversActive = false;

      // Find partners who have access to this child's owner
      const { data: partnerAccess } = await supabase
        .from("partner_access")
        .select("partner_id, owner_id")
        .eq("status", "active")
        .or(`owner_id.eq.${ownerId},partner_id.eq.${ownerId}`);

      if (partnerAccess && partnerAccess.length > 0) {
        twoCaregiversActive = true;
        // Collect all caregiver IDs (owner + partners)
        const allIds = new Set<string>();
        allIds.add(ownerId);
        partnerAccess.forEach((pa) => {
          allIds.add(pa.partner_id);
          allIds.add(pa.owner_id);
        });
        partnerIds = Array.from(allIds).filter((id) => id !== user.id);
      }

      // 3. Calculate child age
      const dob = new Date(child.date_of_birth);
      const now = new Date();
      const ageDays = Math.floor((now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24));
      const ageWeeks = Math.floor(ageDays / 7);
      const ageMonths = Math.floor(ageDays / 30.44);
      const childAge = ageMonths < 24
        ? `${ageMonths} months old`
        : `${Math.floor(ageMonths / 12)} years ${ageMonths % 12} months old`;

      // 4. Fetch recent logs (last 24h) — RLS handles access for both parent & partner
      const since = subHours(now, 24).toISOString();

      const [sleepRes, feedRes, diaperRes, allergenRes, illnessRes] = await Promise.all([
        supabase
          .from("sleep_logs")
          .select("sleep_type, duration_minutes, started_at, parent_id")
          .eq("child_id", childId)
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .limit(10),
        supabase
          .from("feeding_logs")
          .select("feeding_type, amount_oz, duration_minutes, logged_at, parent_id")
          .eq("child_id", childId)
          .gte("logged_at", since)
          .order("logged_at", { ascending: false })
          .limit(10),
        supabase
          .from("diaper_logs")
          .select("diaper_type, logged_at, parent_id")
          .eq("child_id", childId)
          .gte("logged_at", since)
          .order("logged_at", { ascending: false })
          .limit(10),
        supabase
          .from("allergen_introductions")
          .select("status, allergen_id, allergens(name)")
          .eq("child_id", childId)
          .in("status", ["introduced", "monitoring"]),
        supabase
          .from("illness_logs")
          .select("illness_name")
          .eq("child_id", childId)
          .is("end_date", null),
      ]);

      // 5. Build activity summary with attribution
      const lines: string[] = [];

      const tag = (parentId: string) =>
        twoCaregiversActive
          ? parentId === user.id
            ? " (you)"
            : " (partner)"
          : "";

      (sleepRes.data || []).forEach((s) => {
        const time = format(new Date(s.started_at), "h:mm a");
        lines.push(
          `${s.sleep_type === "night" ? "🌙 Night" : "☀️ Nap"} — ${s.duration_minutes || "?"}min at ${time}${tag(s.parent_id)}`
        );
      });

      (feedRes.data || []).forEach((f) => {
        const time = format(new Date(f.logged_at), "h:mm a");
        const detail = f.amount_oz ? ` ${f.amount_oz}oz` : f.duration_minutes ? ` ${f.duration_minutes}min` : "";
        lines.push(`🍼 ${f.feeding_type}${detail} at ${time}${tag(f.parent_id)}`);
      });

      (diaperRes.data || []).forEach((d) => {
        const time = format(new Date(d.logged_at), "h:mm a");
        lines.push(`🧷 ${d.diaper_type} diaper at ${time}${tag(d.parent_id)}`);
      });

      // 6. Extract allergens & illnesses
      const confirmedAllergens = (allergenRes.data || [])
        .map((a: any) => `${a.allergens?.name || "Unknown"} (${a.status})`)
        .filter(Boolean);

      const activeIllnesses = (illnessRes.data || [])
        .map((i) => i.illness_name);

      return {
        childName: child.name,
        childAge,
        childAgeWeeks: ageWeeks,
        isPremature: child.is_premature || false,
        twoCaregiversActive,
        recentActivity: lines.length > 0 ? lines.join("\n") : "No activity logged in the last 24 hours.",
        confirmedAllergens,
        activeIllnesses,
        nextAppointment: child.next_appointment,
      };
    },
    enabled: !!childId && !!user,
    staleTime: 60_000, // refresh every minute
  });
}
