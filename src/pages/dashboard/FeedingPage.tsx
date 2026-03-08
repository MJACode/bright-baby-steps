import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UtensilsCrossed, ShieldAlert } from "lucide-react";
import FeedingLog from "@/components/feeding/FeedingLog";
import AllergenTracker from "@/components/feeding/AllergenTracker";

export default function FeedingPage() {
  const [tab, setTab] = useState("feeding");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-12">
          <TabsTrigger value="feeding" className="touch-target gap-1.5 text-sm font-semibold">
            <UtensilsCrossed className="w-4 h-4" /> Feeding
          </TabsTrigger>
          <TabsTrigger value="allergens" className="touch-target gap-1.5 text-sm font-semibold">
            <ShieldAlert className="w-4 h-4" /> Allergens
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feeding" className="mt-4">
          <FeedingLog />
        </TabsContent>
        <TabsContent value="allergens" className="mt-4">
          <AllergenTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}
