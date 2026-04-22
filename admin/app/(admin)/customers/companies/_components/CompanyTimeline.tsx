"use client";

/**
 * CompanyTimeline — tidslinje för företagsdetaljsida.
 *
 * Speglar `.ord-tl`-layouten (kommentarsfält överst + `.ord-tl-track` med
 * events grupperade per dag). Använder samma CSS-klasser som
 * CustomerDetailClient/OrderDetailClient så det visuella uttrycket är
 * identiskt. Inga regressioner mot existerande tidslinje-CSS.
 *
 * Persistence: skriv via addCompanyCommentAction → CompanyEvent-tabellen
 * (new table från migration add_company_events). Mentions och Clerk-avatar-
 * uppslag är scope för senare iteration — denna första version har alltid
 * neutral person-ikon som avatar och ingen @-mention-picker.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { addCompanyCommentAction } from "../actions";

type Metadata = Record<string, unknown> | null;

interface CompanyEventRow {
  id: string;
  type: string;
  message: string | null;
  metadata: Metadata;
  actorUserId: string | null;
  createdAt: string;
}

interface Props {
  companyId: string;
  events: CompanyEventRow[];
}

export function CompanyTimeline({ companyId, events }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [commentPending, setCommentPending] = useState(false);

  function submitComment() {
    if (!comment.trim() || commentPending) return;
    setCommentPending(true);
    startTransition(async () => {
      const result = await addCompanyCommentAction(companyId, comment);
      setCommentPending(false);
      if (result.ok) {
        setComment("");
        router.refresh();
      }
    });
  }

  // Group events by date — identisk algoritm med CustomerDetailClient.
  const groups: { date: string; label: string; events: CompanyEventRow[] }[] = [];
  for (const event of events) {
    const d = new Date(event.createdAt);
    const dateKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("sv-SE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.date === dateKey) {
      last.events.push(event);
    } else {
      groups.push({ date: dateKey, label, events: [event] });
    }
  }

  return (
    <div className="ord-tl">
      {/* Kommentarsfält */}
      <div className="ord-tl-comment">
        <div className="ord-tl-comment__body">
          <div className="ord-tl-comment__input-wrap">
            <div className="ord-tl-comment__avatar">
              <EditorIcon name="person" size={16} />
            </div>
            <div className="ord-tl-comment__input-row">
              <textarea
                className="ord-tl-comment__input"
                placeholder="Lämna en kommentar..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = el.scrollHeight + "px";
                }}
              />
            </div>
          </div>
          <div className="ord-tl-comment__toolbar">
            <div className="ord-tl-comment__tools" />
            <button
              type="button"
              className={`ord-tl-comment__publish${comment.trim() ? " ord-tl-comment__publish--active" : ""}`}
              disabled={!comment.trim() || commentPending}
              onClick={submitComment}
            >
              Publicera
            </button>
          </div>
        </div>
        <div className="ord-tl-comment__hint">
          Endast du och annan personal kan se kommentarer
        </div>
      </div>

      {/* Events grouped by date */}
      <div className="ord-tl-track">
        {groups.map((group) => (
          <div key={group.date} className="ord-tl-group">
            <div className="ord-tl-group__date">{group.label}</div>
            {group.events.map((event) => {
              const isComment = event.type === "COMMENT_ADDED";
              const meta = event.metadata as Record<string, unknown> | null;
              const authorName =
                (meta?.authorName as string | undefined) ?? null;
              const time = new Date(event.createdAt).toLocaleTimeString(
                "sv-SE",
                { hour: "2-digit", minute: "2-digit" },
              );

              if (isComment) {
                return (
                  <div key={event.id} className="ord-tl-event">
                    <div className="ord-tl-event__dot" />
                    <div className="ord-tl-comment-card">
                      <div className="ord-tl-comment-card__header">
                        <div className="ord-tl-comment-card__avatar">
                          <EditorIcon name="person" size={18} />
                        </div>
                        <div className="ord-tl-comment-card__meta">
                          <div className="ord-tl-comment-card__name-row">
                            <span className="ord-tl-comment-card__name">
                              {authorName ?? "Personal"}
                            </span>
                            <span className="ord-tl-comment-card__time">
                              {time}
                            </span>
                          </div>
                          <div className="ord-tl-comment-card__body">
                            {event.message}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={event.id} className="ord-tl-event">
                  <div className="ord-tl-event__dot" />
                  <div className="ord-tl-event__body">
                    {authorName && (
                      <span className="ord-tl-event__actor">
                        {authorName} ·{" "}
                      </span>
                    )}
                    <span>{event.message ?? event.type}</span>
                  </div>
                  <span className="ord-tl-event__time">{time}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
