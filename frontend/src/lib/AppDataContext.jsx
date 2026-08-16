import { createContext, useContext, useRef, useState, useCallback } from "react";

// Global cache for library data (folder tree, items, artists, types,
// attributes, storages) so DatabaseManager and Playlist don't each refetch
// on every tab switch. Playlist entries and single-item detail (ItemEditor)
// are intentionally never routed through here — those must always be fresh.

const DEFAULT_MAX_AGE_MS = 60_000;

export const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const cache = useRef({}); // { key: { data, loadedAt } }
  const [version, setVersion] = useState(0);

  const getCached = useCallback(async (key, fetcher, maxAgeMs = DEFAULT_MAX_AGE_MS) => {
    const hit = cache.current[key];
    if (hit && Date.now() - hit.loadedAt < maxAgeMs) return hit.data;
    const data = await fetcher();
    cache.current[key] = { data, loadedAt: Date.now() };
    return data;
  }, []);

  const invalidate = useCallback((key) => {
    if (key && key.endsWith(":*")) {
      const prefix = key.slice(0, -1); // keep the trailing ":"
      for (const k of Object.keys(cache.current)) {
        if (k.startsWith(prefix)) delete cache.current[k];
      }
    } else if (key) {
      delete cache.current[key];
    } else {
      cache.current = {};
    }
    setVersion((v) => v + 1); // trigger re-render in consumers
  }, []);

  return (
    <AppDataContext.Provider value={{ getCached, invalidate, version }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
