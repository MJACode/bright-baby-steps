import { useState } from "react";
import { useChildren } from "@/hooks/useChildren";
import { useDayEvents, type DayEvent } from "@/hooks/useDayEvents";
import { useWeekEvents } from "@/hooks/useWeekEvents";
import { usePreferences } from "@/hooks/usePreferences";
import { DayNavigator } from "@/components/calendar/DayNavigator";
import { DayTimeline } from "@/components/calendar/DayTimeline";
import { WeekNavigator } from "@/components/calendar/WeekNavigator";
import { WeekTimeline } from "@/components/calendar/WeekTimeline";
import { EventDetailsPopover } from "@/components/calendar/EventDetailsPopover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarDays } from "lucide-react";

export default function CalendarPage() {
  const { activeChild } = useChildren();
  const { prefs, setPrefs } = usePreferences();
  const view = prefs.calendarView;
  const [date, setDate] = useState<Date>(new Date());
  const [selected, setSelected] = useState<DayEvent | null>(null);

  const { events: dayEvents, isLoading: dayLoading } = useDayEvents(
    activeChild?.id,
    date
  );
  const { events: weekEvents } = useWeekEvents(activeChild?.id, date);

  if (!activeChild) {
    return (
      <div className="space-y-3 text-center py-12">
        <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Add a child to see their day.</p>
      </div>
    );
  }

  const handleSelectDay = (d: Date) => {
    setDate(d);
    setPrefs({ calendarView: "day" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-primary" />
            {view === "week" ? "Week view" : "Day view"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {activeChild.name}'s schedule
          </p>
        </div>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setPrefs({ calendarView: v as "day" | "week" })}
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label="Calendar view"
        >
          <ToggleGroupItem value="day" aria-label="Day view">
            Day
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Week view">
            Week
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "day" ? (
        <>
          <DayNavigator date={date} onChange={setDate} />

          {!dayLoading && dayEvents.length === 0 && (
            <div className="text-center py-6 px-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Nothing logged for this day.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tap the log button to add your first entry.
              </p>
            </div>
          )}

          <DayTimeline date={date} events={dayEvents} onSelect={setSelected} />
        </>
      ) : (
        <>
          <WeekNavigator date={date} onChange={setDate} />
          <WeekTimeline
            anchorDate={date}
            events={weekEvents}
            onSelectDay={handleSelectDay}
          />
        </>
      )}

      <EventDetailsPopover event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
