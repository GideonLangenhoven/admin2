"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

var SU = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var SK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
}

type SlotData = { id: string; start_time: string; capacity_total: number; booked: number; held: number; tours: { name: string } };

export default function BroadcastsPage() {
  var [vMonth, setVMonth] = useState(new Date().getMonth());
  var [vYear, setVYear] = useState(new Date().getFullYear());
  var [allSlots, setAllSlots] = useState<SlotData[]>([]);
  var [selectedDate, setSelectedDate] = useState<string | null>(null);
  var [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  var [bookings, setBookings] = useState<any[]>([]);
  var [loadingBookings, setLoadingBookings] = useState(false);
  var [message, setMessage] = useState("");
  var [sending, setSending] = useState(false);
  var [result, setResult] = useState<any>(null);
  var [history, setHistory] = useState<any[]>([]);
  var [weatherMode, setWeatherMode] = useState(false);
  var [weatherReason, setWeatherReason] = useState("unfavourable weather conditions");
  var [weatherResult, setWeatherResult] = useState<any>(null);
  var [cancellingWeather, setCancellingWeather] = useState(false);

  useEffect(() => { loadSlots(); loadHistory(); }, []);

  async function loadSlots() {
    var now = new Date();
    var future = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    var { data } = await supabase.from("slots")
      .select("id, start_time, capacity_total, booked, held, tours(name)")
      .eq("status", "OPEN")
      .gt("start_time", now.toISOString())
      .lt("start_time", future.toISOString())
      .order("start_time", { ascending: true });
    setAllSlots((data || []) as any);
  }

  async function loadHistory() {
    var { data } = await supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(15);
    setHistory(data || []);
  }

  // Calendar helpers
  var dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  var firstDay = new Date(vYear, vMonth, 1).getDay();
  var daysInMonth = new Date(vYear, vMonth + 1, 0).getDate();
  var monthName = new Date(vYear, vMonth).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  var now = new Date();
  var canPrev = vYear > now.getFullYear() || (vYear === now.getFullYear() && vMonth > now.getMonth());

  // Slots grouped by date
  var slotsByDate: Record<string, SlotData[]> = {};
  for (var s of allSlots) {
    var d = new Date(s.start_time).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
    if (!slotsByDate[d]) slotsByDate[d] = [];
    slotsByDate[d].push(s);
  }

  // Calendar cells
  var cells: { day: number; date: string; isPast: boolean; hasSlots: boolean; bookCount: number }[] = [];
  for (var i = 1; i <= daysInMonth; i++) {
    var ds = vYear + "-" + String(vMonth + 1).padStart(2, "0") + "-" + String(i).padStart(2, "0");
    var isPast = new Date(ds + "T23:59:59") < now;
    var daySlots = slotsByDate[ds] || [];
    var bookCount = daySlots.reduce((sum, sl) => sum + sl.booked, 0);
    cells.push({ day: i, date: ds, isPast, hasSlots: daySlots.length > 0, bookCount });
  }

  // Selected date slots
  var dateSlots = selectedDate ? (slotsByDate[selectedDate] || []) : [];

  function toggleSlot(slotId: string) {
    var next = selectedSlotIds.includes(slotId) ? selectedSlotIds.filter(id => id !== slotId) : [...selectedSlotIds, slotId];
    setSelectedSlotIds(next);
    if (next.length > 0) loadAffected(next);
    else setBookings([]);
  }

  function selectAllDate() {
    var ids = dateSlots.map(s => s.id);
    var allSelected = ids.every(id => selectedSlotIds.includes(id));
    var next = allSelected ? selectedSlotIds.filter(id => !ids.includes(id)) : [...new Set([...selectedSlotIds, ...ids])];
    setSelectedSlotIds(next);
    if (next.length > 0) loadAffected(next);
    else setBookings([]);
  }

  async function loadAffected(slotIds: string[]) {
    setLoadingBookings(true);
    var { data } = await supabase.from("bookings")
      .select("id, customer_name, phone, email, qty, total_amount, status, slots(start_time), tours(name)")
      .in("slot_id", slotIds)
      .in("status", ["PAID", "CONFIRMED"]);
    setBookings(data || []);
    setLoadingBookings(false);
  }

  async function sendBroadcast() {
    if (!message.trim() || selectedSlotIds.length === 0 || bookings.length === 0) return;
    if (!confirm("Send to " + bookings.length + " customers via WhatsApp & email?")) return;
    setSending(true); setResult(null);
    try {
      var r = await fetch(SU + "/functions/v1/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SK },
        body: JSON.stringify({ action: "broadcast_targeted", message, target_group: "SLOT", slot_ids: selectedSlotIds, send_email: true, send_whatsapp: true }),
      });
      var d = await r.json();
      setResult(d);
      if (!d.error) { setMessage(""); setSelectedSlotIds([]); setBookings([]); }
      loadHistory();
    } catch (e) { setResult({ error: String(e) }); }
    setSending(false);
  }

  async function sendWeatherCancel() {
    if (selectedSlotIds.length === 0) return;
    if (!confirm("Cancel " + selectedSlotIds.length + " slots and notify " + bookings.length + " customers?")) return;
    setCancellingWeather(true); setWeatherResult(null);
    try {
      var r = await fetch(SU + "/functions/v1/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SK },
        body: JSON.stringify({ action: "weather_cancel", slot_ids: selectedSlotIds, reason: weatherReason }),
      });
      var d = await r.json();
      setWeatherResult(d);
      if (!d.error) { setSelectedSlotIds([]); setBookings([]); setSelectedDate(null); loadSlots(); }
      loadHistory();
    } catch (e) { setWeatherResult({ error: String(e) }); }
    setCancellingWeather(false);
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📢 Broadcasts</h1>
        <button onClick={() => { setWeatherMode(!weatherMode); setWeatherResult(null); }}
          className={"px-4 py-2 rounded-lg text-sm font-semibold border transition-colors " + (weatherMode ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50")}>
          {weatherMode ? "⛈ Weather Mode ON" : "⛈ Weather Cancel"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Calendar */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => { if (vMonth === 0) { setVMonth(11); setVYear(vYear - 1); } else setVMonth(vMonth - 1); }}
                disabled={!canPrev} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-20">◀</button>
              <span className="text-sm font-semibold">{monthName}</span>
              <button onClick={() => { if (vMonth === 11) { setVMonth(0); setVYear(vYear + 1); } else setVMonth(vMonth + 1); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">▶</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayNames.map(d => <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }, (_, i) => <div key={"e" + i} />)}
              {cells.map(c => {
                if (c.isPast || !c.hasSlots) return <div key={c.date} className="text-center py-2 text-sm text-gray-300 rounded-lg">{c.day}</div>;
                var isSelected = selectedDate === c.date;
                var hasSelectedSlots = (slotsByDate[c.date] || []).some(s => selectedSlotIds.includes(s.id));
                return (
                  <button key={c.date} onClick={() => { setSelectedDate(c.date); }}
                    className={"text-center py-2 text-sm font-semibold rounded-lg transition-colors relative " +
                      (isSelected ? "bg-gray-900 text-white" : hasSelectedSlots ? "bg-blue-100 text-blue-800" : "text-gray-900 hover:bg-gray-100")}>
                    {c.day}
                    {c.bookCount > 0 && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-emerald-600 font-bold">{c.bookCount}</span>
                    )}
                    {c.bookCount === 0 && !isSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gray-300"></span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">Numbers = booked guests</p>
          </div>

          {/* Slots for selected date */}
          {selectedDate && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <button onClick={selectAllDate} className="text-xs text-blue-600 font-medium hover:text-blue-800">
                  {dateSlots.every(s => selectedSlotIds.includes(s.id)) ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="space-y-2">
                {dateSlots.map(s => {
                  var isSelected = selectedSlotIds.includes(s.id);
                  var booked = s.booked;
                  return (
                    <button key={s.id} onClick={() => toggleSlot(s.id)}
                      className={"w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-colors " +
                        (isSelected ? "border-blue-400 bg-blue-50" : "border-gray-100 hover:border-gray-200")}>
                      <span className={"w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold " +
                        (isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300")}>
                        {isSelected ? "✓" : ""}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{(s as any).tours?.name}</p>
                        <p className="text-xs text-gray-400">{fmtTime(s.start_time)}</p>
                      </div>
                      <div className="text-right">
                        <p className={"text-sm font-bold " + (booked > 0 ? "text-emerald-600" : "text-gray-300")}>{booked}</p>
                        <p className="text-xs text-gray-400">booked</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right side: customers + compose */}
        <div className="lg:col-span-8 space-y-4">
          {/* Selected summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold text-sm">{selectedSlotIds.length} slot{selectedSlotIds.length !== 1 ? "s" : ""} selected</p>
              <p className="text-xs text-gray-400">{bookings.length} customer{bookings.length !== 1 ? "s" : ""} will be notified</p>
            </div>
            {selectedSlotIds.length > 0 && (
              <button onClick={() => { setSelectedSlotIds([]); setBookings([]); }} className="text-xs text-gray-500 hover:text-gray-800">Clear All</button>
            )}
          </div>

          {/* Affected customers */}
          {bookings.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3">Customers ({bookings.length})</h3>
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left py-2 font-medium">Name</th>
                      <th className="text-left py-2 font-medium">Tour</th>
                      <th className="text-left py-2 font-medium">Time</th>
                      <th className="text-center py-2 font-medium">Pax</th>
                      <th className="text-center py-2 font-medium">Channels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map(b => (
                      <tr key={b.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{b.customer_name}</td>
                        <td className="py-2 text-gray-500">{(b as any).tours?.name}</td>
                        <td className="py-2 text-gray-500">{(b as any).slots?.start_time ? fmtTime((b as any).slots.start_time) : "—"}</td>
                        <td className="py-2 text-center">{b.qty}</td>
                        <td className="py-2 text-center">
                          {b.phone && <span className="text-emerald-600 mr-1" title="WhatsApp">📱</span>}
                          {b.email && <span className="text-blue-600" title="Email">✉</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compose */}
          {weatherMode ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <h2 className="font-semibold text-lg text-red-800 mb-2">⛈ Weather Cancellation</h2>
              <p className="text-sm text-red-600 mb-4">Cancels selected slots, sends refund/reschedule options via WhatsApp, and a professional cancellation email.</p>
              <div className="mb-4">
                <label className="text-xs text-red-700 font-medium block mb-1">Reason</label>
                <input type="text" value={weatherReason} onChange={e => setWeatherReason(e.target.value)}
                  className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <button onClick={sendWeatherCancel} disabled={cancellingWeather || selectedSlotIds.length === 0}
                className="w-full bg-red-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {cancellingWeather ? "Cancelling..." : "⛈ Cancel & Notify " + bookings.length + " Customers"}
              </button>
              {weatherResult && (
                <div className={"text-sm p-3 rounded-lg mt-3 " + (weatherResult.error ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                  {weatherResult.error ? "Error: " + weatherResult.error : "Cancelled " + (weatherResult.affected || 0) + " bookings, notified " + (weatherResult.sent || 0)}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-lg mb-3">📝 Compose</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">WhatsApp Message</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)}
                    rows={4} placeholder="Hi {name}, just a quick message about your upcoming paddle..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                  <p className="text-xs text-gray-400 mt-1">Use &#123;name&#125; for customer&apos;s first name. The email version will be automatically formatted professionally.</p>
                </div>
                <button onClick={sendBroadcast} disabled={sending || !message.trim() || selectedSlotIds.length === 0 || bookings.length === 0}
                  className="w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
                  {sending ? "Sending..." : "📢 Send to " + bookings.length + " Customers (WhatsApp + Email)"}
                </button>
                {result && (
                  <div className={"text-sm p-3 rounded-lg " + (result.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
                    {result.error ? "Error: " + result.error : "✅ " + (result.wa_sent || 0) + " WhatsApp + " + (result.email_sent || 0) + " emails sent"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* History */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold mb-3">Recent Broadcasts</h2>
            {history.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-3 border border-gray-100 rounded-lg p-3">
                    <span className={"text-xs font-medium px-2 py-0.5 rounded-full shrink-0 " + (h.target_group === "AFFECTED_BOOKINGS" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                      {h.target_group === "AFFECTED_BOOKINGS" ? "⛈" : "📢"}
                    </span>
                    <p className="text-sm text-gray-700 flex-1 line-clamp-1">{h.message}</p>
                    <span className="text-xs text-gray-400 shrink-0">{h.sent_count} sent</span>
                    <span className="text-xs text-gray-300 shrink-0">{new Date(h.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
