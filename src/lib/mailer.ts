// Sin proveedor de email real configurado en esta demo (ver README, "Qué
// queda fuera de esta entrega"). En producción esto llamaría a un proveedor
// transaccional (Resend/SES/Postmark); aquí se registra en el log del
// servidor para poder seguir el flujo de invitaciones en desarrollo.
export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  console.log(`[mailer] → ${to} · ${subject}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(html);
  }
}
