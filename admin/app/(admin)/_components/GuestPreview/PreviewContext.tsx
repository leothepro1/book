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
import merge from "deepmerge";

interface PreviewContextValue {
  config: TenantConfig | null;
  isLoading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
  isConnected: boolean;
  updateConfig: (changes: Partial<TenantConfig>) => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

const SSE_RECONNECT_BASE_MS = 2000;
const SSE_RECONNECT_MAX_MS = 30000;
const REFRESH_DEBOUNCE_MS = 300;

const overwriteArrays: merge.Options["arrayMerge"] = (_target, source) => source;

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

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDraft = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      const res = await fetch("/api/tenant/draft-config", { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
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

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchDraft, REFRESH_DEBOUNCE_MS);
  }, [fetchDraft]);

  // Optimistic update — mergar changes direkt i lokal state
  const updateConfig = useCallback((changes: Partial<TenantConfig>) => {
    setConfig(prev => {
      if (!prev) return prev;
      return merge(prev as any, changes as any, { arrayMerge: overwriteArrays }) as TenantConfig;
    });
  }, []);

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
        attempt = 0;
        setIsConnected(true);
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource?.close();
        if (disposed) return;
        const delay = Math.min(SSE_RECONNECT_BASE_MS * Math.pow(2, attempt), SSE_RECONNECT_MAX_MS);
        attempt++;
        reconnectTimeout = setTimeout(connect, delay);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as DraftUpdateEvent | { type: string };
          if (data.type === "draft_updated") refresh();
        } catch { /* malformed — ignore */ }
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
    <PreviewContext.Provider value={{ config, isLoading, lastUpdated, refresh, isConnected, updateConfig }}>
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
}
