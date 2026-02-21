import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import NotificationBadge from "../components/NotificationBadge";
import AuthGate from "../components/AuthGate";

export const metadata: Metadata = {
  title: "Cape Kayak Admin",
  description: "Admin Dashboard",
};

const nav = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/bookings", label: "Bookings", icon: "📋" },
  { href: "/slots", label: "Slots", icon: "📅" },
  { href: "/refunds", label: "Refunds", icon: "💰" },
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/vouchers", label: "Vouchers", icon: "🎟" },
  { href: "/invoices", label: "Invoices", icon: "🧾" },
  { href: "/weather", label: "Weather", icon: "⛈" },
  { href: "/photos", label: "Photos", icon: "📷" },
  { href: "/broadcasts", label: "Broadcasts", icon: "📢" },
  { href: "/pricing", label: "Peak Pricing", icon: "💲" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthGate>
        <div className="flex h-screen">
          <aside className="hidden md:flex w-56 bg-gray-900 flex-col shrink-0">
            <div className="p-4 border-b border-gray-700">
              <h1 className="text-lg font-bold text-white">🛶 Cape Kayak</h1>
              <p className="text-xs text-gray-400">Admin Dashboard</p>
            </div>
            <nav className="flex-1 p-2 space-y-1 overflow-auto">
              {nav.map((n) => (
                <Link key={n.href} href={n.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors relative">
                  <span>{n.icon}</span>
                  <span className="flex-1">{n.label}</span>
                  {n.href === "/inbox" && <NotificationBadge />}
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-gray-700 text-xs text-gray-500">Since 1994</div>
          </aside>
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="md:hidden bg-gray-900 p-3 flex items-center justify-between">
              <h1 className="text-lg font-bold text-white">🛶 Cape Kayak</h1>
            </header>
            <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
            <nav className="md:hidden bg-gray-900 border-t border-gray-700 flex justify-around py-2">
              {nav.slice(0, 5).map((n) => (
                <Link key={n.href} href={n.href} className="flex flex-col items-center text-xs text-gray-400 relative">
                  <div className="relative">
                    <span className="text-lg">{n.icon}</span>
                    {n.href === "/inbox" && (
                      <div className="absolute -top-1 -right-2 transform scale-75">
                        <NotificationBadge />
                      </div>
                    )}
                  </div>
                  <span>{n.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </AuthGate>
      </body>
    </html>
  );
}
