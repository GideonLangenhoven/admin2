
"use client";
import { useEffect, useState } from "react";
import { supabase } from "../app/lib/supabase";

export default function NotificationBadge() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        fetchCount();

        const channel = supabase
            .channel("inbox-badge")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "conversations", filter: "status=eq.HUMAN" },
                () => fetchCount()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function fetchCount() {
        const { count } = await supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("status", "HUMAN");

        setCount(count || 0);
    }

    if (count === 0) return null;

    return (
        <span className="ml-auto min-w-[20px] rounded-full border border-white/35 bg-[var(--ck-danger)] px-1.5 py-0.5 text-center text-[10px] font-bold text-white shadow-sm">
            {count > 99 ? "99+" : count}
        </span>
    );
}
