/**
 * Firma de los bytes de una imagen. Módulo puro (sin Prisma): lo usan el
 * almacén de imágenes y el de fotos de evolución, que cargan tests sin base de datos.
 */

/**
 * Tipos que se aceptan. Se decide por la FIRMA de los bytes, no por lo que
 * declare el `data:` URL: un HTML con `data:image/png` delante se serviría como
 * imagen desde nuestro dominio. SVG queda fuera a propósito: es un documento
 * que puede llevar script.
 */
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export function sniffImageMime(data: Uint8Array): ImageMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    String.fromCharCode(data[0], data[1], data[2], data[3]) === "RIFF" &&
    String.fromCharCode(data[8], data[9], data[10], data[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
