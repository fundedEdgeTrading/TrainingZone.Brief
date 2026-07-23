import type { MemberAnnouncement } from "@/lib/announcements-queries";

const CATEGORY_LABEL: Record<string, string> = { NEWS: "Novedad", EVENT: "Evento", PROMO: "Promoción", ALERT: "Aviso" };
const CATEGORY_TONE: Record<string, string> = {
  NEWS: "bg-white/15 text-white",
  EVENT: "bg-[#cfe5ff] text-[#1c4e80]",
  PROMO: "bg-[#ffe3bf] text-[#8a5a12]",
  ALERT: "bg-[#ffd6d0] text-[#8a3420]",
};

export function AnnouncementsBanner({ announcements }: { announcements: MemberAnnouncement[] }) {
  if (announcements.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 tz-fade-up" style={{ animationDelay: "0.02s" }}>
      {announcements.map((a) => (
        <div
          key={a.id}
          className="relative overflow-hidden bg-brand-ink rounded-[18px] border border-brand-border flex flex-col sm:flex-row"
        >
          {a.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.imageUrl} alt="" className="w-full sm:w-56 h-40 sm:h-auto object-cover shrink-0" />
          )}
          <div className="p-5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-[11px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-0.5 ${CATEGORY_TONE[a.category] ?? "bg-white/15 text-white"}`}>
                {CATEGORY_LABEL[a.category] ?? a.category}
              </span>
              {a.pinned && (
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-0.5 bg-tz-bone text-tz-black">
                  Destacado
                </span>
              )}
            </div>
            <div className="font-display font-extrabold text-xl text-white uppercase tracking-[-.01em]">
              {a.title}
            </div>
            {a.body && <p className="text-sm text-brand-muted-2 mt-1.5 max-w-2xl">{a.body}</p>}
            {a.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {a.tags.map((t) => (
                  <span key={t} className="text-[11px] rounded-full px-2 py-0.5 bg-white/10 text-brand-muted-2">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
