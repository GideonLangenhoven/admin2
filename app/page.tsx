"use client";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg",
  });
}

export default function Dashboard() {
  const [manifest, setManifest] = useState<any[]>([]);
  const [stats, setStats] = useState({ bookings: 0, pax: 0, revenue: 0 });
  const [refundCount, setRefundCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: bks } = await supabase
      .from("bookings")
      .select("id, customer_name, phone, email, qty, total_amount, status, slots(start_time), tours(name)")
      .in("status", ["PAID", "CONFIRMED"])
      .gte("slots.start_time", today.toISOString())
      .lt("slots.start_time", tomorrow.toISOString())
      .order("created_at", { ascending: true });

    const filtered = (bks || []).filter((b: any) => b.slots?.start_time);
    setManifest(filtered);
    setStats({
      bookings: filtered.length,
      pax: filtered.reduce((s: number, b: any) => s + b.qty, 0),
      revenue: filtered.reduce((s: number, b: any) => s + Number(b.total_amount), 0),
    });

    const { count: rc } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("refund_status", "REQUESTED");
    setRefundCount(rc || 0);

    const { count: ic } = await supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "HUMAN");
    setInboxCount(ic || 0);

    setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Today&apos;s Overview</h2>
        <p className="text-gray-500 text-sm">{new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Bookings</p>
          <p className="text-3xl font-bold text-blue-600">{stats.bookings}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Total Pax</p>
          <p className="text-3xl font-bold text-green-600">{stats.pax}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-3xl font-bold text-emerald-600">R{stats.revenue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Alerts</p>
          <div className="flex gap-2 mt-1">
            {refundCount > 0 && <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">{refundCount} refunds</span>}
            {inboxCount > 0 && <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-medium">{inboxCount} inbox</span>}
            {refundCount === 0 && inboxCount === 0 && <span className="text-green-600 text-sm">All clear ✓</span>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold">Today&apos;s Manifest</h3>
        </div>
        {manifest.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">No bookings today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Ref</th>
                  <th className="text-left p-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left p-3 font-medium text-gray-600">Phone</th>
                  <th className="text-left p-3 font-medium text-gray-600">Tour</th>
                  <th className="text-left p-3 font-medium text-gray-600">Time</th>
                  <th className="text-left p-3 font-medium text-gray-600">Pax</th>
                  <th className="text-left p-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {manifest.map((b: any) => (
                  <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{b.id.substring(0, 8).toUpperCase()}</td>
                    <td className="p-3">{b.customer_name}</td>
                    <td className="p-3 text-gray-500">{b.phone}</td>
                    <td className="p-3">{b.tours?.name}</td>
                    <td className="p-3">{b.slots?.start_time ? fmtTime(b.slots.start_time) : "-"}</td>
                    <td className="p-3">{b.qty}</td>
                    <td className="p-3 font-medium">R{b.total_amount}</td>
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
