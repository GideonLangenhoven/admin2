"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import CalendarHeader from "../../components/CalendarHeader";
import WeekView from "../../components/WeekView";
import DayView from "../../components/DayView";

export default function Slots() {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("week");

  useEffect(() => { load(); }, [currentDate, viewMode]);

  async function load() {
    setLoading(true);

    // Calculate time range based on view mode
    let start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    let end = new Date(currentDate);
    end.setHours(23, 59, 59, 999);

    if (viewMode === "week") {
      const day = start.getDay();
      // Adjust to Monday start (0=Sun, 1=Mon...6=Sat)
      // If Sun(0), Monday is -6 days away. If Mon(1), 0 days away. If Tue(2), -1 day away.
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      // End of week is start + 6 days
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    }

    const { data } = await supabase.from("slots")
      .select("id, start_time, capacity_total, booked, held, status, price_per_person_override, tours(name)")
      .gte("start_time", start.toISOString())
      .lte("start_time", end.toISOString())
      .order("start_time", { ascending: true });

    setSlots(data || []);
    setLoading(false);
  }

  async function toggleSlot(id: string, currentStatus: string) {
    const newStatus = currentStatus === "OPEN" ? "CLOSED" : "OPEN";
    await supabase.from("slots").update({ status: newStatus }).eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Slot Management</h2>

      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onDateChange={setCurrentDate}
        onViewModeChange={setViewMode}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        viewMode === "week" ? (
          <WeekView
            slots={slots}
            currentDate={currentDate}
            onToggleSlot={toggleSlot}
          />
        ) : (
          <DayView
            slots={slots}
            currentDate={currentDate}
            onToggleSlot={toggleSlot}
          />
        )
      )}
    </div>
  );
}
