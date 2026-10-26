"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Track which clickable item is currently running an async action so the UI
 * can overlay a spinner on the matching thumbnail. Multiple rapid clicks are
 * handled correctly: only the latest clicked key is reflected in `loadingKey`,
 * so earlier in-flight actions naturally clear themselves.
 */
export function useLoadingClick() {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const latestRef = useRef<string | null>(null);

  const run = useCallback(async (key: string, fn: () => Promise<unknown> | unknown) => {
    latestRef.current = key;
    setLoadingKey(key);
    try {
      await fn();
    } finally {
      if (latestRef.current === key) {
        latestRef.current = null;
        setLoadingKey(null);
      }
    }
  }, []);

  return { loadingKey, run };
}
