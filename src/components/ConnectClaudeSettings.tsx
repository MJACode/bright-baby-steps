import { Link } from "react-router-dom";
import { useMcpConnections } from "@/hooks/useMcpConnections";
import { usePremium } from "@/hooks/usePremium";
import { APP_URL } from "@/lib/appUrl";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles,
  Copy,
  Plug,
  Trash2,
  ChevronDown,
  Lock,
  HelpCircle,
} from "lucide-react";
import { format } from "date-fns";

const MCP_SERVER_URL = `${APP_URL}/mcp`;

export default function ConnectClaudeSettings() {
  const { data: connections = [], isLoading, revoke } = useMcpConnections();
  const { isPremium, isLoading: premiumLoading } = usePremium();

  const copyText = async (text: string) => {
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: text });
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast({ title: "Server URL copied to clipboard! 📋" });
  };

  // Show the upgrade prompt instead of the setup card on free tier. We still
  // render the active-connections list below so partner caregivers (bound to an
  // owner's tier) or anyone with grandfathered tokens can still see and revoke.
  const showUpgradeCard = !premiumLoading && !isPremium;

  return (
    <Card className="border-0 bg-muted/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Connect to Claude
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect your own Claude (Claude.ai or Claude Desktop) to read your baby's tracked data and answer your questions. Access is <strong>read-only</strong> — Claude can read your logs but can never change or delete anything.
        </p>

        {showUpgradeCard ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Flare+ unlocks this</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Connecting your own Claude is part of Flare+. Upgrade once and your Claude can read your tracked logs over a secure, read-only connection.
            </p>
            <Button asChild size="sm" className="w-full touch-target">
              <Link to="/upgrade">See Flare+</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Server URL to paste into Claude */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">Server URL</p>
              <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
                <Plug className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs truncate flex-1 font-mono">{MCP_SERVER_URL}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => copyText(MCP_SERVER_URL)}
                  aria-label="Copy server URL"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                In Claude, add a custom connector and paste this URL. Claude will ask you to sign in and approve access.
              </p>
            </div>

            {/* How to connect — step-by-step */}
            <Collapsible>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
                  <HelpCircle className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold flex-1 text-left">How to connect</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 px-1">
                <ol className="text-xs text-muted-foreground leading-relaxed space-y-2 list-decimal pl-5">
                  <li>
                    Open <strong>Claude.ai</strong> in your browser, or <strong>Claude Desktop</strong>, and go to <strong>Settings</strong> → <strong>Connectors</strong> (sometimes labeled "Custom connectors").
                  </li>
                  <li>
                    Choose <strong>Add a connector</strong> (or <strong>Custom connector</strong>) and paste the server URL shown above.
                  </li>
                  <li>
                    Claude will open a Grace Flare consent screen. Sign in if asked, then tap <strong>Approve access</strong>.
                  </li>
                  <li>
                    Back in Claude, ask things like:
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      <li><em>"What's our nap pattern this week?"</em></li>
                      <li><em>"How much did the baby eat yesterday?"</em></li>
                      <li><em>"What milestones has she hit so far?"</em></li>
                    </ul>
                  </li>
                  <li>
                    You can revoke access any time from this same settings card.
                  </li>
                </ol>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {/* Active connections */}
        <div className="space-y-2">
          <p className="text-xs font-semibold">Connected AI assistants</p>
          {isLoading ? (
            <div className="bg-background rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground animate-pulse">Loading connections…</p>
            </div>
          ) : connections.length === 0 ? (
            <div className="bg-background rounded-lg px-3 py-3">
              <p className="text-xs text-muted-foreground">No connected AI assistants yet.</p>
            </div>
          ) : (
            connections.map((conn) => {
              const isRevoked = !!conn.revoked_at;
              return (
                <div
                  key={conn.id}
                  className={`flex items-center justify-between bg-background rounded-lg px-3 py-2 ${isRevoked ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm flex items-center gap-2 truncate">
                      {conn.client_name ?? "Claude"}
                      {isRevoked && (
                        <span className="text-[10px] font-mono uppercase text-muted-foreground">Revoked</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Connected {format(new Date(conn.created_at), "MMM d, yyyy")}
                      {" · "}
                      {conn.last_used_at
                        ? `Last used ${format(new Date(conn.last_used_at), "MMM d, yyyy")}`
                        : "Never used"}
                    </p>
                  </div>
                  {!isRevoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7 text-xs gap-1 shrink-0"
                      onClick={() => revoke.mutate(conn.id)}
                      disabled={revoke.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Revoke
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* LEGAL: MCP Stage 2 — pending review */}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          When you connect your own Claude, your child's data is sent to that Claude product and handled under your own agreement with Anthropic — separate from how Grace Flare uses AI inside the app. Revoke access here any time.
        </p>
      </CardContent>
    </Card>
  );
}
