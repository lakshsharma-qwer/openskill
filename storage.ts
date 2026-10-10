"use client";

import { currentAccount } from "./auth";
import type { Discovery, Plan } from "./types";

/* Everything is stored per account, in this browser. */

const LEGACY_PLANS = "your-guide:plans";
const LEGACY_DISCOVERY = "your-guide:discovery";

function scope(kind: "plans" | "discovery") {
  const id = currentAccount()?.id ?? "guest";
  return `openskill:${kind}:${id}`;
}

/** Plans made before accounts existed move into the first account that signs in on this device. */
function migrateLegacy() {
  try {
    const legacy = localStorage.getItem(LEGACY_PLANS);
    if (legacy && currentAccount() && !localStorage.getItem(scope("plans"))) {
      localStorage.setItem(scope("plans"), legacy);
      const d = localStorage.getItem(LEGACY_DISCOVERY);
      if (d) localStorage.setItem(scope("discovery"), d);
      localStorage.removeItem(LEGACY_PLANS);
      localStorage.removeItem(LEGACY_DISCOVERY);
    }
  } catch {}
}

function readAll(): Plan[] {
  migrateLegacy();
  try {
    const raw = localStorage.getItem(scope("plans"));
    return raw ? (JSON.parse(raw) as Plan[]) : [];
  } catch {
    return [];
  }
}

function writeAll(plans: Plan[]) {
  try {
    localStorage.setItem(scope("plans"), JSON.stringify(plans));
  } catch {
    // Storage full or blocked — the in-memory state still works for this session.
  }
}

export function listPlans() {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPlan(id: string) {
  return readAll().find((p) => p.id === id) ?? null;
}

export function savePlan(plan: Plan) {
  const plans = readAll().filter((p) => p.id !== plan.id);
  plans.push({ ...plan, updatedAt: new Date().toISOString() });
  writeAll(plans);
}

export function deletePlan(id: string) {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function getDiscovery(): Discovery | null {
  migrateLegacy();
  try {
    const raw = localStorage.getItem(scope("discovery"));
    return raw ? (JSON.parse(raw) as Discovery) : null;
  } catch {
    return null;
  }
}

export function saveDiscovery(d: Discovery) {
  try {
    localStorage.setItem(scope("discovery"), JSON.stringify(d));
  } catch {}
}
