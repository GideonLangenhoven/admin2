"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import Link from "next/link";

/* ── helpers ── */
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Africa/Johannesburg",
  });
}

/* ── preset locations ── */
const LOCATIONS = [
  { name: "Three Anchor Bay, Sea Point", lat: -33.908, lon: 18.396, wgSpot: 137629 },
  { name: "Simon's Town", lat: -34.19, lon: 18.45, wgSpot: 20 },
  { name: "Hout Bay", lat: -34.05, lon: 18.35, wgSpot: 12 },
  { name: "Table Bay", lat: -33.90, lon: 18.43, wgSpot: 9 },
  { name: "False Bay (Muizenberg)", lat: -34.10, lon: 18.47, wgSpot: 11 },
  { name: "Kalk Bay", lat: -34.13, lon: 18.45, wgSpot: 20 },
  { name: "Cape Point", lat: -34.35, lon: 18.50, wgSpot: 10 },
  { name: "Camps Bay", lat: -33.95, lon: 18.38, wgSpot: 7 },
  { name: "Gordon's Bay", lat: -34.16, lon: 18.87, wgSpot: 18 },
];

/* ── Windguru Widget Component ── */
function WindguruWidget({ spotId }: { spotId: number }) {
  const containerId = `wg-container-${spotId}`;

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const uid = `wg_fwdg_${spotId}_${Date.now()}`;
    const args = [
      `s=${spotId}`, `m=3`, `uid=${uid}`, `wj=kmh`, `tj=c`, `odession=true`,
      `p=WINDSPD,GUST,SMER,TMPE,WAVES,WVDIR,WVPER`, `b=2`, `hc=#333`,
      `dc=gray`, `tc=#333`, `stl=`, `lng=en`, `wl=`, `session=true`,
    ];

    // Windguru requires the script to be inserted dynamically this exact way
    const script = document.createElement("script");
    script.src = `https://www.windguru.cz/js/widget.php?${args.join("&")}`;
    script.id = uid;
    script.async = true;
    container.appendChild(script);

    return () => { container.innerHTML = ""; };
  }, [spotId, containerId]);

  return <div id={containerId} className="p-2 min-h-[350px] overflow-x-auto bg-gray-50 flex items-center justify-center font-semibold text-gray-400">Loading Windguru...</div>;
}

/* ── main component ── */
export default function Dashboard() {
  const [refundCount, setRefundCount] = useState(0);
  const [refundTotal, setRefundTotal] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [photosOutstanding, setPhotosOutstanding] = useState(0);
  const [todayBookings, setTodayBookings] = useState(0);
  const [todayPax, setTodayPax] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [manifest, setManifest] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Weather location
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [weatherOpen, setWeatherOpen] = useState(true);

  // Draggable weather widget
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    isDragging.current = true;
    const rect = dragRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setDragPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's bookings
    const { data: bks } = await supabase
      .from("bookings")
      .select("id, customer_name, phone, qty, total_amount, status, slots(start_time), tours(name)")
      .in("status", ["PAID", "CONFIRMED"])
      .gte("slots.start_time", today.toISOString())
      .lt("slots.start_time", tomorrow.toISOString())
      .order("created_at", { ascending: true });

    const filtered = (bks || []).map((b: any) => ({
      ...b,
      tours: Array.isArray(b.tours) ? b.tours[0] : b.tours,
      slots: Array.isArray(b.slots) ? b.slots[0] : b.slots,
    })).filter((b: any) => b.slots?.start_time);

    setManifest(filtered);
    setTodayBookings(filtered.length);
    setTodayPax(filtered.reduce((s: number, b: any) => s + b.qty, 0));
    setTodayRevenue(filtered.reduce((s: number, b: any) => s + Number(b.total_amount), 0));

    // Refunds pending
    const { data: refunds } = await supabase.from("bookings")
      .select("id, refund_amount")
      .eq("refund_status", "REQUESTED");
    setRefundCount((refunds || []).length);
    setRefundTotal((refunds || []).reduce((s: number, b: any) => s + Number(b.refund_amount || 0), 0));

    // Inbox messages
    const { count: ic } = await supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "HUMAN");
    setInboxCount(ic || 0);

    // Photos outstanding — completed slots in last 7 days with bookings but no photo sent
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const { data: completedSlots } = await supabase.from("slots")
      .select("id, start_time, booked")
      .lt("start_time", now)
      .gt("start_time", weekAgo)
      .gt("booked", 0);
    const { data: sentPhotos } = await supabase.from("trip_photos")
      .select("slot_id")
      .gt("uploaded_at", weekAgo);
    const sentSlotIds = new Set((sentPhotos || []).map((p: any) => p.slot_id));
    const outstanding = (completedSlots || []).filter((s: any) => !sentSlotIds.has(s.id));
    setPhotosOutstanding(outstanding.length);

    setLoading(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">📊 Dashboard</h2>
        <p className="text-gray-500 text-sm">
          {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* ── Action Items ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Action Items</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Refunds */}
          <Link href="/refunds" className="block">
            <div className={`bg-white rounded-xl p-4 border-2 transition-all hover:shadow-md ${refundCount > 0 ? "border-red-200 hover:border-red-300" : "border-gray-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">💰</span>
                {refundCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">{refundCount}</span>}
              </div>
              <p className="text-sm font-medium text-gray-700">Pending Refunds</p>
              {refundCount > 0 ? (
                <p className="text-lg font-bold text-red-600">R{refundTotal.toLocaleString()}</p>
              ) : (
                <p className="text-sm text-green-600 font-medium">All clear ✓</p>
              )}
            </div>
          </Link>

          {/* Inbox */}
          <Link href="/inbox" className="block">
            <div className={`bg-white rounded-xl p-4 border-2 transition-all hover:shadow-md ${inboxCount > 0 ? "border-orange-200 hover:border-orange-300" : "border-gray-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">💬</span>
                {inboxCount > 0 && <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">{inboxCount}</span>}
              </div>
              <p className="text-sm font-medium text-gray-700">Inbox Messages</p>
              {inboxCount > 0 ? (
                <p className="text-lg font-bold text-orange-600">{inboxCount} awaiting</p>
              ) : (
                <p className="text-sm text-green-600 font-medium">All clear ✓</p>
              )}
            </div>
          </Link>

          {/* Photos */}
          <Link href="/photos" className="block">
            <div className={`bg-white rounded-xl p-4 border-2 transition-all hover:shadow-md ${photosOutstanding > 0 ? "border-blue-200 hover:border-blue-300" : "border-gray-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">📷</span>
                {photosOutstanding > 0 && <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{photosOutstanding}</span>}
              </div>
              <p className="text-sm font-medium text-gray-700">Photos Outstanding</p>
              {photosOutstanding > 0 ? (
                <p className="text-lg font-bold text-blue-600">{photosOutstanding} trips</p>
              ) : (
                <p className="text-sm text-green-600 font-medium">All sent ✓</p>
              )}
            </div>
          </Link>

          {/* Today's Bookings */}
          <Link href="/bookings" className="block">
            <div className="bg-white rounded-xl p-4 border-2 border-emerald-200 hover:border-emerald-300 transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">📋</span>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{todayPax} pax</span>
              </div>
              <p className="text-sm font-medium text-gray-700">Today&apos;s Bookings</p>
              <p className="text-lg font-bold text-emerald-600">{todayBookings} trips · R{todayRevenue.toLocaleString()}</p>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Weather Widgets ── */}
      <div
        ref={dragRef}
        style={dragPos ? { position: "fixed", left: dragPos.x, top: dragPos.y, zIndex: 50, width: "calc(100% - 16rem - 3rem)" } : undefined}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3
              className="text-sm font-semibold text-gray-500 uppercase tracking-wider cursor-move select-none"
              onMouseDown={onMouseDown}
              title="Drag to reposition"
            >
              ⛅ Weather
            </h3>
            <button
              onClick={() => setWeatherOpen(!weatherOpen)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {weatherOpen ? "▼ Collapse" : "▶ Expand"}
            </button>
          </div>

          {/* Location selector */}
          <select
            value={location.name}
            onChange={(e) => {
              const loc = LOCATIONS.find(l => l.name === e.target.value);
              if (loc) setLocation(loc);
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LOCATIONS.map(l => (
              <option key={l.name} value={l.name}>{l.name}</option>
            ))}
          </select>
        </div>

        {weatherOpen && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Windy */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">🌊 Windy — {location.name}</span>
                <a href={`https://www.windy.com/${location.lat}/${location.lon}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">Open ↗</a>
              </div>
              <iframe
                key={`windy-${location.lat}-${location.lon}`}
                src={`https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=11&overlay=wind&product=ecmwf&level=surface&lat=${location.lat}&lon=${location.lon}&detailLat=${location.lat}&detailLon=${location.lon}&marker=true&message=true`}
                width="100%"
                height="350"
                frameBorder="0"
                className="w-full"
              />
            </div>

            {/* Windguru */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">🏄 Windguru — {location.name}</span>
                <a href={`https://www.windguru.cz/${location.wgSpot}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">Open ↗</a>
              </div>
              <WindguruWidget key={`wg-${location.wgSpot}`} spotId={location.wgSpot} />
            </div>
          </div>
        )}
      </div>

      {/* ── Today's Manifest ── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold">Today&apos;s Manifest</h3>
          <span className="text-xs text-gray-400">{manifest.length} bookings · {todayPax} pax</span>
        </div>
        {manifest.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">No bookings today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Time</th>
                  <th className="text-left p-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">Phone</th>
                  <th className="text-left p-3 font-medium text-gray-600">Tour</th>
                  <th className="text-left p-3 font-medium text-gray-600">Pax</th>
                  <th className="text-left p-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {manifest.map((b: any) => (
                  <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium text-blue-700">{b.slots?.start_time ? fmtTime(b.slots.start_time) : "—"}</td>
                    <td className="p-3">{b.customer_name}</td>
                    <td className="p-3 text-gray-500 text-xs hidden md:table-cell">{b.phone}</td>
                    <td className="p-3">{b.tours?.name}</td>
                    <td className="p-3">{b.qty}</td>
                    <td className="p-3 font-medium">R{Number(b.total_amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
