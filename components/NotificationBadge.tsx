
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
        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ml-auto">
            {count > 99 ? "99+" : count}
        </span>
    );
}
