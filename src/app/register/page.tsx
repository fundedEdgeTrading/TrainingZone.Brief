import { redirect } from "next/navigation";

// El asistente anónimo de 5 pasos se sustituyó por el alta cuenta-primero de
// /signup (A.2/D-3): registro rápido de director + login automático, con
// centros/personal/socios añadidos después de pagar (/organization, /members).
export default function RegisterPage() {
  redirect("/signup");
}
