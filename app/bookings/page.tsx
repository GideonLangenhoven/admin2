"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";

/* ── helpers ── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "short",
    timeZone: "Africa/Johannesburg",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Africa/Johannesburg",
  });
}

function fmtCurrency(n: number) {
  return "R" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    timeZone: "Africa/Johannesburg",
  });
}

function isPaid(status: string) {
  return ["PAID", "CONFIRMED", "COMPLETED"].includes(status);
}

/* ── types ── */
interface Booking {
  id: string;
  customer_name: string;
  phone: string;
  email: string;
  qty: number;
  total_amount: number;
  status: string;
  refund_status: string | null;
  tours: { name: string } | null;
  slots: { start_time: string } | null;
}

interface SlotGroup {
  timeLabel: string;
  sortKey: string;
  bookings: Booking[];
  totalPax: number;
  totalPrice: number;
  totalPaid: number;
  totalDue: number;
}

interface DayGroup {
  dateLabel: string;
  sortKey: string;
  slots: SlotGroup[];
  totalPax: number;
  totalPrice: number;
  totalPaid: number;
  totalDue: number;
}

/* ── main component ── */
export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 59, 999); return d;
  });
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [expandAllDays, setExpandAllDays] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, [rangeStart, rangeEnd]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("bookings")
      .select("id, customer_name, phone, email, qty, total_amount, status, refund_status, tours(name), slots(start_time)")
      .gte("slots.start_time", rangeStart.toISOString())
      .lte("slots.start_time", rangeEnd.toISOString())
      .in("status", ["PAID", "CONFIRMED", "HELD", "PENDING", "COMPLETED"])
      .order("created_at", { ascending: true })
      .limit(500);

    // Supabase returns joined relations as arrays; normalise to single objects
    const normalized = (data || [])
      .map((b: any) => ({
        ...b,
        tours: Array.isArray(b.tours) ? b.tours[0] || null : b.tours,
        slots: Array.isArray(b.slots) ? b.slots[0] || null : b.slots,
      }))
      .filter((b: any) => b.slots?.start_time);
    setBookings(normalized as Booking[]);
    setLoading(false);
  }

  /* ── grouping ── */
  const dayGroups: DayGroup[] = useMemo(() => {
    const dayMap = new Map<string, Map<string, Booking[]>>();

    for (const b of bookings) {
      if (!b.slots?.start_time) continue;
      const dk = dateKey(b.slots.start_time);
      const tk = fmtTime(b.slots.start_time);
      if (!dayMap.has(dk)) dayMap.set(dk, new Map());
      const slotMap = dayMap.get(dk)!;
      if (!slotMap.has(tk)) slotMap.set(tk, []);
      slotMap.get(tk)!.push(b);
    }

    const days: DayGroup[] = [];
    for (const [dk, slotMap] of dayMap) {
      const slots: SlotGroup[] = [];
      for (const [tk, bks] of slotMap) {
        const totalPax = bks.reduce((s, b) => s + b.qty, 0);
        const totalPrice = bks.reduce((s, b) => s + Number(b.total_amount), 0);
        const totalPaid = bks.filter(b => isPaid(b.status)).reduce((s, b) => s + Number(b.total_amount), 0);
        slots.push({
          timeLabel: tk,
          sortKey: tk,
          bookings: bks,
          totalPax, totalPrice,
          totalPaid, totalDue: totalPrice - totalPaid,
        });
      }
      slots.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      const totalPax = slots.reduce((s, sl) => s + sl.totalPax, 0);
      const totalPrice = slots.reduce((s, sl) => s + sl.totalPrice, 0);
      const totalPaid = slots.reduce((s, sl) => s + sl.totalPaid, 0);
      days.push({
        dateLabel: fmtDate(bookings.find(b => b.slots && dateKey(b.slots.start_time) === dk)!.slots!.start_time),
        sortKey: dk,
        slots,
        totalPax, totalPrice,
        totalPaid, totalDue: totalPrice - totalPaid,
      });
    }
    days.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return days;
  }, [bookings]);

  /* ── expand/collapse helpers ── */
  function toggleSlot(key: string) {
    setExpandedSlots(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleExpandAll(dayKey: string, slotKeys: string[]) {
    setExpandAllDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
        setExpandedSlots(prev2 => {
          const n = new Set(prev2);
          slotKeys.forEach(k => n.delete(k));
          return n;
        });
      } else {
        next.add(dayKey);
        setExpandedSlots(prev2 => {
          const n = new Set(prev2);
          slotKeys.forEach(k => n.add(k));
          return n;
        });
      }
      return next;
    });
  }

  /* ── date navigation ── */
  function shiftRange(days: number) {
    setRangeStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + days); return d; });
    setRangeEnd(prev => { const d = new Date(prev); d.setDate(d.getDate() + days); return d; });
  }



  /* ── render ── */
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">📋 Bookings</h2>

      {/* Date range nav */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => shiftRange(-7)}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          ← Prev Week
        </button>
        <span className="text-sm font-medium text-gray-700">
          {rangeStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} — {rangeEnd.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <button onClick={() => shiftRange(7)}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Next Week →
        </button>
        <button onClick={() => {
          const d = new Date(); d.setHours(0, 0, 0, 0);
          setRangeStart(d);
          const e = new Date(); e.setDate(e.getDate() + 7); e.setHours(23, 59, 59, 999);
          setRangeEnd(e);
        }}
          className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors">
          Today
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          No bookings in this date range.
        </div>
      ) : (
        <div className="space-y-6">
          {dayGroups.map((day) => {
            const slotKeys = day.slots.map((_, i) => `${day.sortKey}-${i}`);
            const allExpanded = expandAllDays.has(day.sortKey);

            return (
              <div key={day.sortKey}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-semibold text-gray-800">{day.dateLabel}</h3>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allExpanded}
                      onChange={() => toggleExpandAll(day.sortKey, slotKeys)}
                      className="rounded border-gray-300"
                    />
                    Expand All
                  </label>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left p-3 font-semibold text-gray-600 w-36">Time</th>
                        <th className="text-left p-3 font-semibold text-gray-600 w-16">Pax</th>
                        <th className="text-left p-3 font-semibold text-gray-600 hidden md:table-cell">Service</th>
                        <th className="text-right p-3 font-semibold text-gray-600">Price</th>
                        <th className="text-right p-3 font-semibold text-gray-600">Paid</th>
                        <th className="text-right p-3 font-semibold text-gray-600">Due</th>
                        <th className="text-left p-3 font-semibold text-gray-600 hidden lg:table-cell">Reference</th>
                        <th className="text-left p-3 font-semibold text-gray-600 hidden lg:table-cell">Refund</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.slots.map((slot, si) => {
                        const slotKey = `${day.sortKey}-${si}`;
                        const isOpen = expandedSlots.has(slotKey);

                        return (
                          <SlotRow
                            key={slotKey}
                            slot={slot}
                            isOpen={isOpen}
                            onToggle={() => toggleSlot(slotKey)}
                          />
                        );
                      })}

                      {/* Day totals */}
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-700">
                        <td className="p-3 text-xs text-gray-500">Totals:</td>
                        <td className="p-3">{day.totalPax}</td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right">{fmtCurrency(day.totalPrice)}</td>
                        <td className="p-3 text-right">{fmtCurrency(day.totalPaid)}</td>
                        <td className={`p-3 text-right ${day.totalDue > 0 ? "text-red-600" : "text-gray-700"}`}>
                          {fmtCurrency(day.totalDue)}
                        </td>
                        <td className="p-3 hidden lg:table-cell"></td>
                        <td className="p-3 hidden lg:table-cell"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Slot Row (collapsible) ── */
function SlotRow({ slot, isOpen, onToggle }: { slot: SlotGroup; isOpen: boolean; onToggle: () => void }) {
  // Gather distinct service names for the summary row
  const services = [...new Set(slot.bookings.map(b => b.tours?.name).filter(Boolean))].join(", ");

  return (
    <>
      {/* Summary row (collapsed) */}
      <tr
        className="border-t border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="p-3 font-medium text-blue-700">
          <span className="inline-block w-4 text-gray-400 mr-1 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "none" }}>›</span>
          {slot.timeLabel}
        </td>
        <td className="p-3 font-semibold">{slot.totalPax}</td>
        <td className="p-3 text-gray-500 hidden md:table-cell">{services}</td>
        <td className="p-3 text-right">{fmtCurrency(slot.totalPrice)}</td>
        <td className="p-3 text-right">{fmtCurrency(slot.totalPaid)}</td>
        <td className={`p-3 text-right font-semibold ${slot.totalDue > 0 ? "text-red-600" : "text-green-600"}`}>
          {fmtCurrency(slot.totalDue)}
        </td>
        <td className="p-3 hidden lg:table-cell"></td>
        <td className="p-3 hidden lg:table-cell"></td>
      </tr>

      {/* Expanded booking rows */}
      {isOpen && slot.bookings.map((b) => {
        const paid = isPaid(b.status) ? Number(b.total_amount) : 0;
        const due = Number(b.total_amount) - paid;

        return (
          <tr key={b.id} className="bg-gray-50/60 border-t border-gray-100 text-gray-600 text-xs">
            <td className="p-3 pl-10 text-gray-400">
              {b.customer_name}
            </td>
            <td className="p-3">{b.qty}</td>
            <td className="p-3 hidden md:table-cell">{b.tours?.name || "—"}</td>
            <td className="p-3 text-right">{fmtCurrency(Number(b.total_amount))}</td>
            <td className="p-3 text-right">{fmtCurrency(paid)}</td>
            <td className={`p-3 text-right font-medium ${due > 0 ? "text-red-600" : "text-green-600"}`}>
              {fmtCurrency(due)}
            </td>
            <td className="p-3 font-mono hidden lg:table-cell">{b.id.substring(0, 8).toUpperCase()}</td>
            <td className="p-3 hidden lg:table-cell">
              <RefundBadge status={b.refund_status} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

/* ── Refund Badge ── */
function RefundBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-300">—</span>;
  const colors: Record<string, string> = {
    REQUESTED: "bg-amber-100 text-amber-700",
    PROCESSED: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-red-100 text-red-700",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>{status}</span>;
}
