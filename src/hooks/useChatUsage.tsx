import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePremium } from "@/hooks/usePremium";

// Keep in sync with FREE_DAILY_LIMIT in supabase/functions/chat/index.ts.
export const FREE_DAILY_LIMIT = 10;

interface ChatUsage {
  used: number;
  remaining: number;
  limit: number;
  isUnlimited: boolean;
  isLoading: boolean;
}

/**
 * Daily expert-chat usage for the current user.
 *
 * Free tier (`subscriptions.tier !== 'plus'`): caps at FREE_DAILY_LIMIT messages
 * per UTC day, derived from `chat_messages` joined to `chat_conversations`.
 * Flare+ users: `isUnlimited` true, count not queried.
 *
 * Invalidate via `queryClient.invalidateQueries({ queryKey: ["chat-usage"] })`
 * after each successful chat message so the badge updates immediately.
 */
export function useChatUsage(): ChatUsage {
  const { user } = useAuth();
  const { isPremium, isLoading: premiumLoading } = usePremium();

  const query = useQuery({
    queryKey: ["chat-usage", user?.id],
    enabled: !!user?.id && !isPremium && !premiumLoading,
    queryFn: async () => {
      const startOfDayUtc = new Date();
      startOfDayUtc.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("chat_messages")
        .select("id, chat_conversations!inner(user_id)", {
          count: "exact",
          head: true,
        })
        .eq("chat_conversations.user_id", user!.id)
        .eq("role", "user")
        .gte("created_at", startOfDayUtc.toISOString());
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  if (isPremium) {
    return {
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      limit: Number.POSITIVE_INFINITY,
      isUnlimited: true,
      isLoading: premiumLoading,
    };
  }

  const used = query.data ?? 0;
  return {
    used,
    remaining: Math.max(0, FREE_DAILY_LIMIT - used),
    limit: FREE_DAILY_LIMIT,
    isUnlimited: false,
    isLoading: premiumLoading || query.isLoading,
  };
}
