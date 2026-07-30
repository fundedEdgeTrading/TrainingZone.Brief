export default function FinalCta() {
  return (
    <section className="mb-14">
      <div className="relative overflow-hidden bg-tz-black rounded-card px-6 py-10 sm:px-12 sm:py-14 text-center">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="tz-aurora-blob tz-aurora-a" />
          <div className="tz-aurora-blob tz-aurora-b" />
        </div>
        <div className="relative">
          <h2 className="font-display font-extrabold text-2xl sm:text-3xl uppercase tracking-[-.01em] text-tz-bone">
            Pon en marcha tu centro con Apta
          </h2>
          <p className="text-sm text-brand-muted-2 mt-3 max-w-md mx-auto">
            Elige tu plan, paga con Stripe y ten tu plataforma lista hoy mismo.
          </p>
          <a
            href="#planes"
            className="inline-flex items-center gap-2 mt-7 rounded-control bg-tz-bone text-tz-black font-semibold text-[15px] px-7 py-3.5 transition-colors duration-200 hover:bg-white"
          >
            Ver planes y precios <span aria-hidden="true">↑</span>
          </a>
        </div>
      </div>
    </section>
  );
}
