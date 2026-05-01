import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Terms of Service</h1>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Last updated: April 2026</p>
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Draft — pending legal review</Badge>
        </div>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">

        <section>
          <h2 className="font-semibold text-foreground mb-2">1. Acceptance</h2>
          <p>By creating an account, you agree to these Terms. If you do not agree, do not use Grace Flare.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">2. Eligibility</h2>
          <p>You must be at least 18 years old and the parent or legal guardian of any child whose data you add to the app.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">3. Not medical advice</h2>
          <p>Grace Flare is an informational tool only. <strong>Nothing in this app — including AI-generated chat responses, briefings, insights, or any other content — constitutes medical advice, diagnosis, or treatment.</strong> Always seek the guidance of your child's physician or other qualified healthcare provider with any questions you have regarding a medical condition. In a medical emergency, call 911 or go to your nearest emergency room.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">4. Not financial advice</h2>
          <p>Financial information provided by Grace Flare is for general informational purposes only and does not constitute personalised financial, tax, or legal advice. Consult a licensed financial advisor before making financial decisions.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">5. Your account</h2>
          <p>You are responsible for maintaining the security of your account and password. You are responsible for all activity that occurs under your account.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">6. Your content</h2>
          <p>You own the data you enter. By using Grace Flare you grant us a limited licence to process that data to provide the service, as described in our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">7. Acceptable use</h2>
          <p>You agree not to: use the app for any unlawful purpose; attempt to gain unauthorised access to any part of the service; reverse-engineer the app; or use the app on behalf of a child for whom you are not the parent or legal guardian.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">8. Disclaimer of warranties</h2>
          <p>Grace Flare is provided "as is" without warranties of any kind. We do not warrant that the service will be uninterrupted or error-free, or that AI-generated content will be accurate or complete.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">9. Limitation of liability</h2>
          <p>To the fullest extent permitted by law, Grace Flare and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">10. Changes</h2>
          <p>We may update these Terms. We will provide reasonable notice of material changes. Continued use after notice constitutes acceptance.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">11. Contact</h2>
          <p>support@graceflare.com</p>
        </section>

      </div>
    </div>
  );
}
