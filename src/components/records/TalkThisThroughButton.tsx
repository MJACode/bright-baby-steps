import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { openChat } from "@/lib/chatOpener";
import type { SkillId } from "@/components/AIChatWidget";

export function TalkThisThroughButton({
  seedPrompt,
  forceSkill,
}: {
  seedPrompt: string;
  forceSkill?: SkillId;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="touch-target gap-1.5"
      onClick={() => openChat({ seedPrompt, forceSkill })}
    >
      <MessageCircle className="w-3.5 h-3.5" />
      Talk this through
    </Button>
  );
}
