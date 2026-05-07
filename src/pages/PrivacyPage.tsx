import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Privacy Policy</h1>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Last updated: May 2026</p>
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Draft — pending legal review</Badge>
        </div>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">

        <section>
          <h2 className="font-semibold text-foreground mb-2">1. Who we are</h2>
          <p>Grace Flare (graceflare.com) is operated by <strong>Grace Flare LLC</strong>, a Delaware limited liability company, located at <strong>[REGISTERED AGENT ADDRESS — TBD]</strong>. For privacy questions, contact <a href="mailto:privacy@graceflare.com" className="text-primary underline">privacy@graceflare.com</a>. For children's-privacy (COPPA) requests, contact <a href="mailto:coppa@graceflare.com" className="text-primary underline">coppa@graceflare.com</a>. General support: <a href="mailto:support@graceflare.com" className="text-primary underline">support@graceflare.com</a>.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">2. What data we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data:</strong> your name and email address, collected when you create an account.</li>
            <li><strong>Child profile data:</strong> your child's name, date of birth, gender (optional), prematurity status, and photo (optional).</li>
            <li><strong>Tracking data:</strong> sleep, feeding, diaper, allergen introduction, milestone, illness, medication, and supplement records that you choose to log.</li>
            <li><strong>Chat data:</strong> your messages to the AI assistant and the responses generated.</li>
            <li><strong>Technical data:</strong> IP address, device type and operating system, browser type and version, app version, session identifiers, crash logs, and approximate location derived from your IP address (city-level only). We use first-party cookies and equivalent local-storage tokens strictly to keep you signed in and to remember your preferences. We do not use third-party advertising cookies or cross-site tracking pixels.</li>
            <li><strong>Feedback attachments:</strong> any screenshot you choose to upload with a feedback report.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">3. How we use your data</h2>
          <p>We use your data to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Provide the Grace Flare tracking and AI features.</li>
            <li>Generate daily briefings, weekly insights, and chat responses using your child's logged activity.</li>
            <li>Send you optional reminders and notifications.</li>
            <li>Secure the service, prevent fraud and abuse, and produce aggregated, de-identified usage statistics to fix bugs and prioritise features. We do <strong>not</strong> use your child's tracking data, chat content, or photos for product analytics, A/B tests, or model evaluation.</li>
          </ul>
          <p className="mt-2">For users in the EU/EEA and UK, we rely on the following lawful bases under GDPR Art. 6(1): <strong>(a) performance of a contract</strong> — to operate your account, store your child's records, and deliver features you request; <strong>(b) consent</strong> — for AI-assisted guidance and any optional feature you opt into; <strong>(c) legitimate interest</strong> — for security, fraud prevention, and aggregated, de-identified product analytics, balanced against your rights and documented in an internal Legitimate Interests Assessment available on request.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">4. AI processing</h2>
          <p>Grace Flare uses <strong>Anthropic</strong> as its AI service provider to power chat responses, daily briefings, and weekly insights. The data transmitted to Anthropic is limited to your child's first name, age, and the relevant logged activity needed to answer your prompt. We have a written Data Processing Addendum with Anthropic that contractually prohibits use of your data to train, fine-tune, or improve any general-purpose model. Inputs and outputs are retained by Anthropic for abuse-monitoring purposes for no more than <strong>30 days</strong> and are then deleted. For users in the EU/EEA and UK, transfers to the United States are governed by the European Commission's Standard Contractual Clauses (Decision 2021/914) and the UK International Data Transfer Addendum.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">5. Sharing your data</h2>
          <p>We do <strong>not</strong> sell your personal information, and we do not "share" it for cross-context behavioural advertising as those terms are defined under the California Consumer Privacy Act. We have not sold or shared personal information for cross-context behavioural advertising in the preceding 12 months. We share data only with:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Anthropic, as our AI processor (described in § 4).</li>
            <li>Co-parents or caregivers you explicitly invite via the Partner Access feature.</li>
            <li>Service providers who help us operate Grace Flare (e.g. our database and hosting provider, transactional-email vendor), each under a written data-processing agreement.</li>
          </ul>
          <p className="mt-2">A current list of subprocessors is maintained at <Link to="/subprocessors" className="text-primary underline">/subprocessors</Link>. We will give at least 30 days' notice before adding or replacing a subprocessor; you may object during that window.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">6. Children's data (COPPA)</h2>
          <p>Grace Flare is a parent-facing service. Accounts are only for adults age 18 or older who are the parent or legal guardian of the child whose data is logged. <strong>Children may not create their own accounts and Grace Flare is not directed to children under 13.</strong></p>
          <p className="mt-2">Because Grace Flare collects personal information <strong>about children under 13</strong> (their name, date of birth, photo, and health observations) from their parents, we follow the U.S. Children's Online Privacy Protection Act (COPPA, 15 U.S.C. § 6501–6506; 16 CFR Part 312):</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Verifiable Parental Consent.</strong> Before we collect or store identifiable information about your child, we obtain verifiable parental consent using an <strong>email-plus</strong> mechanism: you confirm a unique link sent to your account email, and we send a second confirmation email at least 24 hours later before any child record is unlocked. You can withdraw consent at any time by deleting the child record or your account.</li>
            <li><strong>Direct notice.</strong> Before you add a child, we show a separate direct notice that summarises what we collect, how we use it, that we do not disclose it to third parties beyond the processors listed in § 5, and your parental rights below — distinct from this general policy.</li>
            <li><strong>Parental rights.</strong> You may at any time (i) review the personal information we have collected about your child, (ii) delete it, and (iii) refuse to permit further collection. Use Profile → Manage Child Data, or email <a href="mailto:coppa@graceflare.com" className="text-primary underline">coppa@graceflare.com</a>.</li>
            <li><strong>No conditioning.</strong> We do not require a child to provide more personal information than is reasonably necessary to use a feature.</li>
            <li><strong>No third-party disclosure without separate consent.</strong> Any disclosure of your child's data to a recipient not listed in § 5 will require your separate, opt-in consent.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">7. Your rights</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access:</strong> view all your data within the app at any time, or request a copy.</li>
            <li><strong>Correction:</strong> edit your child's profile and any logged data at any time.</li>
            <li><strong>Deletion / right to erasure (GDPR Art. 17):</strong> delete your account and all associated data from Profile → Delete Account.</li>
            <li><strong>Portability (GDPR Art. 20):</strong> download a copy of your data in a structured, machine-readable JSON format from Profile → Export My Data.</li>
            <li><strong>Objection / restriction (GDPR Art. 21–22):</strong> object to or restrict processing based on legitimate interest, including the right not to be subject to a decision based solely on automated processing.</li>
            <li><strong>Limit sensitive personal information (CPRA § 1798.121):</strong> because Grace Flare collects health observations and data about children — categories of "sensitive personal information" under California law — California users may request that we limit use of that information to providing the service.</li>
            <li><strong>Withdraw consent:</strong> withdraw consent at any time without affecting the lawfulness of prior processing.</li>
            <li><strong>EU/EEA users</strong> may also lodge a complaint with their local data protection authority.</li>
          </ul>
          <p className="mt-2"><strong>How to exercise a right:</strong> use the <Link to="/rights-request" className="text-primary underline">privacy request form</Link>, or email <a href="mailto:privacy@graceflare.com" className="text-primary underline">privacy@graceflare.com</a>. We will acknowledge within 10 days and respond within 30 days (extendable once by up to 60 days for complex requests, with notice). We verify your identity by confirming control of the email on file plus one additional account-specific data point; we will not ask for more information than is necessary to verify.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">8. Data retention</h2>
          <p>We retain your data while your account is active. When you delete your account or a child's record, primary database records are removed within <strong>7 days</strong>. Files in object storage are deleted within <strong>30 days</strong>. Encrypted database backups containing the data are overwritten on our standard 30-day backup-rotation cycle and are accessed during that window only for disaster-recovery purposes. AI-provider logs at Anthropic are deleted on the schedule described in § 4 (no more than 30 days). Aggregated, de-identified statistics that contain no personal information may be retained indefinitely.</p>
          <p className="mt-2"><strong>Inactive accounts:</strong> if you do not sign in for 24 consecutive months, we will email you a 30-day deletion warning. If you do not sign in within that window, your account and all child records will be deleted on the same schedule above.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">9. Security</h2>
          <p>We use Postgres row-level security policies that ensure each user can only access their own data. Data is encrypted in transit (TLS 1.2+) and at rest (AES-256).</p>
          <p className="mt-2"><strong>Breach notification.</strong> If we discover a security breach affecting your or your child's personal information, we will: (a) notify the relevant supervisory authority within 72 hours where required (GDPR Art. 33); (b) notify affected users without undue delay and in any event within 60 days, as required by the FTC Health Breach Notification Rule (16 CFR Part 318); and (c) comply with any shorter notification window required by applicable U.S. state law. Notice will describe the nature of the breach, the categories of data affected, the likely consequences, and the steps we are taking in response.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">10. Changes to this policy</h2>
          <p>We will give at least <strong>30 days' advance notice</strong> of material changes by email and via in-app notice before they take effect. For non-material changes (typo fixes, formatting, contact-info updates), we update the "Last updated" date and the change takes effect immediately. Material changes that affect children's data require renewed verifiable parental consent.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">11. Contact</h2>
          <p><strong>General privacy questions:</strong> <a href="mailto:privacy@graceflare.com" className="text-primary underline">privacy@graceflare.com</a></p>
          <p><strong>Children's privacy / COPPA requests:</strong> <a href="mailto:coppa@graceflare.com" className="text-primary underline">coppa@graceflare.com</a></p>
          <p><strong>General support:</strong> <a href="mailto:support@graceflare.com" className="text-primary underline">support@graceflare.com</a></p>
          <p className="mt-2 text-xs text-muted-foreground">Grace Flare is not currently offered to users in the European Economic Area or the United Kingdom; an EU/UK representative under GDPR Art. 27 is therefore not appointed at this time. If you believe you have signed up from those regions, please contact us so we can address your account.</p>
        </section>

      </div>
    </div>
  );
}
