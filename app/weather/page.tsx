"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
}

export default function Weather() {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("weather conditions");

  useEffect(() => { load(); }, []);

  async function load() {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const { data } = await supabase.from("slots")
      .select("id, start_time, capacity_total, booked, held, status, tours(name)")
      .gt("start_time", now.toISOString())
      .lt("start_time", in48h.toISOString())
      .gt("booked", 0)
      .eq("status", "OPEN")
      .order("start_time", { ascending: true });
    setSlots(data || []);
    setLoading(false);
  }

  async function cancelSlot(slotId: string) {
    if (!confirm("This will cancel ALL bookings on this slot, send WhatsApp + email notifications to all customers, and queue full refunds. Continue?")) return;
    setCancelling(slotId);

    try {
      const res = await supabase.functions.invoke("weather-cancel", {
        body: { slot_id: slotId, reason },
      });

      if (res.error) {
        alert("Error: " + (res.error.message || "Unknown error"));
      } else {
        const data = res.data as any;
        alert("Done! " + (data?.notified || 0) + " customers notified.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }

    setCancelling(null);
    load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Weather Cancellations</h2>
      <p className="text-gray-500 text-sm">Cancel trips due to bad weather. All customers will be notified via WhatsApp and email, and full refunds will be queued.</p>
      <div className="flex gap-2 items-center">
        <label className="text-sm text-gray-600">Reason:</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : slots.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">No upcoming slots with bookings in next 48 hours.</div>
      ) : (
        <div className="space-y-3">
          {slots.map((s: any) => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="font-semibold">{s.tours?.name}</p>
                <p className="text-sm text-gray-500">{fmtTime(s.start_time)}</p>
                <p className="text-sm text-gray-500">{s.booked} booked · {s.capacity_total} capacity</p>
              </div>
              <button onClick={() => cancelSlot(s.id)} disabled={cancelling === s.id}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
                {cancelling === s.id ? "Cancelling..." : "⛈ Cancel & Notify All"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
