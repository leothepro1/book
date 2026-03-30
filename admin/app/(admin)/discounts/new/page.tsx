"use client";

import { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { DatePicker } from "../_components/DatePicker";
import { TimePicker } from "../_components/TimePicker";
import { searchProducts, listCollections } from "@/app/_lib/products";
import { getSegments } from "@/app/(admin)/customers/segments/actions";
import { searchGuestsForPicker } from "./actions";
import "../discounts.css";
import "../../products/_components/product-form.css";
import "../../menus/menus.css";

type DiscountType = "order_amount" | "line_item_amount" | "buy_x_get_y" | "combined";
type Method = "CODE" | "AUTOMATIC";
type ValueType = "PERCENTAGE" | "FIXED_AMOUNT";

type Condition = {
  type: string;
  intValue?: number;
  stringValue?: string;
  jsonValue?: unknown;
};

const CONDITION_OPTIONS: { type: string; label: string; needsInt?: boolean; needsDates?: boolean }[] = [
  { type: "MIN_NIGHTS", label: "Minsta antal nätter", needsInt: true },
  { type: "DAYS_IN_ADVANCE", label: "Dagar i förväg", needsInt: true },
  { type: "ARRIVAL_WINDOW", label: "Ankomstfönster", needsDates: true },
  { type: "MIN_ORDER_AMOUNT", label: "Minsta ordersumma", needsInt: true },
  { type: "MIN_ITEMS", label: "Minsta antal produkter", needsInt: true },
  { type: "ONCE_PER_CUSTOMER", label: "En gång per kund" },
];

const VALID_TYPES: DiscountType[] = ["order_amount", "line_item_amount", "buy_x_get_y", "combined"];

function getInitialConditions(type: DiscountType | null): Condition[] {
  if (type === "combined") {
    return [
      { type: "MIN_NIGHTS", intValue: 2 },
      { type: "DAYS_IN_ADVANCE", intValue: 14 },
    ];
  }
  return [];
}

function conditionLabel(c: Condition): string {
  switch (c.type) {
    case "MIN_NIGHTS": return `Minst ${c.intValue ?? 0} nätter`;
    case "DAYS_IN_ADVANCE": return `Bokning minst ${c.intValue ?? 0} dagar före ankomst`;
    case "ARRIVAL_WINDOW": {
      const jv = c.jsonValue as { startsAt?: string; endsAt?: string } | undefined;
      return `Ankomst mellan ${jv?.startsAt ?? "?"} och ${jv?.endsAt ?? "?"}`;
    }
    case "MIN_ORDER_AMOUNT": return `Minsta ordersumma ${(c.intValue ?? 0) / 100} kr`;
    case "MIN_ITEMS": return `Minst ${c.intValue ?? 0} produkter`;
    case "ONCE_PER_CUSTOMER": return "En gång per kund";
    default: return c.type;
  }
}

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

export default function NewDiscountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") as DiscountType | null;
  const initialType = typeParam && VALID_TYPES.includes(typeParam) ? typeParam : null;
  const discountType = initialType;

  // If no type, redirect back
  if (!discountType) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div className="disc-empty">
            <p className="disc-empty__desc">Välj rabattyp via knappen &quot;Skapa rabatt&quot; på rabattsidan.</p>
            <button className="settings-btn--connect" onClick={() => router.push("/discounts")}>
              Tillbaka till rabatter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form fields
  const [method, setMethod] = useState<Method>("CODE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [valueType, setValueType] = useState<ValueType>("PERCENTAGE");
  const [valueInput, setValueInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [conditions, setConditions] = useState<Condition[]>(getInitialConditions(initialType));
  const [combinesProduct, setCombinesProduct] = useState(false);
  const [combinesOrder, setCombinesOrder] = useState(false);
  const [hasUsageLimit, setHasUsageLimit] = useState(false);
  const [oncePerCustomer, setOncePerCustomer] = useState(false);
  const [usageLimit, setUsageLimit] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hasEndDate, setHasEndDate] = useState(false);

  // Dirty tracking
  const readyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const markDirty = useCallback(() => { if (readyRef.current) setDirty(true); }, []);
  // Mark ready after first render
  if (!readyRef.current) requestAnimationFrame(() => { readyRef.current = true; });

  // Behörighet
  type Eligibility = "all_customers" | "specific_segments" | "specific_customers";
  const [eligibility, setEligibility] = useState<Eligibility>("all_customers");

  // Minsta köpkrav
  type MinPurchase = "none" | "min_amount";
  const [minPurchase, setMinPurchase] = useState<MinPurchase>("none");
  const [minPurchaseAmount, setMinPurchaseAmount] = useState("");
  type EligibilityItem = { id: string; label: string };
  const [eligibilityItems, setEligibilityItems] = useState<EligibilityItem[]>([]);
  const [eligPickerOpen, setEligPickerOpen] = useState(false);
  const [eligPickerSearch, setEligPickerSearch] = useState("");
  const [eligPickerResults, setEligPickerResults] = useState<EligibilityItem[]>([]);
  const [eligPickerLoading, setEligPickerLoading] = useState(false);
  const [eligPickerChecked, setEligPickerChecked] = useState<Set<string>>(new Set());
  const eligSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Gäller för" — product/collection picker
  type AppliesTo = "all" | "specific_collections" | "specific_products";
  type PickedItem = { id: string; title: string; imageUrl: string | null };
  const [appliesTo, setAppliesTo] = useState<AppliesTo>("all");
  const [pickedItems, setPickedItems] = useState<PickedItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<PickedItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerChecked, setPickerChecked] = useState<Set<string>>(new Set());
  const pickerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPickerResults = useCallback(async (query: string) => {
    setPickerLoading(true);
    if (appliesTo === "specific_products") {
      const results = await searchProducts(query);
      setPickerResults(results.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.media[0]?.url ?? null,
      })));
    } else {
      const cols = await listCollections();
      const filtered = query
        ? cols.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
        : cols;
      setPickerResults(filtered.map((c) => ({
        id: c.id,
        title: c.title,
        imageUrl: c.imageUrl ?? null,
      })));
    }
    setPickerLoading(false);
  }, [appliesTo]);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    setPickerSearch("");
    setPickerChecked(new Set(pickedItems.map((p) => p.id)));
    loadPickerResults("");
  }, [pickedItems, loadPickerResults]);

  const handlePickerSearch = useCallback((query: string) => {
    setPickerSearch(query);
    if (pickerSearchTimer.current) clearTimeout(pickerSearchTimer.current);
    pickerSearchTimer.current = setTimeout(() => loadPickerResults(query), 300);
  }, [loadPickerResults]);

  const togglePickerItem = useCallback((id: string) => {
    setPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const confirmPicker = useCallback(() => {
    const selected = pickerResults.filter((p) => pickerChecked.has(p.id));
    setPickedItems(selected);
    setPickerOpen(false);
    markDirty();
  }, [pickerResults, pickerChecked, markDirty]);

  // Eligibility picker callbacks
  const loadEligResults = useCallback(async (query: string) => {
    setEligPickerLoading(true);
    if (eligibility === "specific_segments") {
      const segments = await getSegments();
      const filtered = query
        ? segments.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
        : segments;
      setEligPickerResults(filtered.map((s) => ({ id: s.id, label: s.name })));
    } else if (eligibility === "specific_customers") {
      const results = await searchGuestsForPicker(query);
      setEligPickerResults(results);
    }
    setEligPickerLoading(false);
  }, [eligibility]);

  const openEligPicker = useCallback(() => {
    setEligPickerOpen(true);
    setEligPickerSearch("");
    setEligPickerChecked(new Set(eligibilityItems.map((i) => i.id)));
    loadEligResults("");
  }, [eligibilityItems, loadEligResults]);

  const handleEligSearch = useCallback((query: string) => {
    setEligPickerSearch(query);
    if (eligSearchTimer.current) clearTimeout(eligSearchTimer.current);
    eligSearchTimer.current = setTimeout(() => loadEligResults(query), 300);
  }, [loadEligResults]);

  const toggleEligItem = useCallback((id: string) => {
    setEligPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const confirmEligPicker = useCallback(() => {
    const selected = eligPickerResults.filter((i) => eligPickerChecked.has(i.id));
    setEligibilityItems(selected);
    setEligPickerOpen(false);
    markDirty();
  }, [eligPickerResults, eligPickerChecked, markDirty]);

  // Submission
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Condition management
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [pendingConditionType, setPendingConditionType] = useState<string | null>(null);
  const [condIntValue, setCondIntValue] = useState("");
  const [condDateStart, setCondDateStart] = useState("");
  const [condDateEnd, setCondDateEnd] = useState("");

  const addCondition = () => {
    if (!pendingConditionType) return;
    const opt = CONDITION_OPTIONS.find((o) => o.type === pendingConditionType);
    if (!opt) return;
    const cond: Condition = { type: pendingConditionType };
    if (opt.needsInt) {
      const val = parseInt(condIntValue, 10);
      if (isNaN(val) || val < 0) return;
      cond.intValue = pendingConditionType === "MIN_ORDER_AMOUNT" ? val * 100 : val;
    }
    if (opt.needsDates) {
      if (!condDateStart || !condDateEnd) return;
      cond.jsonValue = { startsAt: condDateStart, endsAt: condDateEnd };
    }
    setConditions([...conditions, cond]);
    setPendingConditionType(null);
    setCondIntValue("");
    setCondDateStart("");
    setCondDateEnd("");
    setShowConditionPicker(false);
    markDirty();
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
    markDirty();
  };

  // Derived
  const targetType = discountType === "order_amount" || discountType === "combined" ? "ORDER" : "LINE_ITEM";
  const valueBps = Math.round(parseFloat(valueInput || "0") * 100);

  // Save
  const handleSave = async () => {
    setError(null);
    setIsSaving(true);

    const isAllProducts = targetType === "ORDER" || appliesTo === "all";
    const isAllCustomers = eligibility === "all_customers";

    const body = {
      title,
      description: method === "AUTOMATIC" ? description || undefined : undefined,
      method,
      valueType,
      value: valueBps,
      targetType,
      startsAt: startDate ? new Date(`${startDate}T${startTime || "00:00"}`).toISOString() : undefined,
      endsAt: hasEndDate && endDate ? new Date(`${endDate}T${endTime || "00:00"}`).toISOString() : undefined,
      usageLimit: hasUsageLimit ? parseInt(usageLimit, 10) || undefined : undefined,
      combinesWithProductDiscounts: combinesProduct,
      combinesWithOrderDiscounts: combinesOrder,
      combinesWithShippingDiscounts: false,
      conditions: [
        ...conditions,
        ...(oncePerCustomer ? [{ type: "ONCE_PER_CUSTOMER" as const }] : []),
      ],
      codes: method === "CODE" && codeInput.trim() ? [codeInput.trim().toUpperCase()] : undefined,
      // Targeting
      appliesToAllProducts: isAllProducts,
      appliesToAllCustomers: isAllCustomers,
      targetedProductIds: !isAllProducts && appliesTo === "specific_products"
        ? pickedItems.map((i) => i.id) : [],
      targetedCollectionIds: !isAllProducts && appliesTo === "specific_collections"
        ? pickedItems.map((i) => i.id) : [],
      targetedSegmentIds: !isAllCustomers && eligibility === "specific_segments"
        ? eligibilityItems.map((i) => i.id) : [],
      targetedGuestAccountIds: !isAllCustomers && eligibility === "specific_customers"
        ? eligibilityItems.map((i) => i.id) : [],
      // Minimum requirements
      minimumAmount: minPurchase === "min_amount" && minPurchaseAmount
        ? Math.round(parseFloat(minPurchaseAmount) * 100) : undefined,
    };

    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setDirty(false);
        setSavedAt(true);
        setTimeout(() => { setSavedAt(false); router.push("/discounts"); }, 800);
      } else {
        const data = await res.json();
        setError(data.error === "CODE_ALREADY_EXISTS"
          ? `Koden "${data.code}" finns redan`
          : data.message || data.error || "Något gick fel");
      }
    } catch {
      setError("Nätverksfel — försök igen");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    router.push("/discounts");
  };

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* ── Header (breadcrumb) ── */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/discounts")}
              aria-label="Tillbaka till rabatter"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>percent_discount</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>Skapa rabatt</span>
          </h1>
        </div>

        {/* ── Body: two-column ── */}
        <div className="pf-body">
          {/* Left column (70%) */}
          <div className="pf-main">
            {/* Card 1: Metod + Rubrik + Koder */}
            <div style={CARD}>
              <div className="pf-field">
                <label className="admin-label">Metod</label>
                <div className="disc-form__toggle-group">
                  <button
                    type="button"
                    className={`disc-form__toggle-btn${method === "CODE" ? " disc-form__toggle-btn--active" : ""}`}
                    onClick={() => { setMethod("CODE"); markDirty(); }}
                  >
                    Rabattkod
                  </button>
                  <button
                    type="button"
                    className={`disc-form__toggle-btn${method === "AUTOMATIC" ? " disc-form__toggle-btn--active" : ""}`}
                    onClick={() => { setMethod("AUTOMATIC"); markDirty(); }}
                  >
                    Automatisk
                  </button>
                </div>
              </div>

              <div className="pf-field">
                <label className="admin-label">Rubrik</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); markDirty(); }}
                  placeholder="T.ex. Sommarkampanj 2026"
                />
              </div>

              {method === "CODE" && (
                <div className="pf-field">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label className="admin-label" style={{ margin: 0 }}>Rabattkod</label>
                    <button
                      type="button"
                      className=""
                      style={{ fontSize: 13, padding: 0, border: "none", color: "var(--admin-accent)", background: "none", cursor: "pointer" }}
                      onClick={() => {
                        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
                        let code = "";
                        for (let i = 0; i < 12; i++) code += chars[Math.floor(Math.random() * chars.length)];
                        setCodeInput(code);
                        markDirty();
                      }}
                    >
                      Generera slumpmässig kod
                    </button>
                  </div>
                  <input
                    type="text"
                    className="email-sender__input"
                    placeholder="T.ex. SOMMAR2026"
                    value={codeInput}
                    onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); markDirty(); }}
                  />
                </div>
              )}
            </div>

            {/* Card 2: Rabattvärde */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Rabattvärde</span>
              </div>
              <div className="pf-field">
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 7 }}>
                    <select
                      className="email-sender__input"
                      style={{ appearance: "none", paddingRight: 32 }}
                      value={valueType}
                      onChange={(e) => { setValueType(e.target.value as ValueType); markDirty(); }}
                    >
                      <option value="PERCENTAGE">Procent</option>
                      <option value="FIXED_AMOUNT">Fast belopp</option>
                    </select>
                    <span
                      className="material-symbols-rounded"
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#616161", pointerEvents: "none" }}
                    >
                      unfold_more
                    </span>
                  </div>
                  <div style={{ position: "relative", flex: 3 }}>
                    <input
                      type="number"
                      className="email-sender__input"
                      style={{ paddingRight: 32 }}
                      min={valueType === "PERCENTAGE" ? "0.01" : "1"}
                      max={valueType === "PERCENTAGE" ? "100" : undefined}
                      step={valueType === "PERCENTAGE" ? "0.01" : "1"}
                      placeholder={valueType === "PERCENTAGE" ? "" : "0"}
                      value={valueInput}
                      onChange={(e) => { setValueInput(e.target.value); markDirty(); }}
                    />
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#616161", pointerEvents: "none" }}>
                      {valueType === "PERCENTAGE" ? "%" : "kr"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Gäller för — only for LINE_ITEM discount types */}
              {targetType === "LINE_ITEM" && (
                <>
                  <div className="pf-field">
                    <label className="admin-label">Gäller för</label>
                    <div style={{ position: "relative" }}>
                      <select
                        className="email-sender__input"
                        style={{ appearance: "none", paddingRight: 32 }}
                        value={appliesTo}
                        onChange={(e) => {
                          setAppliesTo(e.target.value as AppliesTo);
                          setPickedItems([]);
                          markDirty();
                        }}
                      >
                        <option value="specific_collections">Specifika produktserier</option>
                        <option value="specific_products">Specifika produkter</option>
                      </select>
                      <span
                        className="material-symbols-rounded"
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#616161", pointerEvents: "none" }}
                      >
                        unfold_more
                      </span>
                    </div>
                  </div>

                  <div className="pf-field">
                    <div style={{ display: "flex", gap: 8 }}>
                      <div className="pf-collection-trigger" style={{ flex: 1 }}>
                        <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                        <input
                          type="text"
                          className="pf-collection-trigger__input"
                          placeholder={appliesTo === "specific_products" ? "Sök produkter" : "Sök produktserier"}
                          onFocus={openPicker}
                          readOnly
                        />
                      </div>
                      <button type="button" className="settings-btn--muted" onClick={openPicker}>
                        Bläddra
                      </button>
                    </div>

                    {/* Selected items */}
                    {pickedItems.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 10 }}>
                        {pickedItems.map((item) => (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--admin-border)" }}>
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}>
                                <EditorIcon name={appliesTo === "specific_products" ? "image" : "folder"} size={16} />
                              </div>
                            )}
                            <span style={{ flex: 1, fontSize: 13, color: "var(--admin-text)" }}>{item.title}</span>
                            <button
                              type="button"
                              onClick={() => { setPickedItems(pickedItems.filter((p) => p.id !== item.id)); markDirty(); }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-secondary)", display: "flex" }}
                            >
                              <EditorIcon name="close" size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Card 3: Behörighet */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Behörighet</span>
              </div>
              {(["all_customers", "specific_segments", "specific_customers"] as const).map((value) => {
                const labels: Record<Eligibility, string> = {
                  all_customers: "Alla kunder",
                  specific_segments: "Specifika kundsegment",
                  specific_customers: "Specifika kunder",
                };
                const active = eligibility === value;
                return (
                  <label
                    key={value}
                    className="disc-radio-row"
                    onClick={() => { setEligibility(value); setEligibilityItems([]); markDirty(); }}
                  >
                    <span className={`disc-radio${active ? " disc-radio--active" : ""}`} />
                    <span style={{ fontSize: 13, color: "var(--admin-text)" }}>{labels[value]}</span>
                  </label>
                );
              })}

              {/* Search + browse for segments or customers */}
              {eligibility !== "all_customers" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div className="pf-collection-trigger" style={{ flex: 1 }}>
                      <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                      <input
                        type="text"
                        className="pf-collection-trigger__input"
                        placeholder={eligibility === "specific_segments" ? "Sök kundsegment" : "Sök kunder"}
                        onFocus={openEligPicker}
                        readOnly
                      />
                    </div>
                    <button type="button" className="settings-btn--muted" onClick={openEligPicker}>
                      Bläddra
                    </button>
                  </div>

                  {eligibilityItems.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 10 }}>
                      {eligibilityItems.map((item) => (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--admin-border)" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}>
                            <EditorIcon name={eligibility === "specific_segments" ? "group_work" : "person"} size={16} />
                          </div>
                          <span style={{ flex: 1, fontSize: 13, color: "var(--admin-text)" }}>{item.label}</span>
                          <button
                            type="button"
                            onClick={() => { setEligibilityItems(eligibilityItems.filter((i) => i.id !== item.id)); markDirty(); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-secondary)", display: "flex" }}
                          >
                            <EditorIcon name="close" size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Card 4: Minsta köpkrav */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Minsta köpkrav</span>
              </div>
              <label className="disc-radio-row" onClick={() => { setMinPurchase("none"); markDirty(); }}>
                <span className={`disc-radio${minPurchase === "none" ? " disc-radio--active" : ""}`} />
                <span style={{ fontSize: 13, color: "var(--admin-text)" }}>Inga minimikrav</span>
              </label>
              <label className="disc-radio-row" onClick={() => { setMinPurchase("min_amount"); markDirty(); }}>
                <span className={`disc-radio${minPurchase === "min_amount" ? " disc-radio--active" : ""}`} />
                <span style={{ fontSize: 13, color: "var(--admin-text)" }}>Minsta köpbelopp (kr)</span>
              </label>
              {minPurchase === "min_amount" && (
                <div className="pf-field" style={{ marginTop: 8 }}>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      className="email-sender__input"
                      style={{ paddingRight: 32 }}
                      min="1"
                      placeholder="0"
                      value={minPurchaseAmount}
                      onChange={(e) => { setMinPurchaseAmount(e.target.value); markDirty(); }}
                    />
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#616161", pointerEvents: "none" }}>
                      kr
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Card 5: Villkor (only for combined discount type) */}
            {discountType === "combined" && <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Villkor</span>
              </div>
              {conditions.length > 0 && (
                <div className="disc-conditions" style={{ marginBottom: 12 }}>
                  {conditions.map((c, i) => (
                    <div key={i} className="disc-condition">
                      <EditorIcon name="check_circle" size={16} className="disc-condition__icon" />
                      <span style={{ flex: 1 }}>{conditionLabel(c)}</span>
                      <button className="disc-form__pill-remove" onClick={() => removeCondition(i)} type="button">
                        <EditorIcon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!showConditionPicker ? (
                <button
                  type="button"
                  className="settings-btn--outline"
                  onClick={() => setShowConditionPicker(true)}
                  style={{ fontSize: 13 }}
                >
                  <EditorIcon name="add_circle" size={16} />
                  Lägg till villkor
                </button>
              ) : (
                <div style={{ background: "var(--admin-bg)", borderRadius: 8, padding: 12, marginTop: 8 }}>
                  <div className="pf-field">
                    <label className="admin-label">Villkorstyp</label>
                    <select
                      className="email-sender__input"
                      value={pendingConditionType ?? ""}
                      onChange={(e) => setPendingConditionType(e.target.value || null)}
                    >
                      <option value="">Välj villkor...</option>
                      {CONDITION_OPTIONS
                        .filter((o) => !conditions.some((c) => c.type === o.type))
                        .map((o) => (
                          <option key={o.type} value={o.type}>{o.label}</option>
                        ))}
                    </select>
                  </div>
                  {pendingConditionType && (() => {
                    const opt = CONDITION_OPTIONS.find((o) => o.type === pendingConditionType);
                    if (!opt) return null;
                    return (
                      <>
                        {opt.needsInt && (
                          <div className="pf-field">
                            <label className="admin-label">
                              {pendingConditionType === "MIN_ORDER_AMOUNT" ? "Belopp (SEK)" : "Värde"}
                            </label>
                            <input
                              type="number"
                              className="email-sender__input"
                              min="0"
                              value={condIntValue}
                              onChange={(e) => setCondIntValue(e.target.value)}
                            />
                          </div>
                        )}
                        {opt.needsDates && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <div className="pf-field" style={{ flex: 1 }}>
                              <label className="admin-label">Från</label>
                              <input type="date" className="email-sender__input" value={condDateStart} onChange={(e) => setCondDateStart(e.target.value)} />
                            </div>
                            <div className="pf-field" style={{ flex: 1 }}>
                              <label className="admin-label">Till</label>
                              <input type="date" className="email-sender__input" value={condDateEnd} onChange={(e) => setCondDateEnd(e.target.value)} />
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="settings-btn--connect" onClick={addCondition} type="button">Lägg till</button>
                    <button className="settings-btn--outline" onClick={() => { setShowConditionPicker(false); setPendingConditionType(null); }} type="button">Avbryt</button>
                  </div>
                </div>
              )}
            </div>}

            {/* Card 6: Maximalt antal rabattanvändningar */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Maximalt antal rabattanvändningar</span>
              </div>
              <button type="button" className="fac-check-row" style={{ marginBottom: hasUsageLimit ? 8 : 10 }} onClick={() => { setHasUsageLimit(!hasUsageLimit); markDirty(); }}>
                <span className={`fac-check${hasUsageLimit ? " fac-check--on" : ""}`}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                Begränsa det totala antalet gånger den här rabatten kan användas
              </button>
              {hasUsageLimit && (
                <div className="pf-field" style={{ marginBottom: 10, paddingLeft: 53 }}>
                  <input
                    type="number"
                    className="email-sender__input"
                    min="1"
                    placeholder="100"
                    value={usageLimit}
                    onChange={(e) => { setUsageLimit(e.target.value); markDirty(); }}
                  />
                </div>
              )}
              <button type="button" className="fac-check-row" onClick={() => { setOncePerCustomer(!oncePerCustomer); markDirty(); }}>
                <span className={`fac-check${oncePerCustomer ? " fac-check--on" : ""}`}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                Begränsa till en användning per kund
              </button>
            </div>

            {/* Card 7: Kombinationer */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Kombinationer</span>
              </div>
              <button type="button" className="fac-check-row" style={{ marginBottom: 10 }} onClick={() => { setCombinesProduct(!combinesProduct); markDirty(); }}>
                <span className={`fac-check${combinesProduct ? " fac-check--on" : ""}`}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                Kombineras med produktrabatter
              </button>
              <button type="button" className="fac-check-row" onClick={() => { setCombinesOrder(!combinesOrder); markDirty(); }}>
                <span className={`fac-check${combinesOrder ? " fac-check--on" : ""}`}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                Kombineras med orderrabatter
              </button>
            </div>

            {/* Card 8: Aktiva datum */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Aktiva datum</span>
              </div>
              <div className="pf-field">
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="admin-label">Startdatum</label>
                    <DatePicker value={startDate} onChange={(v) => { setStartDate(v); markDirty(); }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="admin-label">Starttid</label>
                    <TimePicker value={startTime} onChange={(v) => { setStartTime(v); markDirty(); }} />
                  </div>
                </div>
              </div>
              <div className="pf-field">
                <button type="button" className="fac-check-row" onClick={() => { setHasEndDate(!hasEndDate); markDirty(); }}>
                  <span className={`fac-check${hasEndDate ? " fac-check--on" : ""}`}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="fac-check__svg"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  Ange slutdatum
                </button>
              </div>
              {hasEndDate && (
                <div className="pf-field">
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="admin-label">Slutdatum</label>
                      <DatePicker value={endDate} onChange={(v) => { setEndDate(v); markDirty(); }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="admin-label">Sluttid</label>
                      <TimePicker value={endTime} onChange={(v) => { setEndTime(v); markDirty(); }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column (30%) */}
          <div className="pf-sidebar">
            {/* Summary card */}
            <div style={CARD}>
              {/* Title / Code */}
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 2 }}>
                {method === "CODE"
                  ? (codeInput.trim() || "Ingen rabattkod än")
                  : (title.trim() || "Ingen rubrik än")}
              </div>
              <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginBottom: 16 }}>
                {method === "CODE" ? "Rabattkod" : "Automatisk"}
              </div>

              {/* Typ */}
              <div style={{ fontSize: 13, fontWeight: 550, color: "#303030", marginBottom: 6 }}>
                Typ
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span className="material-symbols-rounded" style={{ fontSize: 18, color: "var(--admin-text)" }}>
                  {discountType === "order_amount" ? "sell"
                    : discountType === "line_item_amount" ? "inbox"
                    : discountType === "buy_x_get_y" ? "sell"
                    : "percent_discount"}
                </span>
                <span style={{ fontSize: 13, color: "var(--admin-text)" }}>
                  {discountType === "order_amount" ? "Beloppsrabatt på order"
                    : discountType === "line_item_amount" ? "Beloppsrabatt på produkter"
                    : discountType === "buy_x_get_y" ? "Köp X få Y"
                    : "Kombinerad rabatt"}
                </span>
              </div>

              {/* Detaljer */}
              <div style={{ fontSize: 13, fontWeight: 550, color: "#303030", marginBottom: 6 }}>
                Detaljer
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: "var(--admin-text)", lineHeight: 1.8, listStyle: "disc" }}>
                {/* Värde */}
                {valueInput && (
                  <li>
                    {valueType === "PERCENTAGE"
                      ? `${valueInput} % rabatt`
                      : `${parseFloat(valueInput).toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr rabatt`}
                    {targetType === "LINE_ITEM"
                      ? appliesTo === "specific_collections"
                        ? ` på produktserier`
                        : ` på produkter`
                      : ` på hela ordern`}
                  </li>
                )}

                {/* Gäller för — picked items */}
                {targetType === "LINE_ITEM" && pickedItems.length > 0 && (
                  <li>
                    {`För ${pickedItems.length} ${appliesTo === "specific_collections" ? (pickedItems.length === 1 ? "produktserie" : "produktserier") : (pickedItems.length === 1 ? "produkt" : "produkter")}`}
                  </li>
                )}

                {/* Behörighet */}
                {eligibility === "all_customers" && (
                  <li>Alla kunder</li>
                )}
                {eligibility === "specific_segments" && (
                  <li>{eligibilityItems.length > 0 ? `För ${eligibilityItems.length} kundsegment` : "Specifika kundsegment"}</li>
                )}
                {eligibility === "specific_customers" && (
                  <li>{eligibilityItems.length > 0 ? `För ${eligibilityItems.length} ${eligibilityItems.length === 1 ? "kund" : "kunder"}` : "Specifika kunder"}</li>
                )}

                {/* Minsta köpkrav */}
                {minPurchase === "none" && (
                  <li>Inget krav på minsta köp</li>
                )}
                {minPurchase === "min_amount" && (
                  <li>Minsta köpbelopp {minPurchaseAmount ? `${parseFloat(minPurchaseAmount).toLocaleString("sv-SE")} kr` : "ej angivet"}</li>
                )}

                {/* Användningsbegränsning */}
                {hasUsageLimit && usageLimit && (
                  <li>Begränsad till {usageLimit} användningar totalt</li>
                )}
                {oncePerCustomer && (
                  <li>En användning per kund</li>
                )}
                {!hasUsageLimit && !oncePerCustomer && (
                  <li>Obegränsat antal användningar</li>
                )}

                {/* Kombinationer */}
                {combinesProduct && combinesOrder ? (
                  <li>Kombineras med produkt- och orderrabatter</li>
                ) : combinesProduct ? (
                  <li>Kombineras med produktrabatter</li>
                ) : combinesOrder ? (
                  <li>Kombineras med orderrabatter</li>
                ) : (
                  <li>Kan inte kombineras med andra rabatter</li>
                )}

                {/* Datum */}
                {(() => {
                  const fmtDate = (d: string) => {
                    const dt = new Date(d + "T00:00:00");
                    return dt.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
                  };
                  if (startDate && hasEndDate && endDate) {
                    return <li>Aktiv från {fmtDate(startDate)}{startTime ? ` ${startTime}` : ""} – {fmtDate(endDate)}{endTime ? ` ${endTime}` : ""}</li>;
                  }
                  if (startDate) {
                    return <li>Aktiv från {fmtDate(startDate)}{startTime ? ` ${startTime}` : ""}</li>;
                  }
                  return <li style={{ color: "var(--admin-text-tertiary)" }}>Inget startdatum angivet</li>;
                })()}
              </ul>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px" }}>
            <div className="disc-form__error">{error}</div>
          </div>
        )}
      </div>

      <PublishBarUI
        hasUnsavedChanges={dirty}
        isPublishing={isSaving}
        isDiscarding={isDiscarding}
        isLingeringAfterPublish={savedAt}
        onPublish={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Product/Collection picker modal */}
      {pickerOpen && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setPickerOpen(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, width: 560, maxHeight: "80vh", minHeight: 450,
              display: "flex", flexDirection: "column", overflow: "hidden",
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", borderBottom: "1px solid #EBEBEB", background: "#f3f3f3" }}>
              <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
                {appliesTo === "specific_products" ? "Välj produkter" : "Välj produktserier"}
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-secondary)" }}
              >
                <EditorIcon name="close" size={20} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #EBEBEB" }}>
              <div className="pf-collection-trigger">
                <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <input
                  type="text"
                  className="pf-collection-trigger__input"
                  value={pickerSearch}
                  onChange={(e) => handlePickerSearch(e.target.value)}
                  placeholder={appliesTo === "specific_products" ? "Sök produkter" : "Sök produktserier"}
                  autoFocus
                />
              </div>
            </div>

            {/* Results list */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {pickerLoading && pickerResults.length === 0 && (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={`skel-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #EBEBEB" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite" }} />
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: "0.1s" }} />
                    <div style={{ flex: 1, height: 12, borderRadius: 4, background: "#e8e8e8", animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: `${i * 0.05}s` }} />
                  </div>
                ))
              )}
              {pickerResults.map((item) => {
                const checked = pickerChecked.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => togglePickerItem(item.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", borderBottom: "1px solid #EBEBEB" }}
                  >
                    <div className={`files-header-check${checked ? " files-header-check--active" : ""}`} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}>
                      <EditorIcon name="check" size={12} className="files-header-check__icon" />
                    </div>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #EBEBEB", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}>
                        <EditorIcon name={appliesTo === "specific_products" ? "image" : "folder"} size={16} />
                      </div>
                    )}
                    <span style={{ flex: "1 1 0%", fontSize: 13, color: "var(--admin-text)" }}>{item.title}</span>
                  </div>
                );
              })}
              {!pickerLoading && pickerResults.length === 0 && (
                <p style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-text-tertiary)", margin: 0 }}>
                  {appliesTo === "specific_products" ? "Inga produkter hittades" : "Inga produktserier hittades"}
                </p>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #EBEBEB" }}>
              <button className="settings-btn--outline" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={() => setPickerOpen(false)}>
                Avbryt
              </button>
              <button className="settings-btn--connect" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={confirmPicker}>
                Klar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Eligibility picker modal (segments / customers) */}
      {eligPickerOpen && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setEligPickerOpen(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, width: 560, maxHeight: "80vh", minHeight: 450,
              display: "flex", flexDirection: "column", overflow: "hidden",
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", borderBottom: "1px solid #EBEBEB", background: "#f3f3f3" }}>
              <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
                {eligibility === "specific_segments" ? "Välj kundsegment" : "Välj kunder"}
              </h3>
              <button
                type="button"
                onClick={() => setEligPickerOpen(false)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-secondary)" }}
              >
                <EditorIcon name="close" size={20} />
              </button>
            </div>

            <div style={{ padding: "12px 20px", borderBottom: "1px solid #EBEBEB" }}>
              <div className="pf-collection-trigger">
                <EditorIcon name="search" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <input
                  type="text"
                  className="pf-collection-trigger__input"
                  value={eligPickerSearch}
                  onChange={(e) => handleEligSearch(e.target.value)}
                  placeholder={eligibility === "specific_segments" ? "Sök kundsegment" : "Sök kunder"}
                  autoFocus
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {eligPickerLoading && eligPickerResults.length === 0 && (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={`skel-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #EBEBEB" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite" }} />
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: "#e8e8e8", flexShrink: 0, animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: "0.1s" }} />
                    <div style={{ flex: 1, height: 12, borderRadius: 4, background: "#e8e8e8", animation: "skeleton-shimmer 1.2s ease-in-out infinite", animationDelay: `${i * 0.05}s` }} />
                  </div>
                ))
              )}
              {eligPickerResults.map((item) => {
                const checked = eligPickerChecked.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleEligItem(item.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", borderBottom: "1px solid #EBEBEB" }}
                  >
                    <div className={`files-header-check${checked ? " files-header-check--active" : ""}`} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}>
                      <EditorIcon name="check" size={12} className="files-header-check__icon" />
                    </div>
                    <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--admin-text-tertiary)", flexShrink: 0 }}>
                      <EditorIcon name={eligibility === "specific_segments" ? "group_work" : "person"} size={16} />
                    </div>
                    <span style={{ flex: "1 1 0%", fontSize: 13, color: "var(--admin-text)" }}>{item.label}</span>
                  </div>
                );
              })}
              {!eligPickerLoading && eligPickerResults.length === 0 && (
                <p style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--admin-text-tertiary)", margin: 0 }}>
                  {eligibility === "specific_segments" ? "Inga kundsegment hittades" : "Inga kunder hittades"}
                </p>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #EBEBEB" }}>
              <button className="settings-btn--outline" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={() => setEligPickerOpen(false)}>
                Avbryt
              </button>
              <button className="settings-btn--connect" style={{ fontSize: 13, padding: "6px 15px", height: "max-content" }} onClick={confirmEligPicker}>
                Klar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
