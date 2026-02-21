"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

interface Tour {
  id: string;
  name: string;
  base_price_per_person: number | null;
  peak_price_per_person: number | null;
}

interface Slot {
  id: string;
  start_time: string;
  capacity_total: number;
  booked: number;
  status: string;
  tour_id: string;
  price_per_person_override: number | null;
  tours: { name?: string } | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  });
}

function fmtCurrency(v: number) {
  return "R" + v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayInput() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(new Date());
}

function dayRange(dateInput: string) {
  const start = new Date(`${dateInput}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export default function NewBookingPage() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [loadingTours, setLoadingTours] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedTourId, setSelectedTourId] = useState("");
  const [bookingDate, setBookingDate] = useState(todayInput());
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [adults, setAdults] = useState("0");
  const [children, setChildren] = useState("0");
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [sendPaymentLink, setSendPaymentLink] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");

  function formatSupabaseError(err: { message?: string; details?: string; hint?: string; code?: string } | null) {
    if (!err) return "Unknown error";
    const bits = [err.message, err.details, err.hint, err.code].filter(Boolean);
    return bits.join(" | ");
  }

  async function loadTours() {
    setLoadingTours(true);
    const { data } = await supabase
      .from("tours")
      .select("id, name, base_price_per_person, peak_price_per_person")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    const rows = (data || []) as Tour[];
    setTours(rows);
    if (!selectedTourId && rows[0]?.id) setSelectedTourId(rows[0].id);
    setLoadingTours(false);
  }

  async function loadSlots() {
    if (!bookingDate) return;
    setLoadingSlots(true);
    const { startIso, endIso } = dayRange(bookingDate);
    let query = supabase
      .from("slots")
      .select("id, start_time, capacity_total, booked, status, tour_id, price_per_person_override, tours(name)")
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .eq("status", "OPEN")
      .order("start_time", { ascending: true });
    if (selectedTourId) query = query.eq("tour_id", selectedTourId);
    const { data } = await query;
    setSlots((data || []) as Slot[]);
    setSelectedSlotId("");
    setLoadingSlots(false);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      loadTours();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadSlots();
    }, 0);
    return () => clearTimeout(t);
  }, [bookingDate, selectedTourId]);

  const selectedTour = useMemo(() => tours.find((t) => t.id === selectedTourId) || null, [tours, selectedTourId]);
  const selectedSlot = useMemo(() => slots.find((s) => s.id === selectedSlotId) || null, [slots, selectedSlotId]);
  const qty = Math.max(0, Number(adults) || 0) + Math.max(0, Number(children) || 0);
  const unitPrice = Number(
    selectedSlot?.price_per_person_override ??
      selectedTour?.peak_price_per_person ??
      selectedTour?.base_price_per_person ??
      0
  );
  const totalAmount = qty * unitPrice;
  const availableSlots = slots.filter((s) => Math.max((s.capacity_total || 0) - (s.booked || 0), 0) > 0);
  const availableSeats = availableSlots.reduce((sum, s) => sum + Math.max((s.capacity_total || 0) - (s.booked || 0), 0), 0);

  async function createBooking() {
    if (!selectedTourId || !bookingDate || !selectedSlotId || qty <= 0 || !customerName.trim() || !mobile.trim() || !email.trim()) {
      alert("Please complete all required fields.");
      return;
    }

    setSubmitting(true);
    setResult("");
    try {
      const bookingId = crypto.randomUUID();
      const insertPayload = {
        id: bookingId,
        slot_id: selectedSlotId,
        customer_name: customerName.trim(),
        phone: mobile.trim(),
        email: email.trim(),
        qty,
        total_amount: totalAmount,
        status,
      };

      const { error: insertError } = await supabase.from("bookings").insert(insertPayload);
      if (insertError) {
        setSubmitting(false);
        alert("Booking creation failed: " + formatSupabaseError(insertError));
        return;
      }

      let confirmError = "";
      let invoiceError = "";

      const confirmRes = await supabase.functions.invoke("send-booking-confirmation", {
        body: {
          booking_id: bookingId,
          send_payment_link: sendPaymentLink,
          source: "ADMIN_MANUAL",
        },
      });
      if (confirmRes.error) confirmError = confirmRes.error.message;

      const invoiceRes = await supabase.functions.invoke("send-invoice", {
        body: {
          booking_id: bookingId,
          invoice_type: "PRO_FORMA",
          resend: false,
          send_payment_link: sendPaymentLink,
        },
      });
      if (invoiceRes.error) invoiceError = invoiceRes.error.message;

      if (confirmError && invoiceError) {
        setResult(`Booking created (${bookingId.substring(0, 8).toUpperCase()}) but email/link send failed. Please configure functions 'send-booking-confirmation' and 'send-invoice'.`);
      } else {
        setResult(`Booking created (${bookingId.substring(0, 8).toUpperCase()}) and confirmation email flow triggered.`);
      }

      setCustomerName("");
      setMobile("");
      setEmail("");
      setAdults("0");
      setChildren("0");
      setSelectedSlotId("");
      setSendPaymentLink(true);
      loadSlots();
    } catch (err: unknown) {
      alert("Booking creation failed: " + (err instanceof Error ? err.message : String(err)));
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">➕ New Booking</h2>
        <p className="text-sm text-gray-500">Create manual bookings and send confirmation with payment link.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-xl font-medium text-gray-700">Activity Details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-gray-600">
            To attend
            <select
              value={selectedTourId}
              onChange={(e) => setSelectedTourId(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Please select a service</option>
              {tours.map((tour) => (
                <option key={tour.id} value={tour.id}>
                  {tour.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-gray-600">
            On
            <input
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm text-gray-600">
            Adults
            <input
              type="number"
              min={0}
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm text-gray-600">
            Children
            <input
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-base font-semibold text-gray-700">Customer Details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="text-sm text-gray-600">
            Full Name
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-gray-600">
            Mobile Number
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-gray-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-700">Slot Availability</h3>
          <p className="text-xs text-gray-500">
            {loadingSlots ? "Loading slots..." : `${availableSlots.length} slots available · ${availableSeats} seats open`}
          </p>
        </div>

        <label className="text-sm text-gray-600">
          Select slot time
          <select
            value={selectedSlotId}
            onChange={(e) => setSelectedSlotId(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Choose slot</option>
            {availableSlots.map((slot) => {
              const available = Math.max((slot.capacity_total || 0) - (slot.booked || 0), 0);
              return (
                <option key={slot.id} value={slot.id}>
                  {fmtTime(slot.start_time)} · {available} seats available
                </option>
              );
            })}
          </select>
        </label>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-xs text-gray-500">Qty</p>
            <p className="font-semibold">{qty}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-xs text-gray-500">Unit Price</p>
            <p className="font-semibold">{fmtCurrency(unitPrice)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-xs text-gray-500">Total Amount</p>
            <p className="font-semibold">{fmtCurrency(totalAmount)}</p>
          </div>
          <label className="rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-xs text-gray-500">Payment status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm">
              <option value="PENDING">PENDING</option>
              <option value="HELD">HELD</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PAID">PAID</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={sendPaymentLink}
            onChange={(e) => setSendPaymentLink(e.target.checked)}
            className="rounded border-gray-300"
          />
          Send payment link in confirmation
        </label>
        <button
          onClick={createBooking}
          disabled={submitting || loadingTours || loadingSlots}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create Booking + Send Confirmation"}
        </button>
      </div>

      {result && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{result}</div>}
    </div>
  );
}
