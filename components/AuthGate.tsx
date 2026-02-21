"use client";
import { useState, useEffect } from "react";

var ADMIN_HASH = "cd9b9b4549eba22c11255b7e5f562721061a71c979f8a51ffa03b304d9f2e1bc";

async function sha256(str: string) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  var [authed, setAuthed] = useState(false);
  var [pass, setPass] = useState("");
  var [error, setError] = useState(false);
  var [checking, setChecking] = useState(true);

  useEffect(() => {
    var saved = localStorage.getItem("ck_admin_auth");
    if (saved === "true") setAuthed(true);
    setChecking(false);
  }, []);

  async function login() {
    var hash = await sha256(pass);
    if (hash === ADMIN_HASH) {
      localStorage.setItem("ck_admin_auth", "true");
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
    }
  }

  function logout() {
    localStorage.removeItem("ck_admin_auth");
    setAuthed(false);
    setPass("");
  }

  if (checking) return null;

  if (!authed) return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ck-bg)] px-4">
      <div className="ui-surface-elevated w-full max-w-sm p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--ck-text-strong)] mb-1">🛶 Cape Kayak Admin</h1>
        <p className="mb-6 text-sm ui-text-muted">Enter your password to continue</p>
        <input type="password" value={pass}
          onChange={e => { setPass(e.target.value); setError(false); }}
          onKeyDown={e => { if (e.key === "Enter") login(); }}
          placeholder="Password"
          className={"ui-control mb-3 w-full px-4 py-3 text-sm outline-none " + (error ? "border-[var(--ck-danger)] bg-[var(--ck-danger-soft)]" : "")} />
        {error && <p className="mb-3 text-xs text-[var(--ck-danger)]">Incorrect password</p>}
        <button onClick={login} className="w-full rounded-xl bg-[var(--ck-text-strong)] py-3 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-md active:translate-y-0">
          Sign In
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="fixed top-3 right-3 z-50">
        <button onClick={logout} className="ui-control px-3 py-1.5 text-xs font-medium text-[var(--ck-text-muted)] hover:text-[var(--ck-text-strong)]">
          Sign Out
        </button>
      </div>
      {children}
    </div>
  );
}
