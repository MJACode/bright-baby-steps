import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "Is Grace Flare a medical app?",
    a: "No. Grace Flare is an informational tracking and reference tool. Nothing in this app constitutes medical advice, diagnosis, or treatment. Always consult your child's pediatrician or a qualified healthcare provider with any health questions or concerns.",
  },
  {
    q: "What does the AI assistant do?",
    a: "The AI chat provides general information based on widely-used guidelines from organisations such as the AAP, ASHA, CDC, and WHO. It draws on your child's logged activity data to make responses more relevant. It does not diagnose conditions, prescribe treatments, or replace professional medical assessment.",
  },
  {
    q: "When should I call 911?",
    a: "Call 911 or go to your nearest emergency room if your child is having difficulty breathing, is unresponsive, is having a seizure, has severe swelling of the face or throat after eating, or if you are concerned about any life-threatening situation. Do not rely on this app in an emergency.",
  },
  {
    q: "What data does Grace Flare store?",
    a: "We store the information you enter: your child's name, date of birth, feeding, sleep, diaper, allergen, milestone, and health logs. We also store your account email and any notes you add. See our Privacy Policy for full details.",
  },
  {
    q: "Is my child's data sent to third parties?",
    a: "Some of your child's data is processed by Anthropic, our AI service provider, to power chat responses, daily briefings, weekly insights, voice-note transcription parsing, and (for parents who use the optional photo-milestone feature) photo-based milestone detection. We have requested a Data Processing Addendum from Anthropic that we expect to confirm your data is not used to train models and that abuse-monitoring retention is no longer than 30 days; the executed agreement's status is on /subprocessors. We do not sell your data and we do not share it for cross-context behavioural advertising. We also use a small number of operational service providers (hosting, transactional email, anonymous IP-country lookup at signup) listed at /subprocessors. See our Privacy Policy for full details.",
  },
  {
    q: "Can I share access with my partner or caregiver?",
    a: "Yes. You can invite a co-parent or caregiver via the Partner Management section in your Profile. They will be able to view and log activity for your child. You can revoke their access at any time from the same section.",
  },
  {
    q: "How do I delete my account and data?",
    a: "Go to Profile → Delete Account. Your primary records are removed within 7 days, uploaded files within 30 days, and any copies in encrypted backups are purged on our backup-rotation cycle (no longer than 30 days). Anthropic deletes its copy of your AI inputs and outputs within 30 days. This action cannot be undone. See § 8 of our Privacy Policy for full detail.",
  },
  {
    q: "Is Grace Flare suitable if my child has a diagnosed medical condition?",
    a: "Grace Flare is designed for general tracking and informational guidance. If your child has a diagnosed or suspected medical condition, please work closely with your healthcare team. This app should not be your primary resource for managing any medical condition.",
  },
  {
    q: "Who can I contact with questions or concerns?",
    a: "General support: support@graceflare.com. Privacy questions: privacy@graceflare.com. Children's-privacy (COPPA) requests: coppa@graceflare.com.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-start justify-between gap-3 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-medium leading-snug">{q}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 mt-0.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <p className="text-sm text-foreground/80 leading-relaxed pb-4">{a}</p>
      )}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/dashboard/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Frequently Asked Questions</h1>
        <p className="text-sm text-muted-foreground mt-1">Common questions about Grace Flare, AI features, and your data.</p>
      </div>

      <div className="rounded-xl border border-border bg-card px-4">
        {FAQS.map((item) => (
          <FAQItem key={item.q} q={item.q} a={item.a} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center">
        Still have questions?{" "}
        <a href="mailto:support@graceflare.com" className="text-primary underline">Contact us</a>
        {" · "}
        <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>
        {" · "}
        <Link to="/terms" className="text-primary underline">Terms of Service</Link>
      </p>
    </div>
  );
}
