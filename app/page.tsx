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
      `p=WINDSPD,GUST,SMER,WAVES,WVPER,WVDIR,TMPE,CDC,APCP1s,RATING`, `b=2`, `hc=#333`,
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

  return <div id={containerId} className="flex min-h-[350px] items-center justify-center overflow-x-auto bg-slate-50/80 p-2 font-semibold text-slate-400">Loading Windguru...</div>;
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
    <div className="flex h-64 items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--ck-accent-soft)] border-t-[var(--ck-accent)]"></div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="ui-surface border-transparent bg-white/70 p-5 md:p-6">
        <h2 className="ui-title-lg">📊 Dashboard</h2>
        <p className="mt-1 text-sm ui-text-muted">
          {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* ── Action Items ── */}
      <div>
        <h3 className="ui-section-title mb-3">Action Items</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Refunds */}
          <Link href="/refunds" className="block">
            <div className={`ui-surface p-4 md:p-5 hover:-translate-y-0.5 hover:shadow-[var(--ck-shadow-md)] ${refundCount > 0 ? "border-red-200 hover:border-red-300" : "hover:border-[var(--ck-border-strong)]"}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl">💰</span>
                {refundCount > 0 && <span className="ui-pill animate-pulse bg-[var(--ck-danger)] text-white">{refundCount}</span>}
              </div>
              <p className="ui-title-md">Pending Refunds</p>
              {refundCount > 0 ? (
                <p className="text-lg font-semibold text-[var(--ck-danger)]">R{refundTotal.toLocaleString()}</p>
              ) : (
                <p className="text-sm font-medium text-[var(--ck-success)]">All clear ✓</p>
              )}
            </div>
          </Link>

          {/* Inbox */}
          <Link href="/inbox" className="block">
            <div className={`ui-surface p-4 md:p-5 hover:-translate-y-0.5 hover:shadow-[var(--ck-shadow-md)] ${inboxCount > 0 ? "border-amber-200 hover:border-amber-300" : "hover:border-[var(--ck-border-strong)]"}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl">💬</span>
                {inboxCount > 0 && <span className="ui-pill animate-pulse bg-[var(--ck-warning)] text-white">{inboxCount}</span>}
              </div>
              <p className="ui-title-md">Inbox Messages</p>
              {inboxCount > 0 ? (
                <p className="text-lg font-semibold text-[var(--ck-warning)]">{inboxCount} awaiting</p>
              ) : (
                <p className="text-sm font-medium text-[var(--ck-success)]">All clear ✓</p>
              )}
            </div>
          </Link>

          {/* Photos */}
          <Link href="/photos" className="block">
            <div className={`ui-surface p-4 md:p-5 hover:-translate-y-0.5 hover:shadow-[var(--ck-shadow-md)] ${photosOutstanding > 0 ? "border-blue-200 hover:border-blue-300" : "hover:border-[var(--ck-border-strong)]"}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl">📷</span>
                {photosOutstanding > 0 && <span className="ui-pill bg-[var(--ck-accent)] text-white">{photosOutstanding}</span>}
              </div>
              <p className="ui-title-md">Photos Outstanding</p>
              {photosOutstanding > 0 ? (
                <p className="text-lg font-semibold text-[var(--ck-accent)]">{photosOutstanding} trips</p>
              ) : (
                <p className="text-sm font-medium text-[var(--ck-success)]">All sent ✓</p>
              )}
            </div>
          </Link>

          {/* Today's Bookings */}
          <Link href="/bookings" className="block">
            <div className="ui-surface border-emerald-200 p-4 md:p-5 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[var(--ck-shadow-md)]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl">📋</span>
                <span className="ui-pill bg-emerald-100 text-emerald-700">{todayPax} pax</span>
              </div>
              <p className="ui-title-md">Today&apos;s Bookings</p>
              <p className="text-lg font-semibold text-emerald-600">{todayBookings} trips · R{todayRevenue.toLocaleString()}</p>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Weather Widgets ── */}
      <div
        ref={dragRef}
        style={dragPos ? { position: "fixed", left: dragPos.x, top: dragPos.y, zIndex: 50, width: "calc(100% - 16rem - 3rem)" } : undefined}
      >
        <div className="ui-surface-elevated p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
            <h3
              className="ui-section-title cursor-move select-none"
              onMouseDown={onMouseDown}
              title="Drag to reposition"
            >
              ⛅ Weather
            </h3>
            <button
              onClick={() => setWeatherOpen(!weatherOpen)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--ck-text-muted)] hover:bg-[var(--ck-accent-soft)] hover:text-[var(--ck-text-strong)]"
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
              className="ui-control min-w-[220px]"
            >
              {LOCATIONS.map(l => (
                <option key={l.name} value={l.name}>{l.name}</option>
              ))}
            </select>
          </div>

          {weatherOpen && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Windy */}
              <div className="ui-surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--ck-border-subtle)] px-4 py-3">
                  <span className="ui-title-md">🌊 Windy — {location.name}</span>
                  <a href={`https://www.windy.com/${location.lat}/${location.lon}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--ck-accent)] hover:underline">Open ↗</a>
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
              <div className="ui-surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--ck-border-subtle)] px-4 py-3">
                  <span className="ui-title-md">🏄 Windguru — {location.name}</span>
                  <a href={`https://www.windguru.cz/${location.wgSpot}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--ck-accent)] hover:underline">Open ↗</a>
                </div>
                <WindguruWidget key={`wg-${location.wgSpot}`} spotId={location.wgSpot} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Today's Manifest ── */}
      <div className="ui-surface-elevated overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--ck-border-subtle)] p-4">
          <h3 className="ui-title-md">Today&apos;s Manifest</h3>
          <span className="text-xs ui-text-muted">{manifest.length} bookings · {todayPax} pax</span>
        </div>
        {manifest.length === 0 ? (
          <p className="p-4 text-sm ui-text-muted">No bookings today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="p-3 text-left font-medium ui-text-muted">Time</th>
                  <th className="p-3 text-left font-medium ui-text-muted">Customer</th>
                  <th className="hidden p-3 text-left font-medium ui-text-muted md:table-cell">Phone</th>
                  <th className="p-3 text-left font-medium ui-text-muted">Tour</th>
                  <th className="p-3 text-left font-medium ui-text-muted">Pax</th>
                  <th className="p-3 text-left font-medium ui-text-muted">Total</th>
                </tr>
              </thead>
              <tbody>
                {manifest.map((b: any) => (
                  <tr key={b.id} className="border-t border-[var(--ck-border-subtle)] hover:bg-slate-50/65">
                    <td className="p-3 font-medium text-[var(--ck-accent)]">{b.slots?.start_time ? fmtTime(b.slots.start_time) : "—"}</td>
                    <td className="p-3">{b.customer_name}</td>
                    <td className="hidden p-3 text-xs ui-text-muted md:table-cell">{b.phone}</td>
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
