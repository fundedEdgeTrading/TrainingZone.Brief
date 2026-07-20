"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { resolveNotificationAction } from "./notifications-actions";

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
};

const ENTITY_HREF: Record<string, (id: string) => string> = {
  Lead: (id) => `/leads/${id}`,
  Member: (id) => `/members/${id}`,
  PersonalizedOffer: () => `/offers`,
};

export function NotificationBell({ notifications }: { notifications: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [items, setItems] = useState(notifications);

  function resolve(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    startTransition(async () => {
      const result = await resolveNotificationAction(id);
      if (!result.ok) toast.error("No se pudo resolver la notificación.");
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        className="relative flex items-center justify-center w-10 h-10 rounded-[10px] border border-brand-border bg-white text-brand-text transition-colors duration-150 hover:bg-tz-bone"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-critical text-white text-[10px] font-bold flex items-center justify-center">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 mt-2 w-[340px] max-h-[420px] overflow-y-auto bg-white border border-brand-border rounded-2xl shadow-pop z-50">
            <div className="px-4 py-3 border-b border-tz-sand font-display font-bold text-xs uppercase tracking-[.08em] text-brand-muted">
              Notificaciones
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-brand-muted p-4">Sin pendientes.</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const href = n.entityType && n.entityId ? ENTITY_HREF[n.entityType]?.(n.entityId) : undefined;
                  const content = (
                    <div className="px-4 py-3 border-b border-tz-sand last:border-0 hover:bg-tz-bone/50 transition-colors">
                      <p className="text-sm font-semibold text-brand-text">{n.title}</p>
                      {n.body && <p className="text-xs text-brand-text-2 mt-0.5">{n.body}</p>}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-faint">{new Date(n.createdAt).toLocaleDateString("es-ES")}</span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={(e) => {
                            e.preventDefault();
                            resolve(n.id);
                          }}
                          className="text-[11px] font-bold uppercase text-brand-muted hover:text-brand-text"
                        >
                          Resolver
                        </button>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {href ? (
                        <Link href={href} onClick={() => setOpen(false)}>
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
