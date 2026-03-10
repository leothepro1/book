"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { MediaAssetDTO, MediaPage } from "@/app/_lib/media/types";

// ─── Sort Options ───────────────────────────────────────────

export type SortOption = {
  label: string;
  orderBy: "createdAt" | "filename" | "bytes";
  orderDir: "asc" | "desc";
};

export const SORT_OPTIONS: SortOption[] = [
  { label: "Nyast först",      orderBy: "createdAt", orderDir: "desc" },
  { label: "Äldst först",      orderBy: "createdAt", orderDir: "asc" },
  { label: "Filnamn A–Ö",      orderBy: "filename",  orderDir: "asc" },
  { label: "Filnamn Ö–A",      orderBy: "filename",  orderDir: "desc" },
  { label: "Störst först",     orderBy: "bytes",     orderDir: "desc" },
  { label: "Minst först",      orderBy: "bytes",     orderDir: "asc" },
];

// ─── State ──────────────────────────────────────────────────

export type MediaLibraryState = {
  items: MediaAssetDTO[];
  totalCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  search: string;
  sortIndex: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type MediaLibraryActions = {
  setSearch: (q: string) => void;
  setSortIndex: (i: number) => void;
  loadMore: () => void;
  refresh: () => void;
};

// ─── Hook ───────────────────────────────────────────────────

export function useMediaLibrary(folder?: string) {
  const [items, setItems] = useState<MediaAssetDTO[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearchRaw] = useState("");
  const [sortIndex, setSortIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setSearch = useCallback((q: string) => {
    setSearchRaw(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(q), 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Fetch version counter (incremented to trigger refresh)
  const [fetchVersion, setFetchVersion] = useState(0);

  // Abort controller for in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch (initial or after search/sort change) ──
  useEffect(() => {
    // Skip fetching when disabled (modal closed)
    if (folder === "__disabled__") {
      setItems([]);
      setTotalCount(0);
      setIsLoading(false);
      setNextCursor(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const sort = SORT_OPTIONS[sortIndex];
    const params = new URLSearchParams();
    if (folder) params.set("folder", folder);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("orderBy", sort.orderBy);
    params.set("orderDir", sort.orderDir);
    params.set("limit", "18");

    setIsLoading(true);
    setError(null);

    fetch(`/api/media?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Kunde inte hämta media");
        const data: MediaPage = await res.json();
        setItems(data.items);
        setTotalCount(data.totalCount);
        setNextCursor(data.nextCursor);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch, sortIndex, folder, fetchVersion]);

  // ── Load more (pagination) ──
  const loadMore = useCallback(() => {
    if (!nextCursor || isLoadingMore) return;

    const sort = SORT_OPTIONS[sortIndex];
    const params = new URLSearchParams();
    if (folder) params.set("folder", folder);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("orderBy", sort.orderBy);
    params.set("orderDir", sort.orderDir);
    params.set("limit", "18");
    params.set("cursor", nextCursor);

    setIsLoadingMore(true);

    fetch(`/api/media?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Kunde inte hämta fler");
        const data: MediaPage = await res.json();
        setItems((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = data.items.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
        setNextCursor(data.nextCursor);
        setIsLoadingMore(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoadingMore(false);
      });
  }, [nextCursor, isLoadingMore, sortIndex, folder, debouncedSearch]);

  // ── Refresh (after upload, etc.) ──
  const refresh = useCallback(() => {
    setFetchVersion((v) => v + 1);
  }, []);

  return {
    state: {
      items,
      totalCount,
      isLoading,
      isLoadingMore,
      error,
      search,
      sortIndex,
      nextCursor,
      hasMore: nextCursor !== null,
    },
    actions: {
      setSearch,
      setSortIndex: (i: number) => setSortIndex(i),
      loadMore,
      refresh,
    },
  };
}
