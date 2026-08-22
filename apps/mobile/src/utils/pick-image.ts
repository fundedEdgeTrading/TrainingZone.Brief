import * as ImagePicker from "expo-image-picker";

export type PickedImage = { ok: true; dataUrl: string } | { ok: false; error: string } | null;

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Elige una foto de la galería y la devuelve como data URL, que es como
 * guarda las imágenes el resto del CRM (`Member.photoUrl`, `Announcement`).
 * Recorta a la proporción pedida antes de subir y rechaza lo que pase de 2 MB.
 *
 * `null` = la persona canceló el selector.
 */
export async function pickImageAsDataUrl(aspect: [number, number]): Promise<PickedImage> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, error: "Necesitamos permiso para acceder a tus fotos." };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect,
    quality: 0.8,
    base64: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset?.base64) return { ok: false, error: "No se pudo leer la imagen." };
  // base64 ocupa 4/3 de los bytes reales.
  if ((asset.base64.length * 3) / 4 > MAX_BYTES) {
    return { ok: false, error: "La imagen pesa más de 2 MB. Prueba con una más ligera." };
  }

  const mime = asset.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ? asset.mimeType : "image/jpeg";
  return { ok: true, dataUrl: `data:${mime};base64,${asset.base64}` };
}
