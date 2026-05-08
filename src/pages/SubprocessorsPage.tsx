import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    name: "Anthropic, PBC",
    purpose: "AI provider for chat responses, daily briefings, and weekly insights.",
    dataCategories: "Child first name, age, and the relevant logged activity needed to answer a prompt. Not used to train models. Retained by Anthropic for abuse-monitoring no longer than 30 days, then deleted.",
    location: "United States",
    transferMechanism: "Direct U.S.-based processing under a written Data Processing Addendum.",
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
];

export default function SubprocessorsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/privacy" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Privacy Policy
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Subprocessors</h1>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Last updated: May 2026</p>
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Draft — pending legal review</Badge>
        </div>
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
