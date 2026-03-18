"use client";

/**
 * EmbedOverlay Context
 * ────────────────────
 * Global provider for opening external URLs in a fullscreen iframe overlay.
 * Any client component inside GuestPageShell can call useEmbed().openEmbed().
 *
 * Architecture follows BookingsContext / MapsContext pattern:
 *   - Context + Provider + Hook
 *   - Provider renders the overlay as a sibling to children
 *   - Memo-stabilized context value
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { EmbedOverlay } from "./EmbedOverlay";

interface EmbedState {
  isOpen: boolean;
  url: string;
  title: string;
}

interface EmbedContextValue {
  openEmbed: (url: string, title?: string) => void;
  closeEmbed: () => void;
}

const EmbedCtx = createContext<EmbedContextValue>({
  openEmbed: () => {},
  closeEmbed: () => {},
});

export function EmbedProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EmbedState>({ isOpen: false, url: "", title: "" });
  const [closing, setClosing] = useState(false);

  const openEmbed = useCallback((url: string, title = "") => {
    // Only allow external https URLs
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      console.warn("[EmbedOverlay] Only http(s) URLs supported, got:", url);
      return;
    }
    setClosing(false);
    setState({ isOpen: true, url, title });
  }, []);

  const closeEmbed = useCallback(() => {
    setClosing(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (closing) {
      setState({ isOpen: false, url: "", title: "" });
      setClosing(false);
    }
  }, [closing]);

  const value = useMemo(() => ({ openEmbed, closeEmbed }), [openEmbed, closeEmbed]);

  return (
    <EmbedCtx.Provider value={value}>
      {children}
      {(state.isOpen || closing) && (
        <EmbedOverlay
          url={state.url}
          title={state.title}
          closing={closing}
          onClose={closeEmbed}
          onAnimationEnd={handleAnimationEnd}
        />
      )}
    </EmbedCtx.Provider>
  );
}

export function useEmbed(): EmbedContextValue {
  return useContext(EmbedCtx);
}
