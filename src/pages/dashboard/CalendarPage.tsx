import { useState } from "react";
import { useChildren } from "@/hooks/useChildren";
import { useDayEvents, type DayEvent } from "@/hooks/useDayEvents";
import { DayNavigator } from "@/components/calendar/DayNavigator";
import { DayTimeline } from "@/components/calendar/DayTimeline";
import { EventDetailsPopover } from "@/components/calendar/EventDetailsPopover";
import { CalendarDays } from "lucide-react";

export default function CalendarPage() {
  const { activeChild } = useChildren();
  const [date, setDate] = useState<Date>(new Date());
  const [selected, setSelected] = useState<DayEvent | null>(null);
  const { events, isLoading } = useDayEvents(activeChild?.id, date);

  if (!activeChild) {
    return (
      <div className="space-y-3 text-center py-12">
        <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Add a child to see their day.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-primary" /> Day view
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{activeChild.name}'s schedule</p>
        </div>
      </div>

      <DayNavigator date={date} onChange={setDate} />

      {!isLoading && events.length === 0 && (
        <div className="text-center py-6 px-4 bg-muted/30 rounded-lg">
          <p className="text-sm text-muted-foreground">Nothing logged for this day.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tap the log button to add your first entry.
          </p>
        </div>
      )}

      <DayTimeline date={date} events={events} onSelect={setSelected} />

      <EventDetailsPopover event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
