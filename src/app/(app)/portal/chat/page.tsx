import { redirect } from "next/navigation";

// El chat del socio pasó a ser un panel flotante disponible en todo el portal
// (ver `portal/floating-chat.tsx`, montado en `portal/layout.tsx`). Esta ruta
// deja de tener UI propia; cualquier acceso por URL directa vuelve al portal.
export default function PortalChatPage() {
  redirect("/portal");
}
