export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function canShareFiles(file?: File): boolean {
  try {
    const probe = file ?? new File(['x'], 'x.txt', { type: 'text/plain' });
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Shares a file through the OS share sheet (WhatsApp, etc.). Falls back to a download.
 * Returns 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareOrDownload(blob: Blob, filename: string, title?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type });
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: title ?? filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // Some browsers reject certain types — fall back to download.
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export const fileStamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
