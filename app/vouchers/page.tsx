"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  REDEEMED: "bg-blue-100 text-blue-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  EXPIRED: "bg-gray-100 text-gray-600",
};

interface Voucher {
  id: string;
  code: string | null;
  status: string | null;
  type: string | null;
  tour_name: string | null;
  value: number | null;
  recipient_name: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  expires_at: string | null;
  created_at: string | null;
}

interface VoucherDayGroup {
  dayKey: string;
  dayLabel: string;
  items: Voucher[];
}

function dayKey(raw: string | null) {
  if (!raw) return "unknown";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(d);
}

function dayLabel(raw: string | null) {
  if (!raw) return "Unknown Date";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "Unknown Date";
  return d.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
}

function text(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v).toLowerCase();
}

export default function Vouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");

  async function loadVouchers() {
    const { data } = await supabase
      .from("vouchers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setVouchers((data || []) as Voucher[]);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      loadVouchers();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (selectedDate && dayKey(v.created_at) !== selectedDate) return false;
      if (!q) return true;
      const haystack = [
        v.code,
        v.status,
        v.type,
        v.tour_name,
        v.value,
        v.recipient_name,
        v.buyer_name,
        v.buyer_email,
        v.expires_at,
        v.created_at,
      ]
        .map(text)
        .join(" ");
      return haystack.includes(q);
    });
  }, [vouchers, selectedDate, search]);

  const groups = useMemo<VoucherDayGroup[]>(() => {
    const map = new Map<string, Voucher[]>();
    for (const v of filtered) {
      const key = dayKey(v.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    const out: VoucherDayGroup[] = [];
    for (const [k, items] of map) {
      out.push({
        dayKey: k,
        dayLabel: dayLabel(items[0]?.created_at || null),
        items,
      });
    }
    out.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
    return out;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Vouchers</h2>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <label className="text-sm text-gray-600">
          Filter by created date
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="ml-2 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        {selectedDate && (
          <button
            type="button"
            onClick={() => setSelectedDate("")}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            Clear Date
          </button>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, status, type, tour, value, recipient, buyer, email, dates..."
          className="min-w-[320px] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-gray-500">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">No vouchers found for this filter.</div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.dayKey}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-800">{g.dayLabel}</h3>
                <span className="text-xs text-gray-500">{g.items.length} vouchers</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-600">Code</th>
                      <th className="p-3 text-left font-medium text-gray-600">Status</th>
                      <th className="p-3 text-left font-medium text-gray-600">Type</th>
                      <th className="p-3 text-left font-medium text-gray-600">Tour</th>
                      <th className="p-3 text-left font-medium text-gray-600">Value</th>
                      <th className="p-3 text-left font-medium text-gray-600">Recipient</th>
                      <th className="p-3 text-left font-medium text-gray-600">Buyer</th>
                      <th className="p-3 text-left font-medium text-gray-600">Expires</th>
                      <th className="p-3 text-left font-medium text-gray-600">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((v) => (
                      <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-mono font-bold text-blue-600">{v.code || "-"}</td>
                        <td className="p-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[v.status || ""] || "bg-gray-100 text-gray-700"}`}>
                            {v.status || "-"}
                          </span>
                        </td>
                        <td className="p-3 text-xs">{v.type || "-"}</td>
                        <td className="p-3">{v.tour_name || "-"}</td>
                        <td className="p-3">{v.value !== null && v.value !== undefined ? "R" + Number(v.value).toFixed(2) : "-"}</td>
                        <td className="p-3">{v.recipient_name || "-"}</td>
                        <td className="p-3 text-xs">
                          {v.buyer_name || "-"}
                          <br />
                          {v.buyer_email || ""}
                        </td>
                        <td className="p-3 text-xs">{v.expires_at ? new Date(v.expires_at).toLocaleDateString("en-ZA") : "-"}</td>
                        <td className="p-3 text-xs">{v.created_at ? new Date(v.created_at).toLocaleDateString("en-ZA") : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
