/**
 * /api/users — create and manage logins for the recruiter portal. Admins only.
 *
 *   GET                     every login, newest first
 *   POST   { email, password, name?, role }    create one, ready to sign in
 *   PATCH  { id, role }                         make someone admin or recruiter
 *   DELETE ?id=…                                remove a login for good
 *
 * This runs on the server because it needs SUPABASE_SERVICE_ROLE_KEY, which can
 * do anything to the project and must never reach a browser. Every request
 * carries the caller's own session token (Authorization: Bearer …); the token
 * is checked with Supabase on each call and the caller must be an admin, so
 * the key's power is only ever used on an admin's behalf.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 * SUPABASE_SERVICE_ROLE_KEY in .env.local and in Vercel's environment
 * variables — Supabase → Settings → API → service_role. No NEXT_PUBLIC_ prefix.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ROLES, roleOf, type PortalUser, type Role } from "@/lib/roles";

const MIN_PASSWORD = 8;

const fail = (status: number, error: string) => Response.json({ error }, { status });

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * The admin client, if the caller is a signed-in admin — otherwise the error
 * response to send back. The role is read fresh from Supabase, not from the
 * token, so a demoted admin loses access at once.
 */
async function requireAdmin(req: Request): Promise<{ db: SupabaseClient; me: User } | Response> {
  const db = adminClient();
  if (!db) {
    return fail(500, "The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local and to Vercel's environment variables, then redeploy.");
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Please sign in again.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return fail(401, "Your session has expired. Please sign in again.");
  if (roleOf(data.user) !== "admin") return fail(403, "Only admins can manage users.");
  return { db, me: data.user };
}

const toPortalUser = (u: User): PortalUser => ({
  id:              u.id,
  email:           u.email ?? "",
  name:            (u.user_metadata?.full_name as string | undefined) ?? null,
  role:            roleOf(u),
  created_at:      u.created_at,
  last_sign_in_at: u.last_sign_in_at ?? null,
});

const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** How many admins there are — the last one may not be demoted or removed. */
async function adminCount(db: SupabaseClient): Promise<number> {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).filter(u => roleOf(u) === "admin").length;
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { data, error } = await auth.db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return fail(500, error.message);
  const users = data.users
    .map(toPortalUser)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return Response.json({ users, me: auth.me.id });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as
    { email?: string; password?: string; name?: string; role?: string } | null;
  const email    = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const name     = body?.name?.trim() || null;
  const role     = body?.role;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "Please enter a valid email address.");
  if (password.length < MIN_PASSWORD) return fail(400, `The password must be at least ${MIN_PASSWORD} characters.`);
  if (!isRole(role)) return fail(400, "Please choose Admin or Recruiter.");

  const { data, error } = await auth.db.auth.admin.createUser({
    email,
    password,
    // Created by an admin, so there is no confirmation email to wait for —
    // they can sign in straight away with the password they were given
    email_confirm: true,
    app_metadata:  { role },
    user_metadata: name ? { full_name: name } : {},
  });
  if (error) {
    return fail(400, /already|registered|exists/i.test(error.message)
      ? "A user with that email already exists."
      : error.message);
  }
  return Response.json({ user: toPortalUser(data.user) }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as { id?: string; role?: string } | null;
  if (!body?.id || !isRole(body.role)) return fail(400, "Missing user or role.");
  if (body.role !== "admin" && body.id === auth.me.id && await adminCount(auth.db) <= 1) {
    return fail(400, "You are the only admin. Make someone else an admin first.");
  }

  const { data, error } = await auth.db.auth.admin.updateUserById(body.id, { app_metadata: { role: body.role } });
  if (error) return fail(400, error.message);
  return Response.json({ user: toPortalUser(data.user) });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail(400, "Missing user.");
  if (id === auth.me.id) return fail(400, "You cannot remove your own login.");

  const { error } = await auth.db.auth.admin.deleteUser(id);
  if (error) return fail(400, error.message);
  return Response.json({ ok: true });
}
