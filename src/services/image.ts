/** Downscales and re-encodes a photo (receipt) to keep IndexedDB small. */
export async function compressImage(file: Blob, maxSide = 1280, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return out && out.size < file.size ? out : file;
}
