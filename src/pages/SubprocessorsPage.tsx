import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { MCP_READ_CATEGORIES } from "@/lib/mcpReadCategories";

// Stay in sync with the consent screen + the MCP server tool list.
const MCP_CATEGORY_LIST = MCP_READ_CATEGORIES.map((c) => c.label.toLowerCase()).join(", ");

interface Subprocessor {
  name: string;
  purpose: string;
  dataCategories: string;
  location: string;
  transferMechanism: string;
  website: string;
}

const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Supabase, Inc.",
    purpose: "Authentication, Postgres database, file storage, and edge functions that power Grace Flare.",
    dataCategories: "All account, child profile, tracking, chat, and technical data described in Privacy Policy § 2.",
    location: "United States",
    transferMechanism: "Direct U.S.-based processing. EU/EEA and UK users are not currently served (geo-block at signup).",
    website: "https://supabase.com",
  },
  {
    /* LEGAL: MCP Stage 2 — pending review */
    name: "Anthropic, PBC",
    purpose: "AI provider for chat responses, daily briefings, weekly insights, voice-note transcription parsing, pediatrician visit-prep question suggestions, Speech Class practice plans, and Grace Flare Pro drafting for professional accounts (session plans, goal drafts, and home programs — see Privacy Policy § 4A). Also receives child data through the optional \"Connect to Claude\" (MCP) integration when a parent connects their own Claude product and explicitly grants read-only access.",
    dataCategories: `Depends on feature. Chat / briefings / insights: child first name, age, and relevant logged activity needed to answer a prompt. Voice-note parsing: the transcript text of the note. Visit Prep: child first name, age and prematurity status, visit date and type, 30-day sleep/feeding/diaper summaries, recent temperature, illness, and growth records, open milestone topics, existing reminder-list text, and saved child notes. Speech Class: child first name, age (corrected if premature), and up to 30 recent Word & Sound Journal entries. Connect to Claude (MCP): the child's tracked logs (${MCP_CATEGORY_LIST}) that the parent's own Claude reads over the authenticated connection. Not used to train models. Data processed for Grace Flare is retained by Anthropic for a limited period of safety/abuse review per its Usage Policy, then deleted; data accessed via a parent's own Claude is additionally governed by that parent's separate agreement with Anthropic.`,
    location: "United States",
    transferMechanism: "Direct U.S.-based processing under a Data Processing Addendum accepted May 8, 2026. SCCs Module Two and Module Three (Decision 2021/914) plus UK and Swiss addenda are incorporated for any future cross-border transfer — see Privacy Policy § 4.",
    website: "https://www.anthropic.com",
  },
  {
    name: "Resend Software, Inc.",
    purpose: "Transactional email delivery (parental-consent confirmations under COPPA, account notifications).",
    dataCategories: "Account email address, full name, and the body of the email being sent.",
    location: "United States",
    transferMechanism: "Direct U.S.-based processing.",
    website: "https://resend.com",
  },
  {
    name: "api.country.is (Aiden Bishop)",
    purpose: "Anonymous, IP-based country lookup at the signup page to apply Grace Flare's EEA / UK geographic restriction. Called once per session.",
    dataCategories: "Visitor IP address. No cookie or persistent identifier is set. Only the ISO-3166 country code is returned to Grace Flare; the IP is not stored.",
    location: "United States (Cloudflare-fronted)",
    transferMechanism: "Single-purpose lookup; no personal data stored or used for further processing.",
    website: "https://api.country.is",
  },
];

export default function SubprocessorsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/privacy" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Privacy Policy
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Subprocessors</h1>
        <p className="text-xs text-muted-foreground">
          Effective: May 8, 2026 · Last reviewed: July 2, 2026
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">
        <section>
          <p>
            Grace Flare LLC engages the following service providers ("subprocessors")
            to operate the service. Each subprocessor processes personal information
            only on our instructions, under a written data-processing agreement.
            We will give at least <strong>30 days' notice</strong> before adding or
            replacing a subprocessor; you may object during that window by emailing{" "}
            <a href="mailto:privacy@graceflare.com" className="text-primary underline">
              privacy@graceflare.com
            </a>
            .
          </p>
        </section>

        <section className="space-y-4">
          {SUBPROCESSORS.map((sp) => (
            <div key={sp.name} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-foreground">{sp.name}</h2>
                <a
                  href={sp.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline shrink-0"
                >
                  Website
                </a>
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="grid grid-cols-[100px_1fr] gap-x-3">
                  <dt className="text-muted-foreground font-medium">Purpose</dt>
                  <dd className="text-foreground/80">{sp.purpose}</dd>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-x-3">
                  <dt className="text-muted-foreground font-medium">Data</dt>
                  <dd className="text-foreground/80">{sp.dataCategories}</dd>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-x-3">
                  <dt className="text-muted-foreground font-medium">Location</dt>
                  <dd className="text-foreground/80">{sp.location}</dd>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-x-3">
                  <dt className="text-muted-foreground font-medium">Transfers</dt>
                  <dd className="text-foreground/80">{sp.transferMechanism}</dd>
                </div>
              </dl>
            </div>
          ))}
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">Get notified of changes</h2>
          <p>
            To receive email notifications of subprocessor changes, send a request to{" "}
            <a href="mailto:privacy@graceflare.com" className="text-primary underline">
              privacy@graceflare.com
            </a>{" "}
            with the subject "Subprocessor notifications."
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">Questions</h2>
          <p>
            Privacy questions:{" "}
            <a href="mailto:privacy@graceflare.com" className="text-primary underline">
              privacy@graceflare.com
            </a>
            . Children's-privacy (COPPA) requests:{" "}
            <a href="mailto:coppa@graceflare.com" className="text-primary underline">
              coppa@graceflare.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
