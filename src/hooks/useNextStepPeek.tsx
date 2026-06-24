import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NextStepItem } from "@/lib/nextSteps";

interface NextStepPeek {
  answer: string;
}

export function useNextStepPeek(opts: {
  childId?: string;
  item: NextStepItem;
  enabled: boolean;
}) {
  const { childId, item, enabled } = opts;
  const { seedPrompt, forceSkill } = item.deeplink;

  return useQuery<NextStepPeek>({
    queryKey: ["next-step-peek", childId, item.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("next-step-peek", {
        body: { childId, seedPrompt, skill: forceSkill },
      });
      if (error) throw error;
      return data as NextStepPeek;
    },
    enabled:
      enabled &&
      !!childId &&
      item.deeplink.kind === "chat" &&
      !!seedPrompt &&
      !!forceSkill,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}
