import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { usePreferences, type ThemePreference } from "@/hooks/usePreferences";
import { useTheme } from "@/hooks/useTheme";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { User, LogOut, Baby, ClipboardList, ChevronDown, Bell, HelpCircle, Shield, Download, Trash2, Moon, Sun, SunMoon, Monitor, Sparkles, ChevronRight } from "lucide-react";
import PediatricianExport from "@/components/PediatricianExport";
import ExportHistory from "@/components/ExportHistory";
import PartnerManagement from "@/components/PartnerManagement";
import ConnectClaudeSettings from "@/components/ConnectClaudeSettings";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const MUTABLE_CATEGORIES = [
  {
    category: "milestones",
    label: "Milestones",
    description: "Month birthdays and what's coming next",
  },
  {
    category: "reminders",
    label: "Routine reminders",
    description: "Nudges for naps, feeds, and diaper checks",
  },
  {
    category: "insights",
    label: "Insights",
    description: "Summaries of your baby's patterns",
  },
  {
    category: "reactivation",
    label: "Welcome-back notes",
    description: "A friendly hello when you've been away",
  },
] as const;

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { children, activeChild } = useChildren();
  const contextFirstName = activeChild?.name.split(" ")[0];
  const { prefs, setPrefs } = usePreferences();
  const { theme, setTheme } = useTheme();
  const {
    prefs: notifPrefs,
    isReady: notifPrefsReady,
    save: saveNotifPrefs,
  } = useNotificationPrefs();
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
      // Goes through the delete-account edge function so Storage objects in
      // feedback-screenshots/{uid}/* and milestone-photos/{uid}/* are
      // purged via the Storage admin API before the DB rows are removed —
      // direct DELETE FROM storage.objects is blocked by the project's
      // protect_delete() trigger.
      const { error } = await supabase.functions.invoke("delete-account", {
        method: "POST",
      });
      if (error) throw error;
      await signOut();
    } catch {
      toast({ title: "Deletion failed", description: "Contact support@babysteps.app if this continues.", variant: "destructive" });
    } finally {
      setDeletingAccount(false);
    }
  };

  const toggleCategory = (category: string, enabled: boolean) => {
    const others = notifPrefs.muted_categories.filter((c) => c !== category);
    saveNotifPrefs({ muted_categories: enabled ? others : [...others, category] });
  };
  // Toasts outlive the render that spawned them — an action that captured
  // toggleCategory directly would merge a stale muted_categories snapshot and
  // clobber any category the user changed while the toast was open. The ref
  // always points at the latest closure.
  const toggleCategoryRef = useRef(toggleCategory);
  toggleCategoryRef.current = toggleCategory;

  const handleCalmModeChange = (checked: boolean) => {
    setPrefs({ calmMode: checked });
    if (
      checked &&
      notifPrefsReady &&
      !notifPrefs.muted_categories.includes("reminders")
    ) {
      toast({
        title: "Calm mode is on",
        description: "Want fewer pings too?",
        action: (
          <ToastAction
            altText="Mute routine reminders"
            className="touch-target"
            onClick={() => toggleCategoryRef.current("reminders", false)}
          >
            Mute routine reminders
          </ToastAction>
        ),
      });
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

      {/* Connect to Claude (MCP) */}
      <ConnectClaudeSettings />

      {/* Preferences */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preferences</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <SunMoon className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Appearance</p>
                <p className="text-xs text-muted-foreground">Dark mode is easier on your eyes during night feeds</p>
              </div>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={theme}
              onValueChange={(value) => {
                if (value) setTheme(value as ThemePreference);
              }}
              className="grid grid-cols-3 gap-2"
            >
              <ToggleGroupItem value="light" aria-label="Light theme" className="min-h-[48px] gap-1.5 text-sm">
                <Sun className="w-4 h-4" /> Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" aria-label="Dark theme" className="min-h-[48px] gap-1.5 text-sm">
                <Moon className="w-4 h-4" /> Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="system" aria-label="Match device theme" className="min-h-[48px] gap-1.5 text-sm">
                <Monitor className="w-4 h-4" /> System
              </ToggleGroupItem>
            </ToggleGroup>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Calm mode</p>
                <p className="text-xs text-muted-foreground">Softer sleep guidance — approximate times instead of countdowns, numbers tucked away</p>
              </div>
            </div>
            <Switch
              checked={prefs.calmMode}
              onCheckedChange={handleCalmModeChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification settings — synced to your account */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notifications</p>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold">Quiet hours</p>
              <p className="text-xs text-muted-foreground">We hold notifications overnight so you can rest</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="quiet-start" className="text-xs font-semibold text-muted-foreground">From</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  className="min-h-[48px]"
                  value={notifPrefs.quiet_start}
                  disabled={!notifPrefsReady}
                  onChange={(e) => {
                    if (e.target.value) saveNotifPrefs({ quiet_start: e.target.value });
                  }}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="quiet-end" className="text-xs font-semibold text-muted-foreground">Until</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  className="min-h-[48px]"
                  value={notifPrefs.quiet_end}
                  disabled={!notifPrefsReady}
                  onChange={(e) => {
                    if (e.target.value) saveNotifPrefs({ quiet_end: e.target.value });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 min-h-[48px]">
            <div>
              <p className="text-sm font-semibold">Daily limit</p>
              <p className="text-xs text-muted-foreground">Keep notifications to a comfortable amount</p>
            </div>
            <Select
              value={String(notifPrefs.daily_cap)}
              disabled={!notifPrefsReady}
              onValueChange={(v) => saveNotifPrefs({ daily_cap: Number(v) })}
            >
              <SelectTrigger className="w-40 min-h-[48px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    At most {n} a day
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center justify-between gap-3 min-h-[48px] cursor-pointer">
            <div>
              <p className="text-sm font-semibold">Morning briefing</p>
              <p className="text-xs text-muted-foreground">A short good-morning summary of yesterday</p>
            </div>
            <Switch
              checked={notifPrefs.daily_briefing}
              disabled={!notifPrefsReady}
              onCheckedChange={(checked) => saveNotifPrefs({ daily_briefing: checked })}
            />
          </label>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">What you'll hear about</p>

          <div className="flex items-center justify-between gap-3 min-h-[48px]">
            <div>
              <p className="text-sm font-semibold">Appointments</p>
              <p className="text-xs text-muted-foreground">Appointment reminders always come through</p>
            </div>
            <Switch checked disabled />
          </div>

          {MUTABLE_CATEGORIES.map(({ category, label, description }) => (
            <label key={category} className="flex items-center justify-between gap-3 min-h-[48px] cursor-pointer">
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={!notifPrefs.muted_categories.includes(category)}
                disabled={!notifPrefsReady}
                onCheckedChange={(checked) => toggleCategory(category, checked)}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      {/* About your baby — child context hub */}
      {activeChild && (
        <Card className="border-0 bg-card">
          <CardContent className="p-0">
            <Link
              to="/dashboard/child-context"
              className="flex items-center gap-3 p-4 active:scale-[0.99] transition-transform touch-target"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">
                  About {contextFirstName}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  What Grace Flare knows, and how it's used
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* AI & Data */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> AI & Data
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Grace Flare uses AI to generate chat responses, daily briefings, and weekly insights. Your child's activity data is processed by our AI provider to enable these features. You may disable briefings in Preferences at any time.
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
