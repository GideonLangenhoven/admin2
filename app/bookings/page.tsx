"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const SU = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  });
}

function fmtCurrency(n: number) {
  return "R" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

function toDateInput(iso: string) {
  return dateKey(iso);
}

function dayRange(dateInput: string) {
  const day = new Date(`${dateInput}T00:00:00`);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  return { startIso: day.toISOString(), endIso: next.toISOString() };
}

function isPaid(status: string) {
  return ["PAID", "CONFIRMED", "COMPLETED"].includes(status);
}

type TourRel = { id?: string; name?: string } | null;
type SlotRel = {
  id?: string;
  start_time?: string;
  tour_id?: string;
  capacity_total?: number;
  booked?: number;
  status?: string;
} | null;

interface Booking {
  id: string;
  slot_id: string | null;
  customer_name: string;
  phone: string;
  email: string;
  qty: number;
  total_amount: number;
  status: string;
  refund_status: string | null;
  yoco_checkout_id: string | null;
  tours: TourRel;
  slots: SlotRel;
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

interface RebookSlot {
  id: string;
  start_time: string;
  capacity_total: number;
  booked: number;
  status: string;
  tours: { name?: string } | null;
}

interface EditForm {
  customer_name: string;
  phone: string;
  email: string;
  qty: string;
  total_amount: string;
  status: string;
}

const STATUS_OPTIONS = ["PENDING", "HELD", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED"];

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBookingId, setActionBookingId] = useState<string | null>(null);
  const [resendingInvoiceId, setResendingInvoiceId] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [expandAllDays, setExpandAllDays] = useState<Set<string>>(new Set());
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    customer_name: "",
    phone: "",
    email: "",
    qty: "1",
    total_amount: "0.00",
    status: "PENDING",
  });
  const [rebookBooking, setRebookBooking] = useState<Booking | null>(null);
  const [rebookDate, setRebookDate] = useState("");
  const [rebookSlots, setRebookSlots] = useState<RebookSlot[]>([]);
  const [rebookSlotId, setRebookSlotId] = useState("");
  const [loadingRebookSlots, setLoadingRebookSlots] = useState(false);

  async function loadBookings() {
    setLoading(true);
    const { data } = await supabase
      .from("bookings")
      .select("id, slot_id, customer_name, phone, email, qty, total_amount, status, refund_status, yoco_checkout_id, tours(id,name), slots(id,start_time,tour_id,capacity_total,booked,status)")
      .gte("slots.start_time", rangeStart.toISOString())
      .lte("slots.start_time", rangeEnd.toISOString())
      .in("status", ["PAID", "CONFIRMED", "HELD", "PENDING", "COMPLETED", "CANCELLED"])
      .order("created_at", { ascending: true })
      .limit(500);

    const normalized = ((data || []) as Array<Booking & { tours: unknown; slots: unknown }>)
      .map((b) => ({
        ...b,
        tours: (Array.isArray(b.tours) ? b.tours[0] || null : b.tours) as TourRel,
        slots: (Array.isArray(b.slots) ? b.slots[0] || null : b.slots) as SlotRel,
      }))
      .filter((b) => Boolean(b.slots?.start_time));
    setBookings(normalized as Booking[]);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      loadBookings();
    }, 0);
    return () => clearTimeout(t);
  }, [rangeStart, rangeEnd]);

  const dayGroups: DayGroup[] = useMemo(() => {
    const dayMap = new Map<string, Map<string, Booking[]>>();
    for (const b of bookings) {
      const startTime = b.slots?.start_time;
      if (!startTime) continue;
      const dk = dateKey(startTime);
      const tk = fmtTime(startTime);
      if (!dayMap.has(dk)) dayMap.set(dk, new Map());
      const slotMap = dayMap.get(dk)!;
      if (!slotMap.has(tk)) slotMap.set(tk, []);
      slotMap.get(tk)!.push(b);
    }

    const days: DayGroup[] = [];
    for (const [dk, slotMap] of dayMap) {
      const slots: SlotGroup[] = [];
      for (const [tk, bks] of slotMap) {
        const totalPax = bks.reduce((s, b) => s + Number(b.qty || 0), 0);
        const totalPrice = bks.reduce((s, b) => s + Number(b.total_amount || 0), 0);
        const totalPaid = bks.filter((b) => isPaid(b.status)).reduce((s, b) => s + Number(b.total_amount || 0), 0);
        slots.push({
          timeLabel: tk,
          sortKey: tk,
          bookings: bks,
          totalPax,
          totalPrice,
          totalPaid,
          totalDue: totalPrice - totalPaid,
        });
      }
      slots.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      const totalPax = slots.reduce((s, sl) => s + sl.totalPax, 0);
      const totalPrice = slots.reduce((s, sl) => s + sl.totalPrice, 0);
      const totalPaid = slots.reduce((s, sl) => s + sl.totalPaid, 0);
      const first = bookings.find((b) => b.slots?.start_time && dateKey(b.slots.start_time) === dk);
      days.push({
        dateLabel: first?.slots?.start_time ? fmtDate(first.slots.start_time) : dk,
        sortKey: dk,
        slots,
        totalPax,
        totalPrice,
        totalPaid,
        totalDue: totalPrice - totalPaid,
      });
    }
    days.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return days;
  }, [bookings]);

  function toggleSlot(key: string) {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExpandAll(dayKey: string, slotKeys: string[]) {
    setExpandAllDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
        setExpandedSlots((prevSlots) => {
          const n = new Set(prevSlots);
          slotKeys.forEach((k) => n.delete(k));
          return n;
        });
      } else {
        next.add(dayKey);
        setExpandedSlots((prevSlots) => {
          const n = new Set(prevSlots);
          slotKeys.forEach((k) => n.add(k));
          return n;
        });
      }
      return next;
    });
  }

  function shiftRange(days: number) {
    setRangeStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      return d;
    });
    setRangeEnd((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      return d;
    });
  }

  async function resendInvoiceForBooking(bookingId: string) {
    setResendingInvoiceId(bookingId);
    try {
      const res = await supabase.functions.invoke("send-invoice", {
        body: { booking_id: bookingId, invoice_type: "PRO_FORMA", resend: true },
      });
      if (res.error) alert("Resend failed: " + res.error.message);
      else alert("Invoice resend queued.");
    } catch (err: unknown) {
      alert("Resend failed: " + (err instanceof Error ? err.message : String(err)));
    }
    setResendingInvoiceId(null);
  }

  function openEditModal(b: Booking) {
    setEditBooking(b);
    setEditForm({
      customer_name: b.customer_name || "",
      phone: b.phone || "",
      email: b.email || "",
      qty: String(b.qty || 1),
      total_amount: String(Number(b.total_amount || 0).toFixed(2)),
      status: b.status || "PENDING",
    });
  }

  async function saveEditBooking() {
    if (!editBooking) return;
    const qty = Math.max(1, Number(editForm.qty) || 1);
    const total = Number(editForm.total_amount) || 0;
    setActionBookingId(editBooking.id);
    const { error } = await supabase
      .from("bookings")
      .update({
        customer_name: editForm.customer_name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        qty,
        total_amount: total,
        status: editForm.status,
      })
      .eq("id", editBooking.id);
    setActionBookingId(null);
    if (error) {
      alert("Update failed: " + error.message);
      return;
    }
    setEditBooking(null);
    loadBookings();
  }

  async function markPaid(b: Booking) {
    setActionBookingId(b.id);
    const { error } = await supabase.from("bookings").update({ status: "PAID" }).eq("id", b.id);
    setActionBookingId(null);
    if (error) alert("Mark paid failed: " + error.message);
    else loadBookings();
  }

  async function cancelBooking(b: Booking) {
    if (!confirm(`Cancel booking ${b.id.substring(0, 8).toUpperCase()}?`)) return;
    setActionBookingId(b.id);
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "CANCELLED",
        cancellation_reason: "Cancelled by admin",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", b.id);
    setActionBookingId(null);
    if (error) alert("Cancel failed: " + error.message);
    else loadBookings();
  }

  async function refundBooking(b: Booking) {
    if (!confirm(`Refund booking ${b.id.substring(0, 8).toUpperCase()}?`)) return;
    setActionBookingId(b.id);
    try {
      if (b.yoco_checkout_id && SU && SK) {
        const r = await fetch(SU + "/functions/v1/process-refund", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + SK,
          },
          body: JSON.stringify({ booking_id: b.id }),
        });
        const d = await r.json();
        if (!r.ok || d?.error) {
          alert("Auto refund failed: " + (d?.error || r.statusText || "Unknown"));
        } else {
          alert("Refund processed.");
        }
      } else {
        const { error } = await supabase
          .from("bookings")
          .update({
            refund_status: "REQUESTED",
            refund_amount: Number(b.total_amount || 0),
            refund_notes: "Requested from bookings page",
          })
          .eq("id", b.id);
        if (error) alert("Refund request failed: " + error.message);
        else alert("Refund queued.");
      }
    } catch (err: unknown) {
      alert("Refund failed: " + (err instanceof Error ? err.message : String(err)));
    }
    setActionBookingId(null);
    loadBookings();
  }

  function openRebookModal(b: Booking) {
    setRebookBooking(b);
    setRebookDate(b.slots?.start_time ? toDateInput(b.slots.start_time) : toDateInput(new Date().toISOString()));
    setRebookSlotId("");
    setRebookSlots([]);
  }

  async function loadRebookSlots(dateInput: string, tourId: string | null) {
    setLoadingRebookSlots(true);
    const { startIso, endIso } = dayRange(dateInput);
    let query = supabase
      .from("slots")
      .select("id, start_time, capacity_total, booked, status, tour_id, tours(name)")
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .eq("status", "OPEN")
      .order("start_time", { ascending: true });
    if (tourId) query = query.eq("tour_id", tourId);
    const { data } = await query;
    setRebookSlots((data || []) as RebookSlot[]);
    setLoadingRebookSlots(false);
  }

  useEffect(() => {
    if (!rebookBooking || !rebookDate) return;
    const t = setTimeout(() => {
      loadRebookSlots(rebookDate, rebookBooking.tours?.id || rebookBooking.slots?.tour_id || null);
    }, 0);
    return () => clearTimeout(t);
  }, [rebookBooking, rebookDate]);

  async function saveRebook() {
    if (!rebookBooking || !rebookSlotId) return;
    setActionBookingId(rebookBooking.id);
    const { error } = await supabase.from("bookings").update({ slot_id: rebookSlotId }).eq("id", rebookBooking.id);
    if (!error) {
      await supabase.functions.invoke("booking-rebook-notify", {
        body: { booking_id: rebookBooking.id, new_slot_id: rebookSlotId },
      });
    }
    setActionBookingId(null);
    if (error) {
      alert("Rebook failed: " + error.message);
      return;
    }
    setRebookBooking(null);
    loadBookings();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">📋 Bookings</h2>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => shiftRange(-7)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
          ← Prev Week
        </button>
        <span className="text-sm font-medium text-gray-700">
          {rangeStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} —{" "}
          {rangeEnd.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <button onClick={() => shiftRange(7)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
          Next Week →
        </button>
        <button
          onClick={() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            setRangeStart(d);
            const e = new Date();
            e.setDate(e.getDate() + 7);
            e.setHours(23, 59, 59, 999);
            setRangeEnd(e);
          }}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
        >
          Today
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">No bookings in this date range.</div>
      ) : (
        <div className="space-y-6">
          {dayGroups.map((day) => {
            const slotKeys = day.slots.map((_, i) => `${day.sortKey}-${i}`);
            const allExpanded = expandAllDays.has(day.sortKey);
            return (
              <div key={day.sortKey}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-gray-800">{day.dateLabel}</h3>
                  <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={allExpanded}
                      onChange={() => toggleExpandAll(day.sortKey, slotKeys)}
                      className="rounded border-gray-300"
                    />
                    Expand All
                  </label>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="w-36 p-3 text-left font-semibold text-gray-600">Time</th>
                        <th className="w-16 p-3 text-left font-semibold text-gray-600">Pax</th>
                        <th className="hidden p-3 text-left font-semibold text-gray-600 md:table-cell">Service</th>
                        <th className="p-3 text-right font-semibold text-gray-600">Price</th>
                        <th className="p-3 text-right font-semibold text-gray-600">Paid</th>
                        <th className="p-3 text-right font-semibold text-gray-600">Due</th>
                        <th className="hidden p-3 text-left font-semibold text-gray-600 lg:table-cell">Status</th>
                        <th className="hidden p-3 text-left font-semibold text-gray-600 lg:table-cell">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.slots.map((slot, si) => {
                        const slotKey = `${day.sortKey}-${si}`;
                        const isOpen = expandedSlots.has(slotKey);
                        const services = [...new Set(slot.bookings.map((b) => b.tours?.name).filter(Boolean))].join(", ");
                        return (
                          <SlotRows
                            key={slotKey}
                            slot={slot}
                            services={services}
                            isOpen={isOpen}
                            onToggle={() => toggleSlot(slotKey)}
                            actionBookingId={actionBookingId}
                            resendingInvoiceId={resendingInvoiceId}
                            onEdit={openEditModal}
                            onRebook={openRebookModal}
                            onMarkPaid={markPaid}
                            onRefund={refundBooking}
                            onCancel={cancelBooking}
                            onResendInvoice={resendInvoiceForBooking}
                          />
                        );
                      })}

                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-700">
                        <td className="p-3 text-xs text-gray-500">Totals:</td>
                        <td className="p-3">{day.totalPax}</td>
                        <td className="hidden p-3 md:table-cell"></td>
                        <td className="p-3 text-right">{fmtCurrency(day.totalPrice)}</td>
                        <td className="p-3 text-right">{fmtCurrency(day.totalPaid)}</td>
                        <td className={`p-3 text-right ${day.totalDue > 0 ? "text-red-600" : "text-gray-700"}`}>{fmtCurrency(day.totalDue)}</td>
                        <td className="hidden p-3 lg:table-cell"></td>
                        <td className="hidden p-3 lg:table-cell"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-4 text-lg font-semibold">Edit Booking</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm text-gray-600 md:col-span-2">
                Name
                <input
                  value={editForm.customer_name}
                  onChange={(e) => setEditForm((p) => ({ ...p, customer_name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-600">
                Mobile
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-600">
                Email
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-600">
                Qty
                <input
                  type="number"
                  min={1}
                  value={editForm.qty}
                  onChange={(e) => setEditForm((p) => ({ ...p, qty: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-600">
                Total (ZAR)
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editForm.total_amount}
                  onChange={(e) => setEditForm((p) => ({ ...p, total_amount: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-600 md:col-span-2">
                Status
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditBooking(null)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
                Close
              </button>
              <button
                onClick={saveEditBooking}
                disabled={actionBookingId === editBooking.id}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionBookingId === editBooking.id ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rebookBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-1 text-lg font-semibold">Rebook Booking</h3>
            <p className="mb-4 text-xs text-gray-500">
              {rebookBooking.customer_name} · {rebookBooking.tours?.name || "Tour"}
            </p>
            <label className="text-sm text-gray-600">
              New date
              <input
                type="date"
                value={rebookDate}
                onChange={(e) => setRebookDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm text-gray-600">
              Available slots
              <select
                value={rebookSlotId}
                onChange={(e) => setRebookSlotId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select slot</option>
                {rebookSlots
                  .filter((s) => Math.max((s.capacity_total || 0) - (s.booked || 0), 0) > 0)
                  .map((s) => {
                    const available = Math.max((s.capacity_total || 0) - (s.booked || 0), 0);
                    return (
                      <option key={s.id} value={s.id}>
                        {fmtTime(s.start_time)} · {available} seats available
                      </option>
                    );
                  })}
              </select>
            </label>
            <p className="mt-2 text-xs text-gray-500">{loadingRebookSlots ? "Loading slots..." : `${rebookSlots.length} open slots found`}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRebookBooking(null)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
                Close
              </button>
              <button
                onClick={saveRebook}
                disabled={!rebookSlotId || actionBookingId === rebookBooking.id}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionBookingId === rebookBooking.id ? "Saving..." : "Rebook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotRows({
  slot,
  services,
  isOpen,
  onToggle,
  actionBookingId,
  resendingInvoiceId,
  onEdit,
  onRebook,
  onMarkPaid,
  onRefund,
  onCancel,
  onResendInvoice,
}: {
  slot: SlotGroup;
  services: string;
  isOpen: boolean;
  onToggle: () => void;
  actionBookingId: string | null;
  resendingInvoiceId: string | null;
  onEdit: (b: Booking) => void;
  onRebook: (b: Booking) => void;
  onMarkPaid: (b: Booking) => void;
  onRefund: (b: Booking) => void;
  onCancel: (b: Booking) => void;
  onResendInvoice: (bookingId: string) => void;
}) {
  return (
    <>
      <tr className="cursor-pointer border-t border-gray-100 transition-colors hover:bg-blue-50/40" onClick={onToggle}>
        <td className="p-3 font-medium text-blue-700">
          <span className="mr-1 inline-block w-4 text-gray-400 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "none" }}>
            ›
          </span>
          {slot.timeLabel}
        </td>
        <td className="p-3 font-semibold">{slot.totalPax}</td>
        <td className="hidden p-3 text-gray-500 md:table-cell">{services}</td>
        <td className="p-3 text-right">{fmtCurrency(slot.totalPrice)}</td>
        <td className="p-3 text-right">{fmtCurrency(slot.totalPaid)}</td>
        <td className={`p-3 text-right font-semibold ${slot.totalDue > 0 ? "text-red-600" : "text-green-600"}`}>{fmtCurrency(slot.totalDue)}</td>
        <td className="hidden p-3 lg:table-cell"></td>
        <td className="hidden p-3 lg:table-cell"></td>
      </tr>

      {isOpen &&
        slot.bookings.map((b) => {
          const paid = isPaid(b.status) ? Number(b.total_amount) : 0;
          const due = Number(b.total_amount || 0) - paid;
          const isLoading = actionBookingId === b.id;
          const isResending = resendingInvoiceId === b.id;
          return (
            <tr key={b.id} className="border-t border-gray-100 bg-gray-50/60 text-xs text-gray-600">
              <td className="p-3 pl-10 text-gray-400">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-gray-700">{b.customer_name}</span>
                  <span className="text-[11px]">{b.phone || "No mobile"}</span>
                  <span className="text-[11px]">{b.email || "No email"}</span>
                </div>
              </td>
              <td className="p-3">{b.qty}</td>
              <td className="hidden p-3 md:table-cell">{b.tours?.name || "—"}</td>
              <td className="p-3 text-right">{fmtCurrency(Number(b.total_amount || 0))}</td>
              <td className="p-3 text-right">{fmtCurrency(paid)}</td>
              <td className={`p-3 text-right font-medium ${due > 0 ? "text-red-600" : "text-green-600"}`}>{fmtCurrency(due)}</td>
              <td className="hidden p-3 lg:table-cell">
                <div className="space-y-1">
                  <StatusBadge status={b.status} />
                  <RefundBadge status={b.refund_status} />
                </div>
              </td>
              <td className="hidden p-3 lg:table-cell">
                <div className="flex flex-wrap gap-1.5">
                  <ActionButton label="Edit" onClick={() => onEdit(b)} disabled={isLoading} />
                  <ActionButton label="Rebook" onClick={() => onRebook(b)} disabled={isLoading || b.status === "CANCELLED"} />
                  <ActionButton label="Mark Paid" onClick={() => onMarkPaid(b)} disabled={isLoading || isPaid(b.status)} tone="green" />
                  <ActionButton label="Refund" onClick={() => onRefund(b)} disabled={isLoading || b.status === "CANCELLED"} tone="amber" />
                  <ActionButton label="Cancel" onClick={() => onCancel(b)} disabled={isLoading || b.status === "CANCELLED"} tone="red" />
                  <ActionButton
                    label={isResending ? "Resending..." : "Resend Invoice"}
                    onClick={() => onResendInvoice(b.id)}
                    disabled={isResending}
                    tone="blue"
                  />
                </div>
              </td>
            </tr>
          );
        })}
    </>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone = "gray",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "gray" | "blue" | "green" | "red" | "amber";
}) {
  const tones: Record<string, string> = {
    gray: "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
    blue: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    red: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50 ${tones[tone]}`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    HELD: "bg-orange-100 text-orange-700",
    CONFIRMED: "bg-blue-100 text-blue-700",
    PAID: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-gray-200 text-gray-700",
  };
  return <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${colors[status] || "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

function RefundBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">No refund</span>;
  const colors: Record<string, string> = {
    REQUESTED: "bg-amber-100 text-amber-700",
    PROCESSED: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-red-100 text-red-700",
  };
  return <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${colors[status] || "bg-gray-100 text-gray-700"}`}>Refund {status}</span>;
}
