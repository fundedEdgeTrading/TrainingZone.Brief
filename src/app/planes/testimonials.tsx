// Testimonios de ejemplo (encargo del cliente, punto 3): nombres de persona y
// de gimnasio inventados a propósito, sin coincidir con marcas reales ni con
// "TrainingZone" — se sustituyen por testimonios reales cuando existan.
const TESTIMONIALS = [
  {
    quote:
      "El Semáforo de Aptitud nos avisa antes de que un socio esté a punto de darse de baja. Hemos recortado las bajas evitables en un mismo trimestre.",
    name: "Marta Osuna",
    role: "Directora, Vértice Studio",
  },
  {
    quote:
      "Pasamos de tres hojas de cálculo a una sola pantalla: agenda, cobros y CRM de leads están donde tienen que estar.",
    name: "Iñaki Etxeberria",
    role: "Gerente, Pulso Fitness",
  },
  {
    quote:
      "El portal del socio y la app han recortado a la mitad las llamadas a recepción. Nuestro equipo entrena, no contesta el teléfono.",
    name: "Laura Prado",
    role: "Coordinadora, Box Cardal",
  },
];

export default function Testimonials() {
  return (
    <section className="mb-14">
      <h2 className="font-display font-extrabold text-xl sm:text-2xl uppercase tracking-[-.01em] text-tz-black text-center mb-2">
        Así lo cuentan equipos como el tuyo
      </h2>
      <p className="text-center text-sm text-muted mb-8 max-w-xl mx-auto">
        Ejemplos de lo que un centro puede conseguir con Apta.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name} className="bg-white border border-tz-linen rounded-card p-5 flex flex-col">
            <blockquote className="text-[14px] text-brand-text-2 flex-1">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="mt-4 text-[13px]">
              <span className="block font-semibold text-tz-black">{t.name}</span>
              <span className="block text-muted">{t.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
