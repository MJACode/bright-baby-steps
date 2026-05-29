import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export type McpConnection = {
  id: string;
  client_name: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
};

export function useMcpConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["mcp_connections"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_mcp_connections");
      if (error) throw error;
      return (data ?? []) as McpConnection[];
    },
    enabled: !!user,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_my_mcp_connection", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp_connections"] });
      toast({ title: "Connection revoked. Claude can no longer access your data." });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Please try again.";
      toast({ title: "Couldn't revoke that connection", description: message, variant: "destructive" });
    },
  });

  return { ...query, revoke };
}
