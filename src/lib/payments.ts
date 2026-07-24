import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Crea un Payment con un receiptNumber correlativo por organización. El
 * número se calcula con `count()` (no hay secuencia dedicada), así que dos
 * altas concurrentes pueden pedir el mismo número: el `@@unique([orgId,
 * receiptNumber])` del esquema lo detecta y aquí se reintenta con el
 * siguiente número en vez de dejar dos recibos duplicados.
 */
export async function createPaymentWithReceipt(
  data: Omit<Prisma.PaymentUncheckedCreateInput, "receiptNumber">,
  maxAttempts = 5
) {
  const orgId = data.orgId;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const count = await prisma.payment.count({ where: { orgId } });
    try {
      return await prisma.payment.create({
        data: { ...data, receiptNumber: `TZ-${2000 + count + attempt}` },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        continue;
      }
      throw e;
    }
  }
  throw new Error("No se ha podido generar un número de recibo único.");
}
