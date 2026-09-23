// Arabic-safe PDF: the browser lays out and shapes the text (RTL, joined letters) in a
// print-styled DOM node, we rasterise it with html-to-image, then place the image in a PDF.

export async function captureElement(el: HTMLElement, pixelRatio = 2): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import('html-to-image');
  await document.fonts?.ready;
  return toCanvas(el, { pixelRatio, backgroundColor: '#ffffff', cacheBust: true, skipFonts: true });
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}

/** Finds a row near `y` (searching upward) that is entirely background, to avoid cutting text. */
function findBreak(ctx: CanvasRenderingContext2D, width: number, y: number, maxUp: number): number {
  const data = ctx.getImageData(0, Math.max(0, y - maxUp), width, Math.min(maxUp, y)).data;
  const rows = Math.min(maxUp, y);
  for (let r = rows - 1; r >= 0; r--) {
    let blank = true;
    for (let x = 0; x < width; x += 3) {
      const i = (r * width + x) * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) { blank = false; break; }
    }
    if (blank) return y - rows + r;
  }
  return y;
}

export async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = 210, pageH = 297, margin = 8;
  const imgW = pageW - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const pagePx = Math.floor((pageH - margin * 2) * pxPerMm);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let y = 0, page = 0;
  while (y < canvas.height - 2) {
    let end = Math.min(y + pagePx, canvas.height);
    if (end < canvas.height) end = findBreak(ctx, canvas.width, end, Math.floor(pagePx * 0.25));
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = end - y;
    const sctx = slice.getContext('2d')!;
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, slice.width, slice.height);
    sctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, (end - y) / pxPerMm);
    y = end;
    page++;
  }
  return pdf.output('blob');
}
