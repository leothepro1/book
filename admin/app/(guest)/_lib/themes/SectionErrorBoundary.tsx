"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

type Props = {
  sectionId: string;
  sectionType: string;
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Error Boundary for individual theme sections.
 *
 * Catches render errors in a single section without taking down
 * the entire page. Logs the error and renders an invisible placeholder
 * in production, or a visible error box in development.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ThemeEngine] Section "${this.props.sectionType}" (slot "${this.props.sectionId}") crashed:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (process.env.NODE_ENV === "development") {
      return (
        <div
          style={{
            padding: 16,
            margin: "8px 0",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: 8,
            fontSize: 13,
            color: "#991B1B",
            fontFamily: "monospace",
          }}
        >
          Section &quot;{this.props.sectionType}&quot; (slot &quot;{this.props.sectionId}&quot;) crashed.
          Check console for details.
        </div>
      );
    }

    // Production: invisible placeholder — page continues rendering
    return null;
  }
}
