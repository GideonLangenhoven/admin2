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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-sm text-center">
        <h1 className="text-xl font-bold mb-1">🛶 Cape Kayak Admin</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your password to continue</p>
        <input type="password" value={pass}
          onChange={e => { setPass(e.target.value); setError(false); }}
          onKeyDown={e => { if (e.key === "Enter") login(); }}
          placeholder="Password"
          className={"w-full border rounded-lg px-4 py-3 text-sm mb-3 outline-none " + (error ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-gray-400")} />
        {error && <p className="text-xs text-red-500 mb-3">Incorrect password</p>}
        <button onClick={login} className="w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-semibold hover:bg-gray-800">
          Sign In
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="fixed top-3 right-3 z-50">
        <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          Sign Out
        </button>
      </div>
      {children}
    </div>
  );
}
