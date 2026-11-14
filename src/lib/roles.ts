/**
 * roles.ts — who may do what in the recruiter portal.
 *
 *   admin       everything, plus the Users page (create and manage logins)
 *   recruiter   everything except the Users page
 *
 * The role lives in the login's app_metadata, which only the server (with the
 * service role key) can write — a user cannot promote themselves. A login with
 * no role yet counts as a recruiter.
 *
 * The first admin is made by hand with one line of SQL; see
 * supabase/migrations/20261114000200_admin_role.sql.
 */

import type { User } from "@supabase/supabase-js";

export const ROLES = ["admin", "recruiter"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin:     "Admin",
  recruiter: "Recruiter",
};

export function roleOf(user: Pick<User, "app_metadata"> | null | undefined): Role {
  return user?.app_metadata?.role === "admin" ? "admin" : "recruiter";
}

/** The shape /api/users returns for each login. */
export interface PortalUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  created_at: string;
  last_sign_in_at: string | null;
}
