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
          <p className="text-xs text-muted-foreground">Last updated: April 2026</p>
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Draft — pending legal review</Badge>
        </div>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">

        <section>
          <h2 className="font-semibold text-foreground mb-2">1. Who we are</h2>
          <p>Baby Steps is operated by Grace Flare (graceflare.com). If you have questions about this policy, contact us at support@graceflare.com.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">2. What data we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data:</strong> your name and email address, collected when you create an account.</li>
            <li><strong>Child profile data:</strong> your child's name, date of birth, gender (optional), prematurity status, and photo (optional).</li>
            <li><strong>Tracking data:</strong> sleep, feeding, diaper, allergen introduction, milestone, illness, medication, and supplement records that you choose to log.</li>
            <li><strong>Chat data:</strong> your messages to the AI assistant and the responses generated.</li>
            <li><strong>Technical data:</strong> app usage data and, if you submit feedback, any screenshot you attach.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">3. How we use your data</h2>
          <p>We use your data to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Provide the Baby Steps tracking and AI features.</li>
            <li>Generate daily briefings, weekly insights, and chat responses using your child's logged activity.</li>
            <li>Send you optional reminders and notifications.</li>
            <li>Improve the app.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">4. AI processing</h2>
          <p>Baby Steps uses an AI service provider to power chat responses, daily briefings, and weekly insights. Your child's activity data (including name, age, sleep, feeding, and health notes) is transmitted to this provider for processing. We have a data processing agreement in place with our AI provider. Your data is not used to train AI models.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">5. Sharing your data</h2>
          <p>We do not sell your data. We share data only with:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Our AI service provider (as described above).</li>
            <li>Co-parents or caregivers you explicitly invite via the Partner Access feature.</li>
            <li>Service providers who help us operate Baby Steps (e.g. our database host), under data processing agreements.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">6. Children's data (COPPA)</h2>
          <p>Baby Steps is intended for use by parents and legal guardians to track their own children's development. By creating an account and adding a child profile, you confirm that you are the parent or legal guardian of the child and that you consent to the collection and use of your child's data as described in this policy.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">7. Your rights</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access:</strong> you can view all your data within the app at any time.</li>
            <li><strong>Export:</strong> you can download a copy of all your data from Profile → Export My Data.</li>
            <li><strong>Deletion:</strong> you can delete your account and all associated data from Profile → Delete Account.</li>
            <li><strong>Correction:</strong> you can edit your child's profile and any logged data at any time.</li>
            <li>If you are in the EU/EEA, you may also lodge a complaint with your local data protection authority.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">8. Data retention</h2>
          <p>We retain your data for as long as your account is active. When you delete your account, all data is permanently deleted within 30 days.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">9. Security</h2>
          <p>We use row-level security policies that ensure each user can only access their own data. Data is encrypted in transit (TLS) and at rest.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">10. Changes to this policy</h2>
          <p>We will notify you by email and in-app notice before making material changes to this policy.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">11. Contact</h2>
          <p>support@graceflare.com</p>
        </section>

      </div>
    </div>
  );
}
