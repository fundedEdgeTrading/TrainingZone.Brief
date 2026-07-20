const LETTERS = ["A", "p", "t", "a"];

export default function AptaLogo({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Apta"
      className={`apta-logo font-display font-extrabold tracking-[-.02em] ${
        variant === "light" ? "apta-logo-light" : "apta-logo-dark"
      } ${className}`}
    >
      <span aria-hidden="true">
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            className="apta-letter"
            style={{ animationDelay: `${0.05 + i * 0.07}s` }}
          >
            {letter}
          </span>
        ))}
      </span>
      <span className="apta-shine-layer" aria-hidden="true">
        Apta
      </span>
      <span className="apta-dot" aria-hidden="true" />
    </span>
  );
}
