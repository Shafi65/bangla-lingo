"use client";

import { useSyncStatus, syncNow } from "@/lib/sync/runtime";
import type { SyncStatus } from "@/lib/sync/engine";

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function syncLabel(s: SyncStatus): string {
  switch (s.state) {
    case "syncing":
      return "Syncing…";
    case "synced":
      return s.lastSyncedAt ? `Synced at ${clock(s.lastSyncedAt)}` : "Synced";
    case "offline":
      return "Offline. Saved on this device; syncs when you're back online.";
    case "error":
      return `Couldn't sync. ${s.error ?? ""}`.trim();
    default:
      return "Starting…";
  }
}

const DOT: Record<SyncStatus["state"], string> = {
  idle: "bg-line-strong",
  syncing: "bg-sun",
  synced: "bg-brand",
  offline: "bg-line-strong",
  error: "bg-accent",
};

/** Small sync status with a retry button on errors. */
export function SyncStatusLine({ compact = false }: { compact?: boolean }) {
  const s = useSyncStatus();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="sync-status" data-state={s.state}>
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold">
        <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[s.state]} ${s.state === "syncing" ? "motion-safe:animate-pulse" : ""}`} />
        <span className={s.state === "error" ? "text-accent-dark" : "text-muted"}>{syncLabel(s)}</span>
      </p>
      {!compact && (s.state === "error" || s.state === "synced") && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void syncNow()}>
          {s.state === "error" ? "Retry" : "Sync now"}
        </button>
      )}
    </div>
  );
}
