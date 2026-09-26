"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards — without an effect + state flip. */
export function useHasMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** window.location.origin on the client, "" on the server. */
export function useOrigin() {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}
