import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PRO_TERMS_VERSION } from "@/lib/proTerms";

export default function ProTermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/pro/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Grace Flare Pro Terms</h1>
        <p className="text-xs text-muted-foreground">
          Effective: July 17, 2026 · Last reviewed: July 17, 2026
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">

        <section>
          <h2 className="font-semibold text-foreground mb-2">1. What Grace Flare Pro is</h2>
          <p>Grace Flare Pro is a set of AI-assisted drafting tools for licensed speech-language pathologists: session-plan drafting, measurable goal drafting, and shareable weekly home programs. These Pro Terms are an agreement between you and <strong>Grace Flare LLC</strong> that supplements our consumer <Link to="/terms" className="text-primary underline">Terms of Service</Link>. By creating a Pro account or completing a professional profile, you accept these Pro Terms. You represent that you hold the licensure, certification, or supervised status required to provide speech-language services in your jurisdiction, and that you will use Grace Flare Pro only within the scope of that authorization.</p>
          <p className="mt-2">For Grace Flare Pro, the consumer Terms' requirements that you be the parent or legal guardian of any child whose data you add, and that you not input personal information about other people's children, do not apply; Sections 2, 4, and 5 of these Pro Terms govern client information instead. You confirm you are at least 18 years old and, if you use Grace Flare Pro on behalf of a practice, school, or employer, that you are authorized to accept these Pro Terms. You will comply with all laws and professional rules that apply to your practice.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">2. Not a medical record system</h2>
          <p>Grace Flare Pro is a drafting tool, not an electronic health record, documentation system, or system of record. <strong>We do not offer a Business Associate Agreement (BAA), and Grace Flare Pro is not designed to receive protected health information.</strong> Enter a client's first name or initials and age in months only. Do not enter surnames, dates of birth, diagnoses, ICD codes, medical or insurance records, or any other identifying or health information about a client. You are responsible for keeping your official clinical documentation in a system appropriate for it.</p>
          <p className="mt-2">Grace Flare Pro is not offered, marketed, or warranted as HIPAA-compliant, and Grace Flare LLC does not act as a business associate of any covered entity. You — not Grace Flare — are solely responsible for determining whether your use of Grace Flare Pro is permitted by the laws and rules that apply to your practice, including HIPAA, state medical-records and confidentiality laws, and your licensing board's and professional association's rules. Likewise, do not enter students' education records or personally identifiable information from education records: Grace Flare does not offer the contract terms that FERPA's school-official exception (34 CFR § 99.31(a)(1)) or state student-data-privacy laws (e.g., N.Y. Educ. Law § 2-d, California SOPIPA) require of school vendors. If we become aware of prohibited data in your account, we may delete it or suspend the account after notice to you.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">3. AI outputs are drafts</h2>
          <p>Everything the AI produces — session plans, goal statements, home programs — is a draft for your professional review. You must review, edit, and approve any output before using it clinically or sharing it with a family. AI outputs are not a diagnosis, an assessment, a treatment plan of record, or a substitute for your clinical judgment, and they may contain errors. Your clinical judgment governs; Grace Flare exercises none.</p>
          <p className="mt-2">Grace Flare LLC is not a healthcare provider, does not practice speech-language pathology, and provides software only. Some jurisdictions require licensed professionals to disclose the use of generative AI in communications with clients or patients; complying with any such disclosure obligation is your responsibility, and the home programs you share already carry a notice that they were drafted with AI assistance.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">4. Client data and share links</h2>
          <p>For each client we store the display name and age you enter, the goals you save, and the session plans and home programs you generate and choose to keep. Home programs are shared with families through a link containing an unguessable token. <strong>That link is a bearer credential: anyone who has it can view the program and check off practice days</strong> — including seeing the client's first name or initials, the plan content, and your name and practice. Links expire automatically 90 days after creation, and you can revoke a link at any time from the client's page. You are responsible for sending links only to the client's family and for revoking a link if it is shared more widely than intended.</p>
          <p className="mt-2">When a family member opens a link, we process the technical data described in § 2 of the Privacy Policy (IP address, device and browser information) to display the page; no account is created and no advertising cookies are set. We may disable a link or the sharing feature if we reasonably believe it is being abused.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">5. Your responsibilities to families</h2>
          <p>You own the therapeutic relationship. Grace Flare has no relationship with your clients or their families, does not communicate with them beyond displaying the home programs you share, and does not monitor a family's progress or lack of it. Communicating with families, obtaining any consents your practice or jurisdiction requires, and deciding what is clinically appropriate to share remain your responsibility.</p>
          <p className="mt-2">You represent that, before entering information about a client or sharing a home program link, you have obtained any authorization from the client's parent or legal guardian that your jurisdiction, licensing rules, or professional ethics require for disclosing that information to Grace Flare and its service providers.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">6. AI processing disclosure</h2>
          <p>When you generate a draft, the inputs you provide — the client's display name, age, saved goals, and your selections — are sent to our AI provider, <strong>Anthropic, PBC</strong>, to produce the output, under the same contractual protections described in § 4 and § 4A of our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>. Your inputs and the generated outputs are not used to train AI models. This is another reason § 2 matters: keep client identifiers and health details out of what you enter.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">7. Data deletion</h2>
          <p>Deleting your account deletes your professional profile, your entire caseload (clients, goals, session plans, and home programs), and disables any active share links. Deletion works as described in §§ 8–9 of the <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>, including the short-term retention window for encrypted backups.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">8. Fees and trial</h2>
          <p>Grace Flare Pro offers a one-time 14-day free trial per account. When the trial ends, AI drafting features lock until you subscribe; your caseload, saved goals, and history remain accessible. Pricing is shown on the upgrade page and is subject to change — we will give you advance notice of price changes before they apply to an active subscription.</p>
          <p className="mt-2">If you purchase a subscription, it will renew automatically at the then-current price until you cancel; we will disclose the renewal terms and price at purchase, and you can cancel at any time from the upgrade page, effective at the end of the current billing period.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">9. Drafts and ownership</h2>
          <p>As between you and Grace Flare, you own the information you enter and the drafts you accept and save, and you may use edited outputs in your professional documentation. Because outputs are AI-generated, similar or identical outputs may be produced for other users, and we make no promise of uniqueness or of protectability under copyright.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">10. Indemnification</h2>
          <p>You will defend and indemnify Grace Flare LLC against third-party claims, and resulting damages and reasonable attorneys' fees, to the extent arising from (a) the professional services you provide or fail to provide; (b) information you enter in violation of Section 2; (c) your sharing of a home-program link; or (d) your breach of the representations in Sections 1, 2, and 5. This does not apply to the extent a claim is caused by Grace Flare's own breach of these Pro Terms.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">11. Relationship to the consumer Terms</h2>
          <p>The consumer <Link to="/terms" className="text-primary underline">Terms of Service</Link> and <Link to="/privacy" className="text-primary underline">Privacy Policy</Link> — including the disclaimers, limitation of liability, dispute-resolution and arbitration provisions, and governing-law clause — apply to your use of Grace Flare Pro except where these Pro Terms expressly say otherwise. Where the two conflict for Pro features, these Pro Terms control. Questions: <a href="mailto:legal@graceflare.com" className="text-primary underline">legal@graceflare.com</a>.</p>
        </section>

        <p className="text-xs text-muted-foreground">Grace Flare Pro Terms · Version {PRO_TERMS_VERSION}</p>

      </div>
    </div>
  );
}
