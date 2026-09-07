/**
 * E9-13 · Se toma la opción B: **desatribuir por completo**.
 *
 * Lo que había eran tres citas firmadas con nombre de persona, cargo y empresa,
 * inventadas —el propio comentario del fichero lo reconocía— y con el único
 * descargo en un subtítulo genérico DEBAJO. Eso es una reseña falsa a efectos
 * de la Ley 3/1991 tras la Directiva Ómnibus, que prohíbe expresamente afirmar
 * que las reseñas proceden de consumidores que han usado el producto sin haber
 * hecho nada por comprobarlo. Y, en SEO, destruye el E-E-A-T de la única página
 * comercial que hay.
 *
 * Sin término medio: no quedan ni nombres, ni cargos, ni empresas. Lo que queda
 * son escenarios de uso, rotulados como tales ENCIMA y no debajo, porque el
 * descargo que llega después de leer la cita no descarga nada.
 *
 * Cuando haya consentimiento por escrito de tres clientes piloto se publican con
 * su nombre real, y este fichero vuelve a tener `figcaption`.
 */
const SCENARIOS = [
  {
    title: "Retención",
    body: "El Semáforo de Aptitud avisa antes de que un socio esté a punto de darse de baja, con tiempo para llamarle en vez de para lamentarlo.",
  },
  {
    title: "Una sola pantalla",
    body: "Agenda, cobros y CRM de leads dejan de estar repartidos en tres hojas de cálculo que nadie actualiza a la vez.",
  },
  {
    title: "Menos teléfono",
    body: "El portal del socio y la app absorben las reservas y los cambios de plan, y recepción deja de ser una centralita.",
  },
];

export default function Testimonials() {
  return (
    <section className="mb-14">
      <h2 className="font-display font-extrabold text-xl sm:text-2xl uppercase tracking-[-.01em] text-tz-black text-center mb-2">
        Para qué lo usan los centros
      </h2>
      {/* El rótulo va ENCIMA: un descargo debajo de la cita llega cuando ya se
          ha leído como si fuera de alguien. */}
      <p className="text-center text-[13px] font-semibold text-brand-text-2 mb-2 max-w-xl mx-auto">
        Escenarios de uso descritos por Apta. No son testimonios de clientes.
      </p>
      <p className="text-center text-sm text-muted mb-8 max-w-xl mx-auto">
        Publicaremos testimonios reales, con nombre y apellidos, cuando los primeros centros nos den permiso por escrito
        para hacerlo.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <div key={s.title} className="bg-white border border-tz-linen rounded-card p-5 flex flex-col">
            <h3 className="font-display font-extrabold text-[15px] uppercase tracking-[-.01em] text-tz-black">
              {s.title}
            </h3>
            <p className="text-[14px] text-brand-text-2 mt-2 flex-1">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
