import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FormProps {
  childId: string;
  parentId: string;
  childName: string;
  childDob: string;
  onSaved?: () => void;
}

export function BirthCertificateForm({ childId, parentId, childName, childDob, onSaved }: FormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    legal_name: childName,
    date_of_birth: childDob,
    place_of_birth_city: "",
    place_of_birth_state: "",
    place_of_birth_country: "United States",
    certificate_number: "",
  });

  const { data: row, isLoading } = useQuery({
    queryKey: ["birth-certificate", childId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birth_certificates").select("*").eq("child_id", childId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (row) {
      setForm({
        legal_name: row.legal_name ?? childName,
        date_of_birth: row.date_of_birth ?? childDob,
        place_of_birth_city: row.place_of_birth_city ?? "",
        place_of_birth_state: row.place_of_birth_state ?? "",
        place_of_birth_country: row.place_of_birth_country ?? "United States",
        certificate_number: row.certificate_number ?? "",
      });
    }
  }, [row, childName, childDob]);

  const upsert = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("birth_certificates").upsert({
        child_id: childId,
        parent_id: parentId,
        legal_name: form.legal_name.trim() || null,
        date_of_birth: form.date_of_birth || null,
        place_of_birth_city: form.place_of_birth_city.trim() || null,
        place_of_birth_state: form.place_of_birth_state.trim() || null,
        place_of_birth_country: form.place_of_birth_country.trim() || null,
        certificate_number: form.certificate_number.trim() || null,
      }, { onConflict: "child_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["birth-certificate", childId] });
      queryClient.invalidateQueries({ queryKey: ["child-checklist-items", childId] });
      toast({ title: "Saved" });
      onSaved?.();
    },
  });

  const isMassachusetts = form.place_of_birth_state.trim().toLowerCase() === "ma" ||
    form.place_of_birth_state.trim().toLowerCase() === "massachusetts";

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading birth certificate...</p>;

  return (
    <div className="space-y-4">
      <Card className="border-0 bg-muted/40">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Legal name (as on certificate)</Label>
            <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Date of birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">City of birth</Label>
              <Input value={form.place_of_birth_city} onChange={(e) => setForm({ ...form, place_of_birth_city: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">State / region</Label>
              <Input value={form.place_of_birth_state} onChange={(e) => setForm({ ...form, place_of_birth_state: e.target.value })} placeholder="e.g. MA" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Country</Label>
            <Input value={form.place_of_birth_country} onChange={(e) => setForm({ ...form, place_of_birth_country: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Certificate number</Label>
            <Input value={form.certificate_number} onChange={(e) => setForm({ ...form, certificate_number: e.target.value })} />
          </div>

          <Button className="w-full h-12 touch-target" disabled={upsert.isPending} onClick={() => upsert.mutate()}>
            {upsert.isPending ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription className="text-sm">
          For a certified copy, contact the vital records office in the state of birth.
          {isMassachusetts && (
            <>
              <br />
              <a
                href="https://www.mass.gov/orgs/registry-of-vital-records-and-statistics"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline mt-2 font-medium"
              >
                Massachusetts Registry of Vital Records <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
