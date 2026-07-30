// Respuestas ancladas a las decisiones cerradas del catálogo comercial
// (docs/PLAN_IMPLEMENTACION_APTA_COMERCIAL.md §1, D-8 a D-12): no prometen
// nada que el producto no haga todavía (p. ej. cancelación de autoservicio).
const FAQS: { q: string; a: string }[] = [
  {
    q: "¿Puedo cambiar de plan más adelante?",
    a: "Sí. Desde tu cuenta puedes cambiar de plan cuando quieras: eliges el nuevo plan, confirmas el pago y el cambio se aplica al momento.",
  },
  {
    q: "¿Qué pasa si tengo más de un centro?",
    a: "El precio de Apta escala por número de centros, no por número de socios: cuantos más socios des de alta, mejor para ti. Esencial incluye 1 centro, Avanzado hasta 3 y Élite centros ilimitados.",
  },
  {
    q: "¿Cómo cobro yo a mis socios?",
    a: "Conectas tu propia cuenta de Stripe y el dinero va directo a ti. Apta no aplica ninguna comisión sobre esos cobros ni interviene en tu contabilidad: es solo licencia de software.",
  },
  {
    q: "¿Hay prueba gratuita?",
    a: "No. Empiezas a operar en cuanto completas el pago del plan que elijas, sin periodo de prueba previo.",
  },
  {
    q: "¿Hay permanencia?",
    a: "No hay permanencia obligatoria. Esencial, Avanzado y Élite son suscripciones (mensual o anual) que se renuevan automáticamente; el plan Fundador es un pago único, sin cuota recurrente.",
  },
];

export default function Faq() {
  return (
    <section className="mb-14">
      <h2 className="font-display font-extrabold text-xl sm:text-2xl uppercase tracking-[-.01em] text-tz-black text-center mb-2">
        Preguntas frecuentes
      </h2>
      <p className="text-center text-sm text-muted mb-8 max-w-xl mx-auto">
        Lo que más nos preguntan antes de contratar.
      </p>
      <div className="max-w-2xl mx-auto space-y-2.5">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="group bg-white border border-tz-linen rounded-card px-5 py-4 open:shadow-card"
          >
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden font-semibold text-[14px] text-tz-black">
              {item.q}
              <span
                aria-hidden="true"
                className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="text-[13px] text-brand-text-2 mt-2.5">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
