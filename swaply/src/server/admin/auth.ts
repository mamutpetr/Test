import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { AdminRole } from "@prisma/client";

export const SESSION_COOKIE = "swaply_admin";
const SESSION_HOURS = 8;
// Dummy hash so unknown emails cost the same bcrypt time as wrong passwords.
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12));

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export interface AdminContext {
  userId: string;
  email: string;
  role: AdminRole;
}

async function clientFingerprint() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return crypto.createHash("sha256").update(`admin:${ip}`).digest("base64url").slice(0, 22);
}

export async function login(emailRaw: string, password: string): Promise<{ ok: true } | { ok: false; reason: "invalid" | "rate_limited" }> {
  const email = emailRaw.trim().toLowerCase();
  const fp = await clientFingerprint();
  const [byIp, byEmail] = await Promise.all([rateLimit(`admin-login-ip:${fp}`, 10, 900), rateLimit(`admin-login-email:${email}`, 5, 900)]);
  if (!byIp.ok || !byEmail.ok) return { ok: false, reason: "rate_limited" };

  const user = await prisma.adminUser.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  if (!user || !valid || user.disabled) {
    await prisma.auditLog.create({ data: { actor: email || "unknown", action: "admin.login_failed", metadata: {} } });
    return { ok: false, reason: "invalid" };
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.adminSession.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } });
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { actor: user.email, action: "admin.login", metadata: {} } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true };
}

export async function getAdmin(): Promise<AdminContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const s = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || s.user.disabled) return null;
  return { userId: s.user.id, email: s.user.email, role: s.user.role };
}

export async function requireAdmin(roles: AdminRole[] = ["OWNER", "ADMIN", "ANALYST"]): Promise<AdminContext> {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  if (!roles.includes(a.role)) redirect("/admin?denied=1");
  return a;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function audit(actor: string, action: string, target?: string, metadata: Record<string, unknown> = {}) {
  await prisma.auditLog.create({ data: { actor, action, target, metadata: metadata as object } });
}
