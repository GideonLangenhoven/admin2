"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function Inbox() {
  const [convos, setConvos] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => { loadConvos(); }, []);

  useEffect(() => {
    if (!selected) return;

    loadMessages(selected.phone);

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to ALL new chat_messages, then filter client-side
    const channel = supabase
      .channel("inbox-chat-" + Date.now())
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, (payload: any) => {
        if (payload.new.phone === selected.phone) {
          setMessages((prev) => {
            // Deduplicate by id
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      })
      .subscribe((status: string) => {
        console.log("Realtime status:", status);
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConvos() {
    const { data } = await supabase.from("conversations")
      .select("id, phone, customer_name, email, status, current_state, updated_at")
      .eq("status", "HUMAN")
      .order("updated_at", { ascending: false });
    setConvos(data || []);
    setLoading(false);
  }

  async function loadMessages(phone: string) {
    const { data } = await supabase.from("chat_messages")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages(data || []);
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);

    try {
      const res = await supabase.functions.invoke("admin-reply", {
        body: { phone: selected.phone, message: reply },
      });
      if (res.error) {
        alert("Error sending: " + res.error.message);
      } else {
        setReply("");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setSending(false);
  }

  async function returnToBot(id: string) {
    await supabase.from("conversations").update({ status: "BOT", current_state: "IDLE" }).eq("id", id);
    setSelected(null);
    setMessages([]);
    loadConvos();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "Africa/Johannesburg" });
  }

  // Polling fallback - check for new messages every 3 seconds
  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(() => {
      loadMessages(selected.phone);
    }, 3000);
    return () => clearInterval(interval);
  }, [selected]);

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-2xl font-bold mb-4">Inbox</h2>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="flex-1 flex gap-4 min-h-0">
          <div className="w-72 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-3 border-b border-gray-200 bg-gray-50">
              <p className="text-sm font-medium text-gray-600">{convos.length} waiting</p>
            </div>
            <div className="flex-1 overflow-auto">
              {convos.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 text-center">No conversations waiting ✓</p>
              ) : convos.map((c: any) => (
                <div key={c.id} onClick={() => setSelected(c)}
                  className={`p-3 border-b border-gray-100 cursor-pointer transition-colors ${selected?.id === c.id ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"}`}>
                  <p className="font-semibold text-sm">{c.customer_name || "Unknown"}</p>
                  <p className="text-xs text-gray-500">{c.phone}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(c.updated_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}</p>
                </div>
              ))}
            </div>
          </div>

          {selected ? (
            <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{selected.customer_name || selected.phone}</p>
                  <p className="text-xs text-gray-500">{selected.phone} · {selected.email || "no email"}</p>
                </div>
                <button onClick={() => returnToBot(selected.id)}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700">
                  Return to Bot
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm mt-8">No messages yet. The customer&apos;s next message will appear here.</p>
                ) : (
                  <>
                    {messages.map((m: any, i: number) => {
                      const isAdmin = m.direction === "OUT";
                      const showDate = i === 0 || fmtDate(m.created_at) !== fmtDate(messages[i - 1].created_at);
                      return (
                        <div key={m.id}>
                          {showDate && (
                            <div className="text-center my-2">
                              <span className="bg-gray-200 text-gray-500 text-xs px-3 py-1 rounded-full">{fmtDate(m.created_at)}</span>
                            </div>
                          )}
                          <div className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                              isAdmin
                                ? "bg-blue-600 text-white rounded-br-md"
                                : "bg-white border border-gray-200 text-gray-900 rounded-bl-md"
                            }`}>
                              <p className="whitespace-pre-wrap">{m.body}</p>
                              <p className={`text-xs mt-1 ${isAdmin ? "text-blue-200" : "text-gray-400"}`}>
                                {fmtTime(m.created_at)} · {m.sender || (isAdmin ? "Admin" : "Customer")}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              <div className="p-3 border-t border-gray-200 bg-white">
                <div className="flex gap-2">
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={handleKeyDown}
                    rows={2} placeholder="Type your reply... (Enter to send)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <button onClick={sendReply} disabled={sending || !reply.trim()}
                    className="bg-green-600 text-white px-4 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 self-end">
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-gray-200">
              <p className="text-gray-400">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
