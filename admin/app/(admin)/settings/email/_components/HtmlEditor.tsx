"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { EditorState } from "@codemirror/state";

interface HtmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
}

export default function HtmlEditor({ value, onChange, height = "100%", readOnly = false }: HtmlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track whether the update is from external value prop
  const isExternalUpdate = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        html(),
        ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height, fontSize: "13px" },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "monospace",
            lineHeight: "1.6",
          },
          ".cm-content": {
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            fontSize: "13px",
          },
          ".cm-gutters": {
            backgroundColor: "#fafafa",
            color: "#707070",
            border: "none",
            fontSize: "12px",
          },
          ".cm-lineNumbers .cm-gutterElement": {
            padding: "0 8px 0 12px",
            minWidth: "32px",
            textAlign: "right",
          },
          ".cm-foldGutter .cm-gutterElement": {
            padding: "0 4px",
            display: "flex",
            alignItems: "center",
          },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
            background: "rgba(0, 0, 0, 0.07)",
          },
          ".cm-activeLine": {
            backgroundColor: "transparent",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "transparent",
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // Only create once — value updates handled below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      isExternalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
      isExternalUpdate.current = false;
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 8,
        overflow: "hidden",
        height,
      }}
    />
  );
}
