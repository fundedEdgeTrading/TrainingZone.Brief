/**
 * Reescalado de imágenes EN EL NAVEGADOR antes de subirlas.
 *
 * Una foto de móvil pesa 3-8 MB y mide 4000 px; ninguna pantalla de la app la
 * pinta a más de 1600. Reescalar aquí hace tres cosas:
 *  · la fila de `StoredFile` ocupa ~200-400 KB en vez de megas;
 *  · el formulario cabe en el límite de cuerpo de las server actions;
 *  · se pierden los metadatos EXIF —la ubicación GPS incluida— porque la
 *    imagen se vuelve a codificar desde un canvas.
 *
 * PNG se queda en PNG (logos con transparencia); todo lo demás sale en JPEG.
 */

export type ResizeOptions = {
  /** Lado mayor, en píxeles. */
  maxDimension: number;
  /** Tope de la imagen resultante. Coincide con `IMAGE_MAX_BYTES` del servidor. */
  maxBytes?: number;
};

export type ResizeResult = { ok: true; dataUrl: string } | { ok: false; error: string };

/** Lo que se acepta del disco antes de reescalar: el tope real es el del resultado. */
export const RAW_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Bytes reales de un `data:` URL base64 (el texto ocupa 4/3). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Tamaño de destino conservando la proporción; nunca amplía. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function resizeImageFile(file: File, options: ResizeOptions): Promise<ResizeResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!file.type.startsWith("image/")) return { ok: false, error: "Selecciona un archivo de imagen." };
  if (file.size > RAW_IMAGE_MAX_BYTES) return { ok: false, error: "La imagen pesa demasiado (máx. 25 MB)." };

  let bitmap: ImageBitmap;
  try {
    // `createImageBitmap` aplica la orientación EXIF: la foto no sale girada.
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: "No se puede leer esa imagen. Usa JPEG, PNG o WebP." };
  }

  const keepPng = file.type === "image/png";
  const mime = keepPng ? "image/png" : "image/jpeg";
  let maxDimension = options.maxDimension;

  try {
    // PNG no tiene calidad que bajar: si se pasa de tamaño, se reduce la
    // dimensión. JPEG prueba primero con menos calidad.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return { ok: false, error: "Tu navegador no permite preparar la imagen." };
      if (!keepPng) {
        // JPEG no tiene transparencia: sin fondo, lo transparente sale negro.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of keepPng ? [undefined] : [0.85, 0.72, 0.6]) {
        const dataUrl = canvas.toDataURL(mime, quality);
        if (dataUrlBytes(dataUrl) <= maxBytes) return { ok: true, dataUrl };
      }
      maxDimension = Math.round(maxDimension * 0.75);
    }
  } finally {
    bitmap.close();
  }
  return { ok: false, error: "La imagen sigue pesando demasiado. Prueba con otra." };
}
