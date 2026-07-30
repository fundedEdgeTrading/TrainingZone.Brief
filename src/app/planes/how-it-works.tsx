// Pasos del recorrido real ya construido: /planes → Stripe Checkout → email de
// activación → /onboarding/[token] → /puesta-en-marcha. No es una lista aparte.
const STEPS = [
  {
    n: "1",
    title: "Elige tu plan y paga con Stripe",
    body: "Sin llamadas ni demos: seleccionas el plan que necesitas y pagas online de forma segura.",
  },
  {
    n: "2",
    title: "Confirma el email de la persona directora",
    body: "Te enviamos un enlace para verificar el correo de facturación y fijar tu contraseña.",
  },
  {
    n: "3",
    title: "Pon en marcha tus centros y tu equipo",
    body: "Da de alta tu empresa, tu primer centro, tus tarifas e invita a entrenadores y recepción.",
  },
  {
    n: "4",
    title: "Da de alta a tus socios y empieza a operar",
    body: "Alta manual o por CSV. Desde ese momento, agenda, cobros y portal del socio ya funcionan.",
  },
];

export default function HowItWorks() {
  return (
    <section className="mb-14">
      <h2 className="font-display font-extrabold text-xl sm:text-2xl uppercase tracking-[-.01em] text-tz-black text-center mb-2">
        Cómo funciona
      </h2>
      <p className="text-center text-sm text-muted mb-8 max-w-xl mx-auto">
        De elegir un plan a tener tu centro operativo, sin pasos ocultos.
      </p>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n} className="bg-white border border-tz-linen rounded-card p-5">
            <span
              aria-hidden="true"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-tz-black text-tz-bone font-display font-extrabold text-sm mb-3"
            >
              {step.n}
            </span>
            <p className="font-semibold text-[15px] text-tz-black">{step.title}</p>
            <p className="text-[13px] text-muted mt-1.5">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
