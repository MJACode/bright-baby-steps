import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Terms of Service</h1>
        <p className="text-xs text-muted-foreground">
          Effective: May 8, 2026 · Last reviewed: May 8, 2026
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">

        <section>
          <h2 className="font-semibold text-foreground mb-2">1. Acceptance</h2>
          <p>These Terms of Service ("Terms") are a binding agreement between you and <strong>Grace Flare LLC</strong>, a Delaware limited liability company ("Grace Flare", "we", "us"). By checking the "I agree" box and clicking "Create account," you affirmatively accept these Terms and our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>. The version of these Terms in effect on the date you sign up applies to you until we notify you of changes under § 10. If you do not agree, do not create an account.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">2. Eligibility</h2>
          <p>You must be at least 18 years old and the parent or legal guardian of any child whose data you add to the app. <strong>Children under 18 may not register for or use Grace Flare on their own behalf.</strong></p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">3. Not medical advice</h2>
          <p>Grace Flare is an informational tool only. <strong>Nothing in this app — including AI-generated chat responses, briefings, insights, the Pediatrician Export PDF, or any other content — constitutes medical advice, diagnosis, or treatment.</strong> Grace Flare is not a medical device and has not been reviewed or approved by the FDA or any equivalent regulator. The Pediatrician Export PDF is a convenience summary of what you have logged; it is not a medical record. Always seek the guidance of your child's physician or other qualified healthcare provider with any questions you have regarding a medical condition. In a medical emergency, call 911 or go to your nearest emergency room.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">4. Not financial advice</h2>
          <p>Financial information provided by Grace Flare is for general informational purposes only and does not constitute personalised financial, tax, or legal advice, including any tax advice within the meaning of IRS Circular 230, nor a recommendation that any particular 529 plan, FSA, HSA, insurance product, or financial product is suitable for your circumstances. Consult a licensed financial advisor before making financial decisions.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">5. Your account</h2>
          <p>You are responsible for maintaining the security of your account and password and for all activity that occurs under your account. Notify us at <a href="mailto:security@graceflare.com" className="text-primary underline">security@graceflare.com</a> if you suspect unauthorised access to your account.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">6. Your content and licence</h2>
          <p>You retain all rights in the data you enter. You grant Grace Flare a worldwide, royalty-free, non-exclusive, non-transferable, sublicensable (only to our subprocessors) licence to host, store, process, transmit, and display that data <strong>solely to operate and improve the service for you and any partners you invite, and as described in our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link></strong>. Subject to your compliance with these Terms, we grant you a limited, personal, non-exclusive, non-transferable, non-sublicensable, revocable licence to access and use Grace Flare for your own household's non-commercial use. You may not copy, modify, distribute, sell, lease, reverse-engineer, or create derivative works of the service or any part of it. The licences in this section terminate when you delete the data or your account, subject to the short-term retention in encrypted backups described in § 8 of the Privacy Policy.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">7. Acceptable use</h2>
          <p>You agree not to: use the app for any unlawful purpose; attempt to gain unauthorised access to any part of the service; reverse-engineer the app; scrape, crawl, or use bots against the service; use Grace Flare's outputs to train competing AI models; input personal information about people other than your child or other invited adults without their permission; or use the app on behalf of a child for whom you are not the parent or legal guardian.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">8. Disclaimer of warranties</h2>
          <p className="font-semibold uppercase">To the fullest extent permitted by law, the service is provided "as is" and "as available," without warranties of any kind, express or implied, including without limitation implied warranties of merchantability, fitness for a particular purpose, and non-infringement. Grace Flare is not a medical device, does not provide medical advice, and is not a substitute for professional care. We do not warrant that the service will be uninterrupted or error-free, or that AI-generated content will be accurate or complete.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">9. Limitation of liability</h2>
          <p className="font-semibold uppercase">To the fullest extent permitted by law, Grace Flare and its operators, members, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or exemplary damages arising from your use of the service. Our total aggregate liability arising out of or relating to the service shall not exceed the greater of (a) the fees you paid Grace Flare in the 12 months preceding the event giving rise to the claim, or (b) one hundred U.S. dollars (US$100).</p>
          <p className="mt-2">Nothing in these Terms limits or excludes liability for: (i) fraud or fraudulent misrepresentation; (ii) death or personal injury caused by negligence; (iii) gross negligence or willful misconduct; or (iv) any liability that cannot be limited or excluded under applicable law (including under California Civil Code § 1668 and applicable consumer-protection statutes).</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">10. Changes</h2>
          <p>We may update these Terms from time to time. For non-material changes (clarifications, contact-info updates, formatting), we will post the updated Terms with a new effective date and your continued use will constitute acceptance. For material changes (including changes to liability, dispute resolution, data use, or fees), we will give at least <strong>30 days' advance notice</strong> by email and require renewed affirmative acceptance before the changes apply to you.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">11. Dispute resolution; arbitration; class-action waiver</h2>
          <p><strong>Please read this section carefully — it affects your legal rights.</strong></p>
          <p className="mt-2"><strong>Informal resolution.</strong> Before filing a claim, you agree to try to resolve the dispute by emailing <a href="mailto:legal@graceflare.com" className="text-primary underline">legal@graceflare.com</a> and giving us 30 days to respond.</p>
          <p className="mt-2"><strong>Binding arbitration.</strong> Any dispute, claim, or controversy arising out of or relating to these Terms or the service that cannot be resolved informally shall be settled by binding individual arbitration administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules. The arbitration will be conducted in the English language, and judgment on the award may be entered in any court of competent jurisdiction. The Federal Arbitration Act governs the interpretation and enforcement of this section.</p>
          <p className="mt-2"><strong>Class-action waiver.</strong> You and Grace Flare each agree that disputes will be resolved <strong>only on an individual basis</strong>, and not as a plaintiff or class member in any purported class, consolidated, or representative proceeding. The arbitrator may not consolidate the claims of more than one person and may not preside over any form of class proceeding.</p>
          <p className="mt-2"><strong>30-day opt-out.</strong> You may opt out of this arbitration agreement and class-action waiver by sending written notice to <a href="mailto:legal@graceflare.com" className="text-primary underline">legal@graceflare.com</a> within 30 days of first accepting these Terms, including your name, account email, and a clear statement that you wish to opt out. Opting out will not affect any other provision of these Terms.</p>
          <p className="mt-2"><strong>Exceptions.</strong> Either party may bring an individual action in small-claims court, and either party may seek injunctive relief in court for infringement of intellectual-property rights.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">12. Governing law and venue</h2>
          <p>These Terms are governed by the laws of the State of <strong>Delaware</strong>, without regard to its conflict-of-laws rules. Subject to § 11 (arbitration), the exclusive venue for any dispute that is not subject to arbitration is the state and federal courts located in <strong>New Castle County, Delaware</strong>, and you consent to personal jurisdiction in those courts.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">13. Miscellaneous</h2>
          <p>If any provision of these Terms is found unenforceable, the remainder remains in effect. These Terms, together with the <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>, constitute the entire agreement between you and Grace Flare and supersede any prior agreements on the same subject. You may not assign these Terms; we may assign them to a successor in interest (including a corporate-restructuring or change-of-control transaction). Our failure to enforce any provision is not a waiver. Section headings are for convenience only.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">14. Contact</h2>
          <p><strong>Grace Flare LLC</strong><br />c/o Northwest Registered Agent<br />8 The Green, Suite A<br />Dover, DE 19901<br />Legal: <a href="mailto:legal@graceflare.com" className="text-primary underline">legal@graceflare.com</a><br />Support: <a href="mailto:support@graceflare.com" className="text-primary underline">support@graceflare.com</a></p>
        </section>

      </div>
    </div>
  );
}
