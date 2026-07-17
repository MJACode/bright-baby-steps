import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function ProTermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/pro/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Grace Flare Pro Terms</h1>
        <p className="text-xs text-muted-foreground">
          Effective: July 17, 2026 · DRAFT — pending in-house legal review
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">

        <section>
          <h2 className="font-semibold text-foreground mb-2">1. What Grace Flare Pro is</h2>
          <p>Grace Flare Pro is a set of AI-assisted drafting tools for licensed speech-language pathologists: session-plan drafting, measurable goal drafting, and shareable weekly home programs. These Pro Terms are an agreement between you and <strong>Grace Flare LLC</strong> that supplements our consumer <Link to="/terms" className="text-primary underline">Terms of Service</Link>. By creating a Pro account or completing a professional profile, you accept these Pro Terms. You represent that you hold the licensure, certification, or supervised status required to provide speech-language services in your jurisdiction, and that you will use Grace Flare Pro only within the scope of that authorization.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">2. Not a medical record system</h2>
          <p>Grace Flare Pro is a drafting tool, not an electronic health record, documentation system, or system of record. <strong>We do not offer a Business Associate Agreement (BAA), and Grace Flare Pro is not designed to receive protected health information.</strong> Enter a client's first name or initials and age in months only. Do not enter surnames, dates of birth, diagnoses, ICD codes, medical or insurance records, or any other identifying or health information about a client. You are responsible for keeping your official clinical documentation in a system appropriate for it.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">3. AI outputs are drafts</h2>
          <p>Everything the AI produces — session plans, goal statements, home programs — is a draft for your professional review. You must review, edit, and approve any output before using it clinically or sharing it with a family. AI outputs are not a diagnosis, an assessment, a treatment plan of record, or a substitute for your clinical judgment, and they may contain errors. Your clinical judgment governs; Grace Flare exercises none.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">4. Client data and share links</h2>
          <p>For each client we store the display name and age you enter, the goals you save, and the session plans and home programs you generate and choose to keep. Home programs are shared with families through a link containing an unguessable token. <strong>That link is a bearer credential: anyone who has it can view the program</strong> — including the client's first name or initials, the plan content, and your name and practice. Links expire automatically 90 days after creation, and you can revoke a link at any time from the client's page. You are responsible for sending links only to the client's family and for revoking a link if it is shared more widely than intended.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">5. Your responsibilities to families</h2>
          <p>You own the therapeutic relationship. Grace Flare has no relationship with your clients or their families, does not communicate with them beyond displaying the home programs you share, and does not monitor a family's progress or lack of it. Communicating with families, obtaining any consents your practice or jurisdiction requires, and deciding what is clinically appropriate to share remain your responsibility.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">6. AI processing disclosure</h2>
          <p>When you generate a draft, the inputs you provide — the client's display name, age, saved goals, and your selections — are sent to our AI provider, <strong>Anthropic, PBC</strong>, to produce the output, under the same contractual protections described in § 4 of our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>. Your inputs and the generated outputs are not used to train AI models. This is another reason § 2 matters: keep client identifiers and health details out of what you enter.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">7. Data deletion</h2>
          <p>Deleting your account deletes your professional profile, your entire caseload (clients, goals, session plans, and home programs), and disables any active share links. Deletion works as described in § 8 of the <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>, including the short-term retention window for encrypted backups.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">8. Fees and trial</h2>
          <p>Grace Flare Pro offers a one-time 14-day free trial per account. When the trial ends, AI drafting features lock until you subscribe; your caseload, saved goals, and history remain accessible. Pricing is shown on the upgrade page and is subject to change — we will give you advance notice of price changes before they apply to an active subscription.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">9. Relationship to the consumer Terms</h2>
          <p>The consumer <Link to="/terms" className="text-primary underline">Terms of Service</Link> and <Link to="/privacy" className="text-primary underline">Privacy Policy</Link> — including the disclaimers, limitation of liability, dispute-resolution and arbitration provisions, and governing-law clause — apply to your use of Grace Flare Pro except where these Pro Terms expressly say otherwise. Where the two conflict for Pro features, these Pro Terms control. Questions: <a href="mailto:legal@graceflare.com" className="text-primary underline">legal@graceflare.com</a>.</p>
        </section>

      </div>
    </div>
  );
}
