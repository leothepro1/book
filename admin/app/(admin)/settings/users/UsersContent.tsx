"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getOrganisationUsers, inviteUsers, changeUserRole, removeUser, resendInvitation } from "./actions";
import type { OrgUser, InviteEmailResult } from "./actions";
import "./users.css";

type UsersContentProps = {
  onSubTitleChange?: (title: string | null) => void;
  triggerInvite?: number;
  onHeaderExtraChange?: (node: React.ReactNode) => void;
  onHeaderActionChange?: (node: React.ReactNode) => void;
};

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`users-checkbox ${checked ? "users-checkbox--checked" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <EditorIcon name="check" size={14} className="users-checkbox__icon" />
    </button>
  );
}

function ButtonSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };

  if (!mounted) return null;
  return (
    <svg className={`btn-spinner ${animState === "exit" ? "btn-spinner--out" : ""}`}
      width="18" height="18" viewBox="0 0 21 21" fill="none"
      style={{ marginTop: 1 }} onAnimationEnd={handleAnimationEnd} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "Aktiv", className: "users-status--active" },
  pending: { label: "Väntande", className: "users-status--pending" },
  revoked: { label: "Borttagen", className: "users-status--revoked" },
};

function displayName(user: OrgUser): string {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : user.email;
}

function showEmail(user: OrgUser): boolean {
  return !!(user.firstName || user.lastName);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ADMIN_CAN = [
  "Redigera gästportal",
  "Publicera gästportal",
  "Hantera templates / portal builder",
  "Redigera organisationsinställningar",
  "Bjuda in / ta bort användare",
  "Ändra plan",
  "Ändra fakturering",
  "Hantera integrationer",
  "Hantera produkter / add-ons",
  "Se alla gäster och bokningar",
];

const MEMBER_CAN = [
  "Se gäster",
  "Se bokningar",
  "Se check-ins / check-outs",
  "Hantera check-ins",
  "Se orders",
  "Se portal preview",
];

const MEMBER_CANNOT = [
  "Redigera gästportal",
  "Publicera gästportal",
  "Hantera templates / portal builder",
  "Redigera organisationsinställningar",
  "Bjuda in / ta bort användare",
  "Ändra plan",
  "Ändra fakturering",
  "Hantera integrationer",
  "Hantera produkter / add-ons",
];

function RoleInfoModal({ role, onClose }: { role: "org:admin" | "org:member" | null; onClose: () => void }) {
  if (!role) return null;

  const isAdmin = role === "org:admin";
  const title = isAdmin ? "Admin" : "Medlem";

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div style={{
        position: "absolute", inset: 0,
        background: "var(--admin-overlay)",
        animation: "settings-modal-fade-in 0.15s ease",
      }} />
      <div
        style={{
          position: "relative", zIndex: 1,
          background: "var(--admin-surface)",
          borderRadius: 16, width: 440, maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
          padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
        }}>
          <h3 style={{ fontSize: 17, fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "transparent",
              cursor: "pointer", color: "var(--admin-text-secondary)",
            }}
            aria-label="Stäng"
          >
            <EditorIcon name="close" size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px", overflowY: "auto" }}>
          {isAdmin ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {ADMIN_CAN.map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--admin-text)" }}>
                  <EditorIcon name="check" size={18} style={{ color: "#1a7f37", flexShrink: 0 }} />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {MEMBER_CAN.map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--admin-text)" }}>
                    <EditorIcon name="check" size={18} style={{ color: "#1a7f37", flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <div style={{ height: 1, background: "#E6E5E3", margin: "14px 0" }} />
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {MEMBER_CANNOT.map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--admin-text-secondary)" }}>
                    <EditorIcon name="cancel" size={18} style={{ color: "#C62828", flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end",
          padding: "12px 20px 20px", borderTop: "1px solid #E6E5E3",
        }}>
          <button className="settings-btn--connect" onClick={onClose}>
            Uppfattat
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type ViewState = "list" | "detail" | "invite";

export function UsersContent({ onSubTitleChange, triggerInvite, onHeaderExtraChange, onHeaderActionChange }: UsersContentProps) {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);
  const [view, setView] = useState<ViewState>("list");

  // Invite state
  const [inviteRole, setInviteRole] = useState<"org:admin" | "org:member">("org:member");
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResults, setInviteResults] = useState<InviteEmailResult[] | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState<"org:admin" | "org:member" | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showChangeRoleModal, setShowChangeRoleModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);

  // Bulk action state
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkRoleQueue, setBulkRoleQueue] = useState<OrgUser[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  useEffect(() => {
    getOrganisationUsers().then((data) => {
      setUsers(data);
      setLoading(false);
    });
  }, []);

  // Listen for invite trigger from parent
  useEffect(() => {
    if (triggerInvite && triggerInvite > 0) {
      setView("invite");
      setInviteRole("org:member");
      setInviteEmails([]);
      setInviteInput("");
      setInviteError(null);
      setInviteResults(null);
      onSubTitleChange?.("Lägg till användare");
      onHeaderExtraChange?.(null);
      onHeaderActionChange?.(null);
    }
  }, [triggerInvite, onSubTitleChange]);

  const allChecked = users.length > 0 && checkedIds.size === users.length;

  function toggleAll(v: boolean) {
    setCheckedIds(v ? new Set(users.map((u) => u.id)) : new Set());
  }

  function toggleOne(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadUsers() {
    const data = await getOrganisationUsers();
    setUsers(data);
  }

  function selectUser(user: OrgUser) {
    const s = STATUS_MAP[user.status] ?? STATUS_MAP.active;
    setSelectedUser(user);
    setView("detail");
    setShowActionsMenu(false);
    setShowChangeRoleModal(false);
    setShowDeleteConfirm(false);
    onSubTitleChange?.(displayName(user));
    onHeaderExtraChange?.(
      <span className={`users-status ${s.className}`} style={{ marginLeft: 8 }}>
        {s.label}
      </span>
    );
    onHeaderActionChange?.(
      <button
        className="users-actions-btn"
        id="users-actions-trigger"
        style={{ marginLeft: "auto" }}
        onClick={() => setShowActionsMenu((v) => !v)}
      >
        Åtgärder
        <EditorIcon name="expand_more" size={18} />
      </button>
    );
  }

  async function handleResendInvitation() {
    if (!selectedUser) return;
    setIsActionLoading(true);
    await resendInvitation(selectedUser.id, selectedUser.email, selectedUser.role);
    setIsActionLoading(false);
    setShowActionsMenu(false);
  }

  async function handleRemoveUser() {
    if (!selectedUser) return;
    setIsActionLoading(true);
    await removeUser(selectedUser.id, selectedUser.status);
    await loadUsers();
    setIsActionLoading(false);
    setShowDeleteConfirm(false);
    setView("list");
    onSubTitleChange?.(null);
    onHeaderExtraChange?.(null);
    onHeaderActionChange?.(null);
  }

  async function handleChangeRole() {
    if (!selectedUser) return;
    const newRole = selectedUser.role === "org:admin" ? "org:member" as const : "org:admin" as const;
    setIsActionLoading(true);
    const result = await changeUserRole(selectedUser.id, newRole);
    if (result.ok) {
      const data = await getOrganisationUsers();
      setUsers(data);
      const updated = data.find((u) => u.id === selectedUser.id);
      if (updated) {
        selectUser(updated);
      }
    }
    setIsActionLoading(false);
    setShowChangeRoleModal(false);
  }

  // ── Bulk action handlers ─────────────────────────────────

  const checkedUsers = users.filter((u) => checkedIds.has(u.id));

  async function handleBulkDelete() {
    setIsBulkLoading(true);
    await Promise.allSettled(
      checkedUsers.map((u) => removeUser(u.id, u.status)),
    );
    await loadUsers();
    setIsBulkLoading(false);
    setShowBulkDelete(false);
    setCheckedIds(new Set());
  }

  function startBulkRoleChange() {
    // Only active users can have their role changed
    const activeChecked = checkedUsers.filter((u) => u.status === "active");
    if (activeChecked.length === 0) return;
    setBulkRoleQueue([...activeChecked]);
  }

  async function handleBulkRoleStep() {
    const current = bulkRoleQueue[0];
    if (!current) return;
    setIsBulkLoading(true);
    const newRole = current.role === "org:admin" ? "org:member" as const : "org:admin" as const;
    await changeUserRole(current.id, newRole);
    setIsBulkLoading(false);
    const remaining = bulkRoleQueue.slice(1);
    if (remaining.length === 0) {
      setBulkRoleQueue([]);
      await loadUsers();
      setCheckedIds(new Set());
    } else {
      setBulkRoleQueue(remaining);
    }
  }

  // ── Invite helpers ──────────────────────────────────────

  function tryAddEmails(raw: string) {
    setInviteError(null);
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const valid: string[] = [];
    for (const part of parts) {
      if (!EMAIL_RE.test(part)) {
        setInviteError(`"${part}" är inte en giltig e-postadress`);
        return;
      }
      if (!inviteEmails.includes(part) && !valid.includes(part)) {
        valid.push(part);
      }
    }
    if (valid.length > 0) {
      setInviteEmails((prev) => [...prev, ...valid]);
    }
    setInviteInput("");
  }

  function handleInviteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inviteInput.trim()) {
        tryAddEmails(inviteInput);
      }
    }
  }

  function handleInviteInputChange(value: string) {
    setInviteError(null);
    // If user types a comma, try to add
    if (value.includes(",")) {
      tryAddEmails(value);
    } else {
      setInviteInput(value);
    }
  }

  function removeEmail(email: string) {
    setInviteEmails((prev) => prev.filter((e) => e !== email));
  }

  const inputHasValidEmail = EMAIL_RE.test(inviteInput.trim());
  const canSend = inviteEmails.length > 0 || inputHasValidEmail;

  async function handleSendInvites() {
    setIsSending(true);
    setInviteError(null);
    setInviteResults(null);

    // Collect all emails
    const allEmails = [...inviteEmails];
    if (inviteInput.trim() && EMAIL_RE.test(inviteInput.trim())) {
      allEmails.push(inviteInput.trim());
    }

    const result = await inviteUsers(allEmails, inviteRole);
    setIsSending(false);

    if (result.ok && result.results) {
      const hasFailures = result.results.some((r) => !r.ok);
      if (hasFailures) {
        // Show per-email results so user can see which failed
        setInviteResults(result.results);
      } else {
        // All succeeded — navigate back to list
        await loadUsers();
        setView("list");
        onSubTitleChange?.(null);
        onHeaderActionChange?.(null);
      }
    } else if (result.ok) {
      await loadUsers();
      setView("list");
      onSubTitleChange?.(null);
      onHeaderActionChange?.(null);
    } else {
      setInviteError(result.error ?? "Något gick fel");
      if (result.results) setInviteResults(result.results);
    }
  }

  // ── Loading skeleton ──────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 0 }}>
        <div style={{ borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center",
            padding: "8px 16px",
            background: "var(--admin-surface-hover)",
            borderBottom: "1px solid var(--admin-border)",
            fontSize: 14, fontWeight: 450,
            color: "var(--admin-text-secondary)",
          }}>
            <span style={{ width: 28, flexShrink: 0 }} />
            <span style={{ width: 240, flexShrink: 0, paddingLeft: 12 }}>Användare</span>
            <span style={{ width: 110, flexShrink: 0, paddingLeft: 20 }}>Status</span>
            <span style={{ width: 150, flexShrink: 0, marginLeft: "auto", textAlign: "left" as const }}>Roll</span>
          </div>
          {[1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--admin-border)" }}>
              <span style={{ width: 28, flexShrink: 0 }} />
              <span style={{ width: 240, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, paddingLeft: 12 }}>
                <div className="skel" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                <div>
                  <div className="skel skel--text" style={{ width: 120, height: 14, marginBottom: 4 }} />
                  <div className="skel skel--text" style={{ width: 160, height: 11 }} />
                </div>
              </span>
              <span style={{ width: 110, flexShrink: 0, paddingLeft: 20 }}>
                <div className="skel skel--text" style={{ width: 50, height: 14 }} />
              </span>
              <span style={{ width: 150, flexShrink: 0, marginLeft: "auto" }}>
                <div className="skel skel--text" style={{ width: 50, height: 14 }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Invite view ─────────────────────────────────────────

  if (view === "invite") {
    return (
      <div>
        {/* Role selector */}
        <label className="admin-label" style={{ marginBottom: 10 }}>Välj roll</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            className={`users-role-btn ${inviteRole === "org:admin" ? "users-role-btn--active" : ""}`}
            onClick={() => setInviteRole("org:admin")}
          >
            <span className="users-role-btn__label">Admin</span>
            <span className="users-role-btn__desc">
              Full kontroll över organisation och portal.{" "}
              <span className="users-role-btn__link" onClick={(e) => { e.stopPropagation(); setShowRoleModal("org:admin"); }}>Läs mer</span>
            </span>
          </button>
          <button
            className={`users-role-btn ${inviteRole === "org:member" ? "users-role-btn--active" : ""}`}
            onClick={() => setInviteRole("org:member")}
          >
            <span className="users-role-btn__label">Medlem</span>
            <span className="users-role-btn__desc">
              Daglig användning av systemet.{" "}
              <span className="users-role-btn__link" onClick={(e) => { e.stopPropagation(); setShowRoleModal("org:member"); }}>Läs mer</span>
            </span>
          </button>
        </div>

        {/* Added emails */}
        {inviteEmails.length > 0 && (
          <div style={{ margin: "0 -16px", marginBottom: 0 }}>
            {inviteEmails.map((email) => (
              <div key={email} className="users-invite-email-row">
                <span style={{ fontSize: 14, color: "var(--admin-text)" }}>{email}</span>
                <button
                  className="users-invite-email-remove"
                  onClick={() => removeEmail(email)}
                  aria-label={`Ta bort ${email}`}
                >
                  <EditorIcon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Email input */}
        <div style={{ marginTop: inviteEmails.length > 0 ? 16 : 0 }}>
          <input
            type="text"
            value={inviteInput}
            onChange={(e) => handleInviteInputChange(e.target.value)}
            onKeyDown={handleInviteKeyDown}
            placeholder="E-postadresser"
            className="admin-float-input"
            style={{ padding: "10px 12px", width: "100%" }}
          />
        </div>

        {/* Error */}
        {inviteError && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 10,
            background: "#FBE9E7", color: "#C62828",
            fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <EditorIcon name="error" size={18} />
            {inviteError}
          </div>
        )}

        {/* Per-email invite results */}
        {inviteResults && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            {inviteResults.map((r) => (
              <div key={r.email} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 8,
                background: r.ok ? "#ddf4e4" : "#FBE9E7",
                fontSize: 13, fontWeight: 500,
              }}>
                <EditorIcon name={r.ok ? "check_circle" : "cancel"} size={16}
                  style={{ color: r.ok ? "#1a7f37" : "#C62828", flexShrink: 0 }} />
                <span style={{ color: r.ok ? "#1a7f37" : "#C62828" }}>{r.email}</span>
                {r.error && (
                  <span style={{ color: "#C62828", fontWeight: 400, marginLeft: "auto", fontSize: 12 }}>
                    {r.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            className="settings-btn--connect"
            disabled={!canSend || isSending}
            onClick={handleSendInvites}
          >
            <ButtonSpinner visible={isSending} />
            Lägg till
          </button>
        </div>

        <RoleInfoModal
          role={showRoleModal}
          onClose={() => setShowRoleModal(null)}
        />
      </div>
    );
  }

  // ── User detail view ──────────────────────────────────────

  if (view === "detail" && selectedUser) {
    return (
      <>
        {/* Profile card */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {selectedUser.imageUrl ? (
              <img
                src={selectedUser.imageUrl}
                alt=""
                style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: "var(--admin-accent)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 600,
              }}>
                {(selectedUser.firstName?.[0] ?? selectedUser.email[0])?.toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)" }}>
                {displayName(selectedUser)}
              </div>
              {showEmail(selectedUser) && (
                <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 1 }}>
                  {selectedUser.email}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Role card */}
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 12 }}>
            Roll
          </h4>
          <div style={{ fontSize: 14, color: "var(--admin-text-secondary)" }}>
            {selectedUser.roleName}
          </div>
        </div>

        {/* Actions dropdown */}
        {showActionsMenu && createPortal(
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 8999 }} onClick={() => setShowActionsMenu(false)} />
            <ul style={{
              position: "fixed",
              top: (document.getElementById("users-actions-trigger")?.getBoundingClientRect().bottom ?? 0) + 4,
              right: document.documentElement.clientWidth - (document.getElementById("users-actions-trigger")?.getBoundingClientRect().right ?? 0),
              width: 130,
              background: "var(--admin-surface)",
              borderRadius: 12,
              padding: 5,
              margin: 0,
              listStyle: "none",
              zIndex: 9000,
              boxShadow: "0px 0px 0px 1px rgba(64, 87, 109, .04), 0px 6px 20px -4px rgba(64, 87, 109, .3)",
              animation: ".12s ease both admin-dropdown-in",
            }}>
              {selectedUser.status === "pending" ? (
                <>
                  <li>
                    <button className="admin-dropdown__item" onClick={handleResendInvitation}>
                      <EditorIcon name="send" size={18} style={{ color: "var(--admin-text-secondary)" }} />
                      <span style={{ flex: 1 }}>Skicka inbjudan igen</span>
                    </button>
                  </li>
                  <li>
                    <button className="admin-dropdown__item" style={{ color: "var(--admin-danger)" }} onClick={() => { setShowActionsMenu(false); setShowDeleteConfirm(true); }}>
                      <EditorIcon name="delete" size={18} />
                      <span style={{ flex: 1 }}>Ta bort</span>
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button className="admin-dropdown__item" onClick={() => { setShowActionsMenu(false); setShowChangeRoleModal(true); }}>
                      <EditorIcon name="swap_horiz" size={18} style={{ color: "var(--admin-text-secondary)" }} />
                      <span style={{ flex: 1 }}>Ändra roll</span>
                    </button>
                  </li>
                  <li>
                    <button className="admin-dropdown__item" style={{ color: "var(--admin-danger)" }} onClick={() => { setShowActionsMenu(false); setShowDeleteConfirm(true); }}>
                      <EditorIcon name="delete" size={18} />
                      <span style={{ flex: 1 }}>Ta bort</span>
                    </button>
                  </li>
                </>
              )}
            </ul>
          </>,
          document.body,
        )}

        {/* Change role modal */}
        {showChangeRoleModal && (() => {
          const newRole = selectedUser.role === "org:admin" ? "org:member" as const : "org:admin" as const;
          const newRoleName = newRole === "org:admin" ? "Admin" : "Medlem";
          const items = newRole === "org:admin" ? ADMIN_CAN : MEMBER_CAN;

          return createPortal(
            <div
              style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setShowChangeRoleModal(false)}
            >
              <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
              <div
                style={{
                  position: "relative", zIndex: 1, background: "var(--admin-surface)",
                  borderRadius: 16, width: 440, maxHeight: "80vh", display: "flex", flexDirection: "column",
                  animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
                  padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
                }}>
                  <h3 style={{ fontSize: 17, fontWeight: 600 }}>Ändra till {newRoleName}</h3>
                  <button
                    onClick={() => setShowChangeRoleModal(false)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-secondary)" }}
                    aria-label="Stäng"
                  >
                    <EditorIcon name="close" size={20} />
                  </button>
                </div>
                <div style={{ padding: "16px 20px", overflowY: "auto" }}>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {items.map((item) => (
                      <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--admin-text)" }}>
                        <EditorIcon name="check" size={18} style={{ color: "#1a7f37", flexShrink: 0 }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {newRole === "org:member" && (
                    <>
                      <div style={{ height: 1, background: "#E6E5E3", margin: "14px 0" }} />
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        {MEMBER_CANNOT.map((item) => (
                          <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--admin-text-secondary)" }}>
                            <EditorIcon name="cancel" size={18} style={{ color: "#C62828", flexShrink: 0 }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 20px 20px", borderTop: "1px solid #E6E5E3" }}>
                  <button className="settings-btn--connect" disabled={isActionLoading} onClick={handleChangeRole}>
                    <ButtonSpinner visible={isActionLoading} />
                    Ändra roll
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        })()}

        {/* Delete confirm modal */}
        {showDeleteConfirm && createPortal(
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setShowDeleteConfirm(false)}
          >
            <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
            <div
              style={{
                position: "relative", zIndex: 1, background: "var(--admin-surface)",
                borderRadius: 16, padding: 24, width: 380,
                animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
                {selectedUser.status === "pending" ? "Ta bort inbjudan?" : "Ta bort användare?"}
              </h3>
              <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
                {selectedUser.status === "pending"
                  ? `Inbjudan till ${selectedUser.email} tas bort.`
                  : `${displayName(selectedUser)} tas bort från organisationen.`}
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="settings-btn--outline" onClick={() => setShowDeleteConfirm(false)}>Avbryt</button>
                <button className="settings-btn--danger-solid" disabled={isActionLoading} onClick={handleRemoveUser}>
                  <ButtonSpinner visible={isActionLoading} />
                  Ta bort
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  // ── User list view ────────────────────────────────────────

  return (
    <div style={{ padding: 0 }}>
      {/* Table */}
      <div style={{ borderRadius: 10, overflow: "hidden" }}>
        {/* Table header — switches to selection mode when checkboxes are checked */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "8px 16px",
          height: 43,
          background: checkedIds.size > 0 ? "#fff" : "var(--admin-surface-hover)",
          borderBottom: "1px solid var(--admin-border)",
          fontSize: 14, fontWeight: 450,
          color: "var(--admin-text-secondary)",
          transition: "background 0.15s ease",
        }}>
          <span style={{ width: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckBox checked={allChecked} onChange={toggleAll} />
          </span>
          {checkedIds.size > 0 ? (
            <>
              <span style={{ paddingLeft: 12, fontWeight: 600, color: "var(--admin-text)", fontSize: 13 }}>
                {checkedIds.size} har valts
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button
                  className="users-bulk-btn users-bulk-btn--delete"
                  onClick={() => setShowBulkDelete(true)}
                >
                  Ta bort
                </button>
              </div>
            </>
          ) : (
            <>
              <span style={{ width: 240, flexShrink: 0, display: "flex", alignItems: "center", gap: 16, minWidth: 0, paddingLeft: 12 }}>Användare</span>
              <span style={{ width: 110, flexShrink: 0, paddingLeft: 20 }}>Status</span>
              <span style={{ width: 150, flexShrink: 0, marginLeft: "auto", textAlign: "left" as const }}>Roll</span>
            </>
          )}
        </div>

        {/* Rows */}
        {users.map((user, i) => {
          const status = STATUS_MAP[user.status] ?? STATUS_MAP.active;

          return (
            <div
              key={user.id}
              className="users-row"
              onClick={() => {
                selectUser(user);
              }}
              style={{
                display: "flex", alignItems: "center",
                padding: "10px 16px",
                cursor: "pointer",
                borderBottom: i < users.length - 1 ? "1px solid var(--admin-border)" : "none",
              }}
            >
              <span
                style={{ width: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={(e) => e.stopPropagation()}
              >
                <CheckBox checked={checkedIds.has(user.id)} onChange={() => toggleOne(user.id)} />
              </span>

              <span style={{ width: 240, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, minWidth: 0, paddingLeft: 12 }}>
                {user.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt=""
                    style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: "#E8DBF2", color: "#6C3B91",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 500,
                  }}>
                    {(user.firstName?.[0] ?? user.email[0])?.toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName(user)}
                  </div>
                  {showEmail(user) && (
                    <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.email}
                    </div>
                  )}
                </div>
              </span>

              <span style={{ width: 110, flexShrink: 0, paddingLeft: 20 }}>
                <span className={`users-status ${status.className}`}>
                  {status.label}
                </span>
              </span>

              <span style={{ width: 150, flexShrink: 0, marginLeft: "auto", textAlign: "left" as const, fontSize: 14, color: "#303030", lineHeight: "1em" }}>
                {user.roleName}
              </span>
            </div>
          );
        })}

        {/* Empty state */}
        {users.length === 0 && (
          <div style={{
            padding: "32px 16px",
            textAlign: "center",
            color: "var(--admin-text-secondary)",
            fontSize: 14,
          }}>
            Inga användare hittades
          </div>
        )}
      </div>

      {/* Bulk delete confirmation modal */}
      {showBulkDelete && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowBulkDelete(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, padding: 24, width: 380,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Ta bort {checkedIds.size} {checkedIds.size === 1 ? "användare" : "användare"}?
            </h3>
            <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
              {checkedIds.size === 1
                ? `${displayName(checkedUsers[0])} tas bort från organisationen.`
                : `${checkedIds.size} användare tas bort från organisationen. Detta går inte att ångra.`}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowBulkDelete(false)}>Avbryt</button>
              <button className="settings-btn--danger-solid" disabled={isBulkLoading} onClick={handleBulkDelete}>
                <ButtonSpinner visible={isBulkLoading} />
                Ta bort
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Bulk role change modal — one user at a time */}
      {bulkRoleQueue.length > 0 && (() => {
        const current = bulkRoleQueue[0];
        const newRole = current.role === "org:admin" ? "org:member" as const : "org:admin" as const;
        const newRoleName = newRole === "org:admin" ? "admin" : "medlem";
        const items = newRole === "org:admin" ? ADMIN_CAN : MEMBER_CAN;

        return createPortal(
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setBulkRoleQueue([])}
          >
            <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
            <div
              style={{
                position: "relative", zIndex: 1, background: "var(--admin-surface)",
                borderRadius: 16, width: 440, maxHeight: "80vh", display: "flex", flexDirection: "column",
                animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
                padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
              }}>
                <h3 style={{ fontSize: 17, fontWeight: 600 }}>
                  Gör {displayName(current)} till {newRoleName}
                </h3>
                <button
                  onClick={() => setBulkRoleQueue([])}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-secondary)" }}
                  aria-label="Stäng"
                >
                  <EditorIcon name="close" size={20} />
                </button>
              </div>
              <div style={{ padding: "16px 20px", overflowY: "auto" }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--admin-text)" }}>
                      <EditorIcon name="check" size={18} style={{ color: "#1a7f37", flexShrink: 0 }} />
                      {item}
                    </li>
                  ))}
                </ul>
                {newRole === "org:member" && (
                  <>
                    <div style={{ height: 1, background: "#E6E5E3", margin: "14px 0" }} />
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      {MEMBER_CANNOT.map((item) => (
                        <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--admin-text-secondary)" }}>
                          <EditorIcon name="cancel" size={18} style={{ color: "#C62828", flexShrink: 0 }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 20px 20px", borderTop: "1px solid #E6E5E3",
              }}>
                <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                  {bulkRoleQueue.length > 1 ? `${bulkRoleQueue.length - 1} kvar` : ""}
                </span>
                <button className="settings-btn--connect" disabled={isBulkLoading} onClick={handleBulkRoleStep}>
                  <ButtonSpinner visible={isBulkLoading} />
                  Ändra roll
                </button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
