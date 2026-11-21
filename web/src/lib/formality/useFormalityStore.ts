import { useMemo, useSyncExternalStore } from "react";
import { parseStore, readStoreRaw, subscribeStore } from "./storage";
import type { FormalityStore } from "./types";

/** Reactive trainer progress; a fresh store on the server and first render. */
export function useFormalityStore(): { store: FormalityStore; ready: boolean } {
  const raw = useSyncExternalStore(subscribeStore, readStoreRaw, () => undefined);
  return useMemo(() => ({ store: parseStore(raw ?? null), ready: raw !== undefined }), [raw]);
}
