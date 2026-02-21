"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

var SU = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var SK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Johannesburg" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
}

type SlotGroup = { date: string; label: string; slots: any[] };

export default function PhotosPage() {
  var [slots, setSlots] = useState<SlotGroup[]>([]);
  var [selectedSlot, setSelectedSlot] = useState<any>(null);
  var [urls, setUrls] = useState<string[]>([""]);
  var [sending, setSending] = useState(false);
  var [result, setResult] = useState<any>(null);
  var [sentHistory, setSentHistory] = useState<any[]>([]);

  useEffect(() => { loadSlots(); loadHistory(); }, []);

  async function loadSlots() {
    var past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    var now = new Date().toISOString();
    var { data } = await supabase.from("slots")
      .select("id, start_time, booked, tours(name)")
      .gt("booked", 0)
      .lt("start_time", now)
      .gt("start_time", past)
      .order("start_time", { ascending: false });
    var groups: Record<string, SlotGroup> = {};
    for (var s of (data || [])) {
      var d = new Date(s.start_time).toISOString().split("T")[0];
      if (!groups[d]) groups[d] = { date: d, label: fmtDate(s.start_time), slots: [] };
      groups[d].slots.push(s);
    }
    setSlots(Object.values(groups));
  }

  async function loadHistory() {
    var { data } = await supabase.from("trip_photos")
      .select("id, photo_url, uploaded_at, slots(start_time, tours(name))")
      .order("uploaded_at", { ascending: false })
      .limit(20);
    setSentHistory(data || []);
  }

  function addUrl() { setUrls([...urls, ""]); }
  function removeUrl(i: number) { setUrls(urls.filter((_, idx) => idx !== i)); }
  function updateUrl(i: number, v: string) { var n = [...urls]; n[i] = v; setUrls(n); }

  async function sendPhotos() {
    if (!selectedSlot) { alert("Select a trip slot first"); return; }
    var validUrls = urls.filter(u => u.trim().length > 0);
    if (validUrls.length === 0) { alert("Add at least one photo URL"); return; }
    if (!confirm("Send " + validUrls.length + " photos to all guests on this trip?")) return;

    setSending(true);
    setResult(null);
    try {
      var r = await fetch(SU + "/functions/v1/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SK },
        body: JSON.stringify({ action: "send_photos", slot_id: selectedSlot.id, photo_urls: validUrls }),
      });
      var d = await r.json();
      setResult(d);
      if (!d.error) { setUrls([""]); setSelectedSlot(null); }
      loadHistory();
    } catch (e) { setResult({ error: String(e) }); }
    setSending(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">📸 Trip Photos</h1>
      <p className="text-sm text-gray-500">Send trip photos to guests via WhatsApp. Select a recent trip and add photo URLs.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Select Trip */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold mb-3">Select Trip (Last 7 Days)</h2>
          {slots.length === 0 ? (
            <p className="text-sm text-gray-400">No recent trips with bookings.</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-auto">
              {slots.map(group => (
                <div key={group.date}>
                  <p className="text-xs font-semibold text-gray-400 mb-1">{group.label}</p>
                  {group.slots.map(s => {
                    var isSelected = selectedSlot?.id === s.id;
                    return (
                      <button key={s.id} onClick={() => setSelectedSlot(s)}
                        className={"w-full text-left flex items-center gap-3 p-3 rounded-lg border mb-1 transition-colors " +
                          (isSelected ? "border-blue-400 bg-blue-50" : "border-gray-100 hover:border-gray-200")}>
                        <span className={"w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs " +
                          (isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300")}>
                          {isSelected ? "✓" : ""}
                        </span>
                        <div>
                          <p className="font-semibold text-sm">{(s as any).tours?.name}</p>
                          <p className="text-xs text-gray-400">{fmtTime(s.start_time)} · {s.booked} guests</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Photo URLs + Send */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="font-semibold mb-3">Photo URLs</h2>
            <p className="text-xs text-gray-400 mb-3">Upload photos to Google Drive, Dropbox, or any host and paste the share links here.</p>
            <div className="space-y-2">
              {urls.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={u} onChange={e => updateUrl(i, e.target.value)}
                    placeholder="https://drive.google.com/file/..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  {urls.length > 1 && (
                    <button onClick={() => removeUrl(i)} className="text-gray-400 hover:text-red-500 text-sm px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addUrl} className="mt-2 text-sm text-blue-600 font-medium hover:text-blue-800">+ Add another photo</button>
          </div>

          <button onClick={sendPhotos} disabled={sending || !selectedSlot || urls.every(u => !u.trim())}
            className="w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
            {sending ? "Sending..." : "📸 Send " + urls.filter(u => u.trim()).length + " Photos to " + (selectedSlot?.booked || 0) + " Guests"}
          </button>

          {result && (
            <div className={"text-sm p-3 rounded-lg " + (result.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
              {result.error ? "Error: " + result.error : "✅ Sent to " + result.sent + " guests!"}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      {sentHistory.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold mb-3">Recently Sent</h2>
          <div className="space-y-2 max-h-48 overflow-auto">
            {sentHistory.map(p => (
              <div key={p.id} className="flex items-center gap-3 text-sm border-b border-gray-50 py-2">
                <span className="text-gray-400">📸</span>
                <span className="flex-1 truncate text-blue-600 text-xs">{p.photo_url}</span>
                <span className="text-xs text-gray-400">{new Date(p.uploaded_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
