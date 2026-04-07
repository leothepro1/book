"use client";

import { Fragment } from "react";
import "./summary-col.css";

export interface SummaryRow {
  label: string;
  value: string;
  modifier?: string;
}

interface SummaryColProps {
  title: string;
  image?: string | null;
  rows: SummaryRow[];
  /** Optional slot between header and rows (e.g. discount input in checkout) */
  children?: React.ReactNode;
}

export function SummaryCol({ title, image, rows, children }: SummaryColProps) {
  return (
    <div className="sc">
      <div className="sc__inner">
        <div className="sc__header">
          {image && (
            <img src={image} alt={title} className="sc__image" />
          )}
          <h3 className="sc__title">{title}</h3>
        </div>

        {children}

        {rows.map((row, i) => (
          <Fragment key={i}>
            <div className="sc__divider" />
            <div className={`sc__section${row.modifier ? ` sc__section--${row.modifier}` : ""}`}>
              <span className="sc__label">{row.label}</span>
              <span className="sc__value">{row.value}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
