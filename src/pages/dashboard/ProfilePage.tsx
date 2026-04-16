import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { User, LogOut, Baby, ClipboardList, ChevronDown, Bell, Sparkles, HelpCircle, Shield, Download, Trash2 } from "lucide-react";
import PediatricianExport from "@/components/PediatricianExport";
import ExportHistory from "@/components/ExportHistory";
import PartnerManagement from "@/components/PartnerManagement";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { toast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { children } = useChildren();
  const { prefs, setPrefs } = usePreferences();
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleExportData = async () => {
    if (!user) return;
    setExportingData(true);
    try {
      const [
        { data: childrenData },
        { data: sleepLogs },
        { data: feedingLogs },
        { data: diaperLogs },
        { data: milestones },
        { data: speechJournal },
        { data: illnessLogs },
        { data: medicationLogs },
        { data: chatConversations },
      ] = await Promise.all([
        supabase.from("children").select("*"),
        supabase.from("sleep_logs").select("*"),
        supabase.from("feeding_logs").select("*"),
        supabase.from("diaper_logs").select("*"),
        supabase.from("child_speech").select("*"),
        supabase.from("speech_journal").select("*"),
        supabase.from("illness_logs").select("*"),
        supabase.from("medication_logs").select("*"),
        supabase.from("chat_conversations").select("id, title, created_at"),
      ]);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        account: { email: user.email, id: user.id },
        children: childrenData ?? [],
        sleepLogs: sleepLogs ?? [],
        feedingLogs: feedingLogs ?? [],
        diaperLogs: diaperLogs ?? [],
        milestones: milestones ?? [],
        speechJournal: speechJournal ?? [],
        illnessLogs: illnessLogs ?? [],
        medicationLogs: medicationLogs ?? [],
        chatConversations: chatConversations ?? [],
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `baby-steps-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully." });
    } catch {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      await supabase.rpc("delete_user_account" as any);
      await signOut();
    } catch {
      toast({ title: "Deletion failed", description: "Contact support@babysteps.app if this continues.", variant: "destructive" });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <User className="w-7 h-7 text-primary" /> Profile & Settings
        </h1>
      </div>

      {/* Account info */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">{user?.email}</p>
          {children.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Baby className="w-4 h-4" />
              {children.map((c) => c.name).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pediatrician Report — collapsible */}
      <Collapsible>
        <Card className="border-0 bg-muted/50">
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> Custom Report
              </CardTitle>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">
                Need a custom date range or specific sections? Configure below.
              </p>
              <PediatricianExport />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Export History */}
      <ExportHistory />

      {/* Partner Management */}
      <PartnerManagement />

      {/* Preferences */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preferences</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Today's Briefing</p>
                <p className="text-xs text-muted-foreground">AI daily summary on home screen</p>
              </div>
            </div>
            <Switch
              checked={prefs.showBriefing}
              onCheckedChange={(checked) => setPrefs({ showBriefing: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Notifications</p>
                <p className="text-xs text-muted-foreground">Bell icon and reminders</p>
              </div>
            </div>
            <Switch
              checked={prefs.showNotifications}
              onCheckedChange={(checked) => setPrefs({ showNotifications: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* AI & Data */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> AI & Data
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Baby Steps uses AI to generate chat responses, daily briefings, and weekly insights. Your child's activity data is processed by our AI provider to enable these features. You may disable briefings in Preferences at any time.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 gap-1.5"
              onClick={handleExportData}
              disabled={exportingData}
            >
              <Download className="w-3.5 h-3.5" />
              {exportingData ? "Exporting..." : "Export My Data"}
            </Button>
            <Link to="/faq">
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> FAQ
              </Button>
            </Link>
            <Link to="/privacy">
              <Button variant="ghost" size="sm" className="text-xs h-8 text-muted-foreground">
                Privacy Policy
              </Button>
            </Link>
            <Link to="/terms">
              <Button variant="ghost" size="sm" className="text-xs h-8 text-muted-foreground">
                Terms
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Feedback */}
      <FeedbackDialog />

      {/* Sign out */}
      <Button variant="outline" onClick={signOut} className="w-full gap-2">
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>

      {/* Danger Zone */}
      <Card className="border border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Danger Zone</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Permanently delete your account and all tracking data for all children. This cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5 text-xs h-8">
                <Trash2 className="w-3.5 h-3.5" /> Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account and all associated data — children, logs, milestones, chat history, and everything else. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {deletingAccount ? "Deleting..." : "Yes, delete everything"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
