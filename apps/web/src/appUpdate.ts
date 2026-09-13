import { useSyncExternalStore } from "react";
let available = false;
const listeners = new Set<() => void>();
export function isAppUpdateError(error: unknown): boolean {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [\w-]+ failed|unable to preload css/i.test(message);
}
export function notifyAppUpdate(): void {
  available = true;
  for (const listener of listeners) listener();
}
export function useAppUpdate(error?: unknown): boolean {
  const signaled = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => available,
    () => false,
  );
  return signaled || isAppUpdateError(error);
}
