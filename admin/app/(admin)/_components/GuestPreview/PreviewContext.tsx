"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { DraftUpdateEvent } from "./types";

interface PreviewContextValue {
  config: TenantConfig | null;
  isLoading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
  isConnected: boolean;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

const SSE_RECONNECT_BASE_MS = 2000;
const SSE_RECONNECT_MAX_MS = 30000;
const REFRESH_DEBOUNCE_MS = 300;

interface PreviewProviderProps {
  children: ReactNode;
  initialConfig: TenantConfig | null;
  enableRealtime?: boolean;
}

export function PreviewProvider({
  children,
  initialConfig,
  enableRealtime = true,
}: PreviewProviderProps) {
  const [config, setConfig] = useState<TenantConfig | null>(initialConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Abort controller for in-flight fetches
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch draft config with abort + dedup
  const fetchDraft = useCallback(async () => {
    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const res = await fetch("/api/tenant/draft-config", {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      // Only update if this request wasn't aborted
      if (!controller.signal.aborted) {
        setConfig(data.config);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[Preview] Fetch failed:", err);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  // Debounced refresh — collapses rapid SSE events into single fetch
  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchDraft, REFRESH_DEBOUNCE_MS);
  }, [fetchDraft]);

  // SSE with exponential backoff
  useEffect(() => {
    if (!enableRealtime) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      eventSource = new EventSource("/api/tenant/preview-stream");

      eventSource.onopen = () => {
        attempt = 0; // reset backoff on success
        setIsConnected(true);
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource?.close();
        if (disposed) return;

        // Exponential backoff: 2s, 4s, 8s, ... capped at 30s
        const delay = Math.min(
          SSE_RECONNECT_BASE_MS * Math.pow(2, attempt),
          SSE_RECONNECT_MAX_MS
        );
        attempt++;
        reconnectTimeout = setTimeout(connect, delay);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as DraftUpdateEvent | { type: string };
          if (data.type === "draft_updated") {
            refresh(); // debounced
          }
          // heartbeat + connected → no-op (keep connection alive)
        } catch {
          // Malformed event — ignore
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      eventSource?.close();
      clearTimeout(reconnectTimeout);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [enableRealtime, refresh]);

  return (
    <PreviewContext.Provider
      value={{ config, isLoading, lastUpdated, refresh, isConnected }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
}
