import html2canvas from "./vendor/html2canvas.min.js";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 18;

export async function downloadChartPdf(element: HTMLElement, filename: string) {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: Math.max(element.scrollWidth, 900),
  });
  const jpeg = await canvasToJpeg(canvas, 0.92);
  const blob = jpegToPdf(jpeg, canvas.width, canvas.height);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to create PDF image"));
          return;
        }
        void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      "image/jpeg",
      quality,
    );
  });
}

function jpegToPdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number): Blob {
  const usableW = PAGE_W - MARGIN * 2;
  const usableH = PAGE_H - MARGIN * 2;
  const drawW = usableW;
  const drawH = (pixelHeight * usableW) / pixelWidth;
  const pageCount = Math.max(1, Math.ceil(drawH / usableH));

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;

  function write(bytes: Uint8Array) {
    chunks.push(bytes);
    size += bytes.length;
  }
  function writeStr(text: string) {
    write(encoder.encode(text));
  }
  function startObj() {
    offsets.push(size);
  }

  writeStr("%PDF-1.4\n");

  const contentIds = Array.from({ length: pageCount }, (_, i) => 3 + i * 2);
  const pageIds = Array.from({ length: pageCount }, (_, i) => 4 + i * 2);
  const imageId = 3 + pageCount * 2;

  startObj();
  writeStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObj();
  writeStr(
    `2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>\nendobj\n`,
  );

  for (let i = 0; i < pageCount; i += 1) {
    const translateY = PAGE_H - MARGIN - drawH + i * usableH;
    const stream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${MARGIN.toFixed(2)} ${translateY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    startObj();
    writeStr(`${contentIds[i]} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
    startObj();
    writeStr(
      `${pageIds[i]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>\nendobj\n`,
    );
  }

  startObj();
  writeStr(
    `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  write(jpeg);
  writeStr("\nendstream\nendobj\n");

  const xrefAt = size;
  writeStr(`xref\n0 ${offsets.length + 1}\n`);
  writeStr("0000000000 65535 f \n");
  for (const offset of offsets) {
    writeStr(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  writeStr(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);

  const out = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return new Blob([out], { type: "application/pdf" });
}
