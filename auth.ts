"use client";

/*
 * Device-local accounts.
 * There's no backend yet, so an account lives in this browser only: it gates the app and personalises it,
 * but it is not a cloud login. Swap these functions for a real auth provider (Supabase, Firebase, Clerk…)
 * when the app gets a server — the rest of the UI only uses this module.
 */

export interface Account {
  id: string;
  name: string;
  contact: string; // mobile number or email, normalised
  passwordHash: string;
  salt: string;
  createdAt: string;
  onboarded: boolean;
}

const ACCOUNTS = "openskill:accounts";
const SESSION = "openskill:session";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function normalizeContact(raw: string) {
  const v = raw.trim().toLowerCase();
  if (v.includes("@")) return v;
  const digits = v.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

export function contactError(raw: string) {
  const v = normalizeContact(raw);
  if (raw.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address.";
  return /^[6-9]\d{9}$/.test(v) ? "" : "Enter a valid 10-digit mobile number.";
}

async function hash(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function currentAccount(): Account | null {
  const id = read<string | null>(SESSION, null);
  if (!id) return null;
  return read<Account[]>(ACCOUNTS, []).find((a) => a.id === id) ?? null;
}

export async function signUp(name: string, contact: string, password: string): Promise<Account> {
  const accounts = read<Account[]>(ACCOUNTS, []);
  const c = normalizeContact(contact);
  if (accounts.some((a) => a.contact === c)) throw new Error("An account with this number or email already exists. Log in instead.");
  const salt = crypto.randomUUID();
  const account: Account = {
    id: crypto.randomUUID(),
    name: name.trim(),
    contact: c,
    salt,
    passwordHash: await hash(password, salt),
    createdAt: new Date().toISOString(),
    onboarded: false,
  };
  write(ACCOUNTS, [...accounts, account]);
  write(SESSION, account.id);
  return account;
}

export async function logIn(contact: string, password: string): Promise<Account> {
  const c = normalizeContact(contact);
  const account = read<Account[]>(ACCOUNTS, []).find((a) => a.contact === c);
  if (!account || (await hash(password, account.salt)) !== account.passwordHash) {
    throw new Error("That number/email and password don't match.");
  }
  write(SESSION, account.id);
  return account;
}

export function logOut() {
  try {
    localStorage.removeItem(SESSION);
  } catch {}
}

export function markOnboarded() {
  const me = currentAccount();
  if (!me) return;
  write(ACCOUNTS, read<Account[]>(ACCOUNTS, []).map((a) => (a.id === me.id ? { ...a, onboarded: true } : a)));
}

/** Only allow same-site paths as post-login destinations (never external or javascript: URLs). */
export function safeNext(next: string | null, fallback = "/home") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes(":") ? next : fallback;
}
