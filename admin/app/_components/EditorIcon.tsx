"use client";

/**
 * Lightweight Material Symbol icon for the editor UI.
 *
 * Unlike the guest-facing MaterialIcon (which has ligature detection),
 * this component renders immediately — the editor always has the font loaded.
 *
 * Size is raw pixels (editor icons don't follow theme size tokens).
 */

type EditorIconProps = {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function EditorIcon({ name, size = 16, className, style }: EditorIconProps) {
  return (
    <span
      className={`material-symbols-rounded${className ? ` ${className}` : ""}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        userSelect: "none",
        fontVariationSettings: "'wght' var(--icon-weight, 400), 'FILL' 0, 'GRAD' 0, 'opsz' 24",
        fontFamily: "'Material Symbols Rounded'",
        ...style,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
