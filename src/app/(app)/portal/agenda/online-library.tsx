type Workout = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  level: string;
  durationMin: number;
  thumbnailUrl: string | null;
  videoUrl: string;
};

const LEVEL_TONE: Record<string, string> = {
  Principiante: "bg-[#e9f9ef] text-good",
  Intermedio: "bg-[#fff2e0] text-[#8a5a12]",
  Avanzado: "bg-[#fdecea] text-critical",
};

export function OnlineWorkoutLibrary({ workouts }: { workouts: Workout[] }) {
  if (workouts.length === 0) {
    return (
      <div className="bg-brand-card border border-brand-border rounded-2xl p-8 text-center text-sm text-brand-muted">
        Tu entrenador está preparando tus entrenamientos online. Vuelve pronto.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      {workouts.map((w) => (
        <a
          key={w.id}
          href={w.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group bg-brand-card border border-brand-border rounded-2xl overflow-hidden shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-hover"
        >
          <div className="relative h-36 bg-brand-ink overflow-hidden">
            {w.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={w.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-tz-bone/40 font-display font-extrabold text-4xl uppercase">
                {w.category}
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-tz-black text-lg transition-transform duration-200 group-hover:scale-110">
                ▶
              </span>
            </span>
            <span className="absolute bottom-2 right-2 bg-tz-black/75 text-white text-xs font-semibold rounded-full px-2 py-0.5">
              {w.durationMin} min
            </span>
          </div>
          <div className="p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-0.5 bg-brand-subtle text-brand-text">
                {w.category}
              </span>
              <span className={`text-[11px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-0.5 ${LEVEL_TONE[w.level] ?? "bg-brand-subtle text-brand-muted"}`}>
                {w.level}
              </span>
            </div>
            <div className="font-bold text-brand-text">{w.title}</div>
            {w.description && <p className="text-[13px] text-brand-muted line-clamp-2">{w.description}</p>}
          </div>
        </a>
      ))}
    </div>
  );
}
