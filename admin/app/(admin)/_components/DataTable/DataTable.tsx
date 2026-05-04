"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import "./data-table.css";

/**
 * DataTable — admin list/table primitive.
 *
 * Shared visual + interaction language for every list page in admin
 * (products, orders, customers, drafts, discounts, …). Lifted from
 * the products page, which is the canonical 10/10 reference.
 *
 * Anatomy in render order:
 *   - Filter pill bar (optional, controlled)
 *   - Sticky column headers (morph into bulk-action toolbar when rows
 *     are selected)
 *   - Data rows with optional leading checkbox + thumbnail column
 *   - Empty state (when `data.length === 0`)
 *
 * Selection state is owned by this component. The `bulkActions` render
 * prop receives the current selection + helpers to clear/select-all.
 */

export type DataTableColumn<T> = {
  /** Stable id, used as React key. */
  key: string;
  /** Header label. Omit on thumbnail/icon columns. */
  header?: ReactNode;
  /** Width strategy. `"main"` flex-grows; `"detail"` is 16%; `"thumb"` is 40px. */
  width?: "main" | "detail" | "thumb";
  /** `"right"` enables tabular-nums, useful for prices. */
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

export type DataTableFilter = {
  key: string;
  label: string;
};

export type DataTableEmpty = {
  /** Material symbol name. */
  icon?: string;
  title: string;
  desc?: string;
  cta?: { label: string; onClick?: () => void };
};

export type DataTableProps<T> = {
  data: T[];
  /** Stable id per row — used as React key and selection identity. */
  rowKey: (row: T) => string;
  columns: DataTableColumn<T>[];

  /* Filters — fully controlled */
  filters?: DataTableFilter[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
  /** Returns true if `row` should be visible under `filterKey`. */
  filterPredicate?: (row: T, filterKey: string) => boolean;

  /* Selection */
  selectable?: boolean;
  /** Render bulk actions when rows are selected — appears in the toolbar. */
  bulkActions?: (
    selectedIds: Set<string>,
    helpers: { clear: () => void; selectAll: () => void; total: number }
  ) => ReactNode;
  /** Singular/plural label used in "X vald(a)" toolbar. Defaults to Swedish. */
  selectionLabels?: { singular: string; plural: string };

  /* Row interactions */
  onRowClick?: (row: T) => void;

  /* States */
  loading?: boolean;
  empty?: DataTableEmpty;
};

export function DataTable<T>({
  data,
  rowKey,
  columns,
  filters,
  activeFilter,
  onFilterChange,
  filterPredicate,
  selectable,
  bulkActions,
  selectionLabels = { singular: "vald", plural: "valda" },
  onRowClick,
  loading,
  empty,
}: DataTableProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSelectDropdown, setShowSelectDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered =
    filterPredicate && activeFilter
      ? data.filter((row) => filterPredicate(row, activeFilter))
      : data;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(data.map(rowKey)));
  }, [data, rowKey]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selCount = selectedIds.size;
  const hasSelection = selCount > 0;
  const allSelected = data.length > 0 && selCount === data.length;
  const someSelected = hasSelection && !allSelected;

  // Close selection dropdown on outside click.
  useEffect(() => {
    if (!showSelectDropdown) return;
    const handle = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowSelectDropdown(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSelectDropdown]);

  if (loading) return null;

  if (data.length === 0 && empty) {
    return (
      <div className="dt-empty">
        {empty.icon && (
          <div className="dt-empty__icon">
            <EditorIcon name={empty.icon} size={48} />
          </div>
        )}
        <h2 className="dt-empty__title">{empty.title}</h2>
        {empty.desc && <p className="dt-empty__desc">{empty.desc}</p>}
        {empty.cta && (
          <button
            className="settings-btn--connect"
            style={{ fontSize: 14, padding: "8px 20px" }}
            onClick={empty.cta.onClick}
          >
            {empty.cta.label}
          </button>
        )}
      </div>
    );
  }

  const handleHeaderCheckbox = () => {
    if (allSelected || hasSelection) clearAll();
    else selectAll();
  };

  const headerRow =
    selectable && hasSelection ? (
      <div className="dt-headers dt-headers--selection">
        <button
          type="button"
          role="checkbox"
          aria-checked={
            allSelected ? "true" : someSelected ? "mixed" : "false"
          }
          className={`dt-check ${
            someSelected
              ? "dt-check--partial"
              : allSelected
                ? "dt-check--active"
                : ""
          }`}
          onClick={handleHeaderCheckbox}
        >
          <EditorIcon
            name={someSelected ? "remove" : "check"}
            size={14}
            className="dt-check__icon"
          />
        </button>
        <span className="dt-selection__label">
          {selCount}{" "}
          {selCount === 1 ? selectionLabels.singular : selectionLabels.plural}
        </span>
        <div style={{ position: "relative" }} ref={dropdownRef}>
          <button
            className="dt-selection__chevron"
            onClick={() => setShowSelectDropdown((v) => !v)}
            aria-label="Markeringsalternativ"
          >
            <EditorIcon name="expand_more" size={18} />
          </button>
          {showSelectDropdown && (
            <div className="dt-selection__dropdown">
              <button
                className="dt-selection__dropdown-item"
                onClick={() => {
                  selectAll();
                  setShowSelectDropdown(false);
                }}
              >
                Markera alla {data.length}
              </button>
              <button
                className="dt-selection__dropdown-item"
                onClick={() => {
                  clearAll();
                  setShowSelectDropdown(false);
                }}
              >
                Avmarkera alla
              </button>
            </div>
          )}
        </div>
        {bulkActions?.(selectedIds, {
          clear: clearAll,
          selectAll,
          total: data.length,
        })}
      </div>
    ) : (
      <div className="dt-headers">
        {selectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked="false"
            className="dt-check"
            onClick={handleHeaderCheckbox}
            aria-label="Markera alla"
          >
            <EditorIcon name="check" size={14} className="dt-check__icon" />
          </button>
        )}
        {columns.map((c) => (
          <span key={c.key} className={colClass(c)}>
            {c.header}
          </span>
        ))}
      </div>
    );

  return (
    <>
      {filters && filters.length > 0 && (
        <div className="dt-filters">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`dt-filter${activeFilter === f.key ? " dt-filter--active" : ""}`}
              onClick={() => onFilterChange?.(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div className="dt-inner">
        {headerRow}
        {filtered.map((row) => {
          const id = rowKey(row);
          const checked = selectedIds.has(id);
          return (
            <div
              key={id}
              className={`dt-row${checked ? " dt-row--selected" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {selectable && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  className={`dt-check${checked ? " dt-check--active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(id);
                  }}
                >
                  <EditorIcon
                    name="check"
                    size={14}
                    className="dt-check__icon"
                  />
                </button>
              )}
              {columns.map((c) => (
                <div key={c.key} className={colClass(c)}>
                  {c.render(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function colClass<T>(c: DataTableColumn<T>): string {
  const widthClass =
    c.width === "thumb"
      ? "dt-col--thumb"
      : c.width === "main"
        ? "dt-col--main"
        : "dt-col--detail";
  return `dt-col ${widthClass}${c.align === "right" ? " dt-col--right" : ""}`;
}
