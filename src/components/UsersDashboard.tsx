"use client";

/**
 * UsersDashboard.tsx — /dashboard/users (admins only)
 *
 * Create logins for the recruiter portal and manage the ones that exist:
 *
 *   Add user      email, a starting password, an optional name, and a role.
 *                 The login works at once — no confirmation email — so the
 *                 admin hands the password over in person or by message.
 *   Role          switch anyone between Admin and Recruiter
 *   Remove        delete a login for good (not your own)
 *
 * Everything goes through /api/users, which holds the service role key and
 * checks the caller is an admin on every request; this page never sees the key.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ROLES, ROLE_LABELS, type PortalUser, type Role } from "@/lib/roles";

const inp = "mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white";
const lbl = "block text-xs font-medium text-gray-600";

/** Call /api/users as the signed-in user; throws the server's message on failure. */
async function api<T>(method: string, body?: unknown, query = ""): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/users${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

/** A readable starting password the admin can pass on. */
function suggestPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = new Uint32Array(12);
  crypto.getRandomValues(pick);
  return Array.from(pick, n => chars[n % chars.length]).join("");
}

function RolePill({ role }: { role: Role }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
      role === "admin" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
    }`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

/* ── Add user ────────────────────────────────────────────────────────────── */
function AddUserForm({ onCreated, onCancel }: { onCreated: (u: PortalUser) => void; onCancel: () => void }) {
  const [email, setEmail]       = useState("");
  const [name, setName]         = useState("");
  const [password, setPassword] = useState(suggestPassword);
  const [role, setRole]         = useState<Role>("recruiter");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { user } = await api<{ user: PortalUser }>("POST", { email, name, password, role });
      onCreated(user);
    } catch (err) {
      setError(errText(err));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the fields are still on screen */ }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
      <div className="px-5 pt-5 pb-3 border-b border-gray-100">
        <h3 className="font-bold text-gray-900">Add a user</h3>
        <p className="text-xs text-gray-500 mt-0.5">They can sign in straight away with this email and password.</p>
      </div>

      <div className="p-5 space-y-3">
        <div>
          <label className={lbl}>Email *</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required autoFocus className={inp} />
        </div>
        <div>
          <label className={lbl}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" className={inp} />
        </div>
        <div>
          <label className={lbl}>Starting password * <span className="font-normal text-gray-400">(at least 8 characters)</span></label>
          <div className="mt-1 flex gap-2">
            <input value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              className="flex-1 min-w-0 rounded-md border border-gray-300 p-2 text-sm font-mono focus:border-blue-500 focus:outline-none text-gray-900 bg-white" />
            <button type="button" onClick={() => setPassword(suggestPassword())}
              className="px-3 rounded-md border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50">
              New
            </button>
          </div>
        </div>
        <div>
          <label className={lbl}>Role *</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {ROLES.map(r => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  role === r ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-300 hover:bg-gray-50"
                }`}>
                <p className="text-sm font-semibold text-gray-900">{ROLE_LABELS[r]}</p>
                <p className="text-[11px] text-gray-500 leading-snug">
                  {r === "admin" ? "Everything, plus managing users" : "Everything except managing users"}
                </p>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
        <button type="button" onClick={copy} disabled={!email}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40">
          {copied ? "Copied ✓" : "Copy login details"}
        </button>
        <div className="flex-1" />
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300">
          {saving ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function UsersDashboard() {
  const [users, setUsers]     = useState<PortalUser[]>([]);
  const [me, setMe]           = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [adding, setAdding]   = useState(false);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [notice, setNotice]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ users: PortalUser[]; me: string }>("GET");
      setUsers(res.users);
      setMe(res.me);
      setError(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const changeRole = async (u: PortalUser, role: Role) => {
    if (role === u.role) return;
    setBusyId(u.id);
    try {
      const { user } = await api<{ user: PortalUser }>("PATCH", { id: u.id, role });
      setUsers(list => list.map(x => (x.id === user.id ? user : x)));
      setNotice(`${user.email} is now ${role === "admin" ? "an Admin" : "a Recruiter"}. They will see the change the next time they open the dashboard.`);
    } catch (e) {
      alert(errText(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (u: PortalUser) => {
    if (!confirm(`Remove ${u.email}?\n\nThey will no longer be able to sign in. This cannot be undone.`)) return;
    setBusyId(u.id);
    try {
      await api("DELETE", undefined, `?id=${encodeURIComponent(u.id)}`);
      setUsers(list => list.filter(x => x.id !== u.id));
    } catch (e) {
      alert(errText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading users…</div>;

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6 max-w-2xl">
        <p className="font-semibold text-red-700 text-sm">Could not load users</p>
        <p className="text-sm text-gray-600 mt-2">{error}</p>
      </div>
    );
  }

  const admins = users.filter(u => u.role === "admin").length;

  return (
    <div className="max-w-4xl">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className="text-sm text-gray-500">
          {users.length} user{users.length === 1 ? "" : "s"} · {admins} admin{admins === 1 ? "" : "s"}
        </span>
        <button onClick={() => setAdding(true)}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          + Add User
        </button>
      </div>

      {notice && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800 flex items-start gap-3">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-blue-400 hover:text-blue-700">✕</button>
        </div>
      )}

      {/* ── List ── */}
      <div className="bg-white border border-slate-300 rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
        {users.map(u => {
          const self = u.id === me;
          const busy = busyId === u.id;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center uppercase flex-shrink-0">
                {(u.name || u.email).slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">
                  {u.name || u.email}
                  {self && <span className="ml-2 text-[11px] font-medium text-gray-400">(you)</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {u.name ? `${u.email} · ` : ""}Last sign-in: {fmt(u.last_sign_in_at)}
                </p>
              </div>
              <RolePill role={u.role} />
              <select
                value={u.role}
                disabled={busy}
                onChange={e => changeRole(u, e.target.value as Role)}
                title="Change role"
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
              >
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button
                onClick={() => remove(u)}
                disabled={busy || self}
                title={self ? "You cannot remove your own login" : "Remove this user"}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {busy ? "…" : "Remove"}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Add user modal ── */}
      {adding && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setAdding(false)}>
          <div className="w-full max-w-md my-12" onClick={e => e.stopPropagation()}>
            <AddUserForm
              onCancel={() => setAdding(false)}
              onCreated={u => {
                setUsers(list => [u, ...list]);
                setAdding(false);
                setNotice(`${u.email} was created as ${u.role === "admin" ? "an Admin" : "a Recruiter"} and can sign in now.`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
