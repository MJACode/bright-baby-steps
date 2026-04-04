import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Message = { role: "user" | "assistant"; content: string };

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  child_id: string | null;
}

export function useChatHistory(activeChildId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Fetch recent conversations
  const { data: conversations = [] } = useQuery({
    queryKey: ["chat-conversations", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_conversations")
        .select("id, title, created_at, updated_at, child_id")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Conversation[];
    },
    enabled: !!user,
  });

  // Fetch messages for the active conversation
  const { data: savedMessages = [] } = useQuery({
    queryKey: ["chat-messages", activeConversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("conversation_id", activeConversationId!)
        .order("created_at", { ascending: true });
      return (data ?? []) as Message[];
    },
    enabled: !!activeConversationId,
  });

  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (!user) return null;
    const title = firstMessage.slice(0, 60) || "New Chat";
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: user.id, child_id: activeChildId ?? null, title })
      .select("id")
      .single();
    if (error || !data) return null;
    setActiveConversationId(data.id);
    queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    return data.id;
  }, [user, activeChildId, queryClient]);

  const saveMessages = useCallback(async (conversationId: string, messages: Message[]) => {
    if (!conversationId || messages.length === 0) return;
    const rows = messages.map((m) => ({
      conversation_id: conversationId,
      role: m.role,
      content: m.content,
    }));
    await supabase.from("chat_messages").insert(rows);
    // Update conversation title & timestamp
    const firstUserMsg = messages.find(m => m.role === "user");
    if (firstUserMsg) {
      await supabase
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
  }, []);

  const startNewChat = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const openConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from("chat_conversations").delete().eq("id", id);
    if (activeConversationId === id) setActiveConversationId(null);
    queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
  }, [activeConversationId, queryClient]);

  return {
    conversations,
    activeConversationId,
    savedMessages,
    createConversation,
    saveMessages,
    startNewChat,
    openConversation,
    deleteConversation,
  };
}
