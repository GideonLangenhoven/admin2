"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

var SU = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var SK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
}

export default function Refunds() {
  var [refunds, setRefunds] = useState<any[]>([]);
  var [processed, setProcessed] = useState<any[]>([]);
  var [loading, setLoading] = useState(true);
  var [processing, setProcessing] = useState<string | null>(null);
  var [results, setResults] = useState<Record<string, any>>({});
  var [showProcessed, setShowProcessed] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    var { data: pending } = await supabase.from("bookings")
      .select("id, customer_name, phone, email, qty, total_amount, refund_status, refund_amount, refund_notes, cancellation_reason, cancelled_at, yoco_checkout_id, slots(start_time), tours(name)")
      .eq("refund_status", "REQUESTED")
      .order("cancelled_at", { ascending: false });
    setRefunds(pending || []);

    var { data: done } = await supabase.from("bookings")
      .select("id, customer_name, phone, email, qty, total_amount, refund_status, refund_amount, refund_notes, cancelled_at, slots(start_time), tours(name)")
      .in("refund_status", ["PROCESSED", "FAILED"])
      .order("cancelled_at", { ascending: false })
      .limit(20);
    setProcessed(done || []);
    setLoading(false);
  }

  async function autoRefund(id: string) {
    if (!confirm("Process automatic Yoco refund? The customer will be notified via WhatsApp and email.")) return;
    setProcessing(id);
    try {
      var r = await fetch(SU + "/functions/v1/process-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SK },
        body: JSON.stringify({ booking_id: id }),
      });
      var d = await r.json();
      setResults({ ...results, [id]: d });
      load();
    } catch (e) {
      setResults({ ...results, [id]: { error: String(e) } });
    }
    setProcessing(null);
  }

  async function manualRefund(id: string) {
    if (!confirm("Mark as manually refunded?")) return;
    await supabase.from("bookings").update({ refund_status: "PROCESSED", refund_notes: "Manual refund" }).eq("id", id);
    load();
  }

  async function refundAll() {
    if (!confirm("Process ALL " + refunds.length + " refunds via Yoco? Customers will be notified.")) return;
    for (var r of refunds) {
      setProcessing(r.id);
      try {
        var res = await fetch(SU + "/functions/v1/process-refund", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + SK },
          body: JSON.stringify({ booking_id: r.id }),
        });
        var d = await res.json();
        setResults(prev => ({ ...prev, [r.id]: d }));
      } catch (e) {
        setResults(prev => ({ ...prev, [r.id]: { error: String(e) } }));
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setProcessing(null);
    load();
  }

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>;

  var totalRefund = refunds.reduce((sum, b) => sum + Number(b.refund_amount || 0), 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">💰 Refund Queue</h2>
          <p className="text-sm text-gray-500 mt-1">{refunds.length} pending · R{totalRefund.toLocaleString()}</p>
        </div>
        {refunds.length > 1 && (
          <button onClick={refundAll}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
            ⚡ Refund All ({refunds.length})
          </button>
        )}
      </div>

      {refunds.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">No pending refunds ✓</div>
      ) : (
        <div className="space-y-3">
          {refunds.map((b: any) => {
            var res = results[b.id];
            var isProcessing = processing === b.id;
            var hasCheckout = !!b.yoco_checkout_id;
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">{b.customer_name} <span className="text-gray-400 font-mono text-xs">({b.id.substring(0, 8).toUpperCase()})</span></p>
                    <p className="text-sm text-gray-500">{b.tours?.name} · {b.slots?.start_time ? fmtTime(b.slots.start_time) : "-"} · {b.qty} pax</p>
                    <p className="text-sm text-gray-500">{b.phone} · {b.email}</p>
                    {b.cancellation_reason && <p className="text-xs text-gray-400 mt-1">Reason: {b.cancellation_reason}</p>}
                    {!hasCheckout && <p className="text-xs text-amber-600 mt-1">⚠ No Yoco checkout ID — manual refund only</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-600">R{b.refund_amount}</p>
                      <p className="text-xs text-gray-400">{b.refund_notes}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {hasCheckout && (
                        <button onClick={() => autoRefund(b.id)} disabled={isProcessing}
                          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
                          {isProcessing ? "⏳ Processing..." : "⚡ Auto Refund"}
                        </button>
                      )}
                      <button onClick={() => manualRefund(b.id)}
                        className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 whitespace-nowrap">
                        ✋ Manual
                      </button>
                    </div>
                  </div>
                </div>
                {res && (
                  <div className={"text-sm p-3 rounded-lg mt-3 " + (res.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                    {res.ok ? "✅ Refund processed — customer notified via WhatsApp & email" : "❌ " + (res.error || res.message || "Failed")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Processed refunds */}
      <div className="pt-4">
        <button onClick={() => setShowProcessed(!showProcessed)}
          className="text-sm text-gray-500 hover:text-gray-800 font-medium">
          {showProcessed ? "▼" : "▶"} Processed Refunds ({processed.length})
        </button>
        {showProcessed && (
          <div className="space-y-2 mt-3">
            {processed.map((b: any) => (
              <div key={b.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{b.customer_name} <span className="text-gray-400 font-mono text-xs">({b.id.substring(0, 8).toUpperCase()})</span></p>
                  <p className="text-xs text-gray-400">{b.tours?.name} · {b.slots?.start_time ? fmtTime(b.slots.start_time) : "-"}</p>
                </div>
                <span className={"text-xs font-medium px-2 py-1 rounded-full " + (b.refund_status === "PROCESSED" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                  {b.refund_status === "PROCESSED" ? "✅ Refunded" : "❌ Failed"}
                </span>
                <p className="text-sm font-semibold text-gray-600">R{b.refund_amount}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
