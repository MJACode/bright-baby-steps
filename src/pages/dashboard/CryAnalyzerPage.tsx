// Standalone route for the cry analyzer, gated by premium.
//
// Uses the existing "cry-analysis" feature key — its FEATURE_HOOK copy in
// UpgradeSheet already has the right pitch ("hunger vs tired vs discomfort").

import { CryAnalyzer } from "@/components/CryAnalyzer";
import { PremiumGate } from "@/components/PremiumGate";

export default function CryAnalyzerPage() {
  return (
    <div className="px-4 py-4 pb-24">
      <PremiumGate feature="cry-analysis" variant="replace">
        <CryAnalyzer />
      </PremiumGate>
    </div>
  );
}
