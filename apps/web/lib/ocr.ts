import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

const FAST_TEXT_THRESHOLD = 20;
const OCR_TIMEOUT_MS = 15000;
const MAX_PDF_OCR_PAGES = 2;
const MAX_PDF_TEXT_PAGES = 8;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OCR_LANG_PATH = path.resolve(CURRENT_DIR, '..', 'ocr-data');

type PdfPageText = {
  pageNumber: number;
  text: string;
};

const workerPromises = new Map<string, Promise<Awaited<ReturnType<typeof createWorker>>>>();

async function getWorker(languages: string[]) {
  const key = languages.join('+');
  if (!workerPromises.has(key)) {
    workerPromises.set(
      key,
      withTimeout(
        createWorker(key, 1, {
          logger: () => undefined,
          langPath: OCR_LANG_PATH,
        }),
        'OCR engine startup',
      ),
    );
  }
  return workerPromises.get(key)!;
}

function extensionOf(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
}

function isImageFile(fileName: string, mimeType: string): boolean {
  return mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(extensionOf(fileName));
}

function isPdfFile(fileName: string, mimeType: string): boolean {
  return mimeType === 'application/pdf' || extensionOf(fileName) === '.pdf';
}

async function recognizeImage(buffer: Buffer, languages: string[]): Promise<string> {
  const worker = await getWorker(languages);
  const result = await withTimeout(worker.recognize(buffer), 'image OCR');
  return result.data.text.trim();
}

async function extractPdfPageText(pdfBuffer: Buffer): Promise<PdfPageText[]> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  } as never);

  const pdf = await loadingTask.promise;
  const pages: PdfPageText[] = [];
  const pageLimit = Math.min(pdf.numPages, MAX_PDF_TEXT_PAGES);

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({ pageNumber, text });
  }

  return pages;
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} took too long. Please try a smaller file or paste the text.`)), OCR_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function renderPdfPageToPng(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  } as never);
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');

  await page.render({
    canvas: canvas as never,
    canvasContext: context as never,
    viewport,
  }).promise;

  return canvas.toBuffer('image/png');
}

async function extractTextFromPdf(
  pdfBuffer: Buffer,
  languages: string[],
  processingMode: 'auto' | 'fast' | 'ocr',
): Promise<string> {
  const pages = await withTimeout(extractPdfPageText(pdfBuffer), 'PDF text extraction');
  const extractedText = pages.map((page) => page.text).join('\n').trim();

  if (extractedText.length >= FAST_TEXT_THRESHOLD || processingMode === 'fast') {
    return extractedText;
  }

  const ocrPages: string[] = [];
  for (const page of pages.slice(0, MAX_PDF_OCR_PAGES)) {
    try {
      const pageImage = await withTimeout(
        renderPdfPageToPng(pdfBuffer, page.pageNumber),
        `PDF page ${page.pageNumber} rendering`,
      );
      const ocrText = await recognizeImage(pageImage, languages);
      if (ocrText) {
        ocrPages.push(ocrText);
      }
    } catch {
      if (extractedText.length >= FAST_TEXT_THRESHOLD) {
        return extractedText;
      }
    }
  }

  return ocrPages.join('\n').trim() || extractedText;
}

export async function extractTextFromUpload(args: {
  file?: File | null;
  manualText?: string;
  fileName?: string;
  ocrLanguage?: 'en' | 'hi' | 'en+hi';
  processingMode?: 'auto' | 'fast' | 'ocr';
}): Promise<{ text: string; source: string }> {
  const file = args.file;
  const manualText = args.manualText?.trim() ?? '';

  if (!file || file.size === 0) {
    if (manualText) {
      return { text: manualText, source: 'manual-text' };
    }
    throw new Error('Please upload a PDF/image/text file or paste discharge text.');
  }

  const fileName = args.fileName?.trim() || file.name || 'uploaded-file';
  const mimeType = file.type || '';
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File is too large for quick processing. Please upload a file under 8 MB or paste the text.');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const languages =
    args.ocrLanguage === 'hi'
      ? ['hin']
      : args.ocrLanguage === 'en+hi'
        ? ['eng', 'hin']
        : ['eng'];
  const processingMode = args.processingMode ?? 'auto';

  if (isPdfFile(fileName, mimeType)) {
    const text = await extractTextFromPdf(buffer, languages, processingMode);
    if (!text) {
      if (processingMode === 'fast') {
        throw new Error(
          'This PDF looks scanned and has no readable text layer. Switch to "Scanned PDF/image OCR" or paste the discharge text.',
        );
      }
      throw new Error('OCR could not read text from the uploaded PDF.');
    }
    if (text.length < FAST_TEXT_THRESHOLD && processingMode === 'fast') {
      throw new Error(
        'Fast processing found too little readable text in this PDF. Switch to "Scanned PDF/image OCR" or paste the discharge text.',
      );
    }
    return {
      text,
      source:
        processingMode === 'fast'
          ? 'PDF (fast mode)'
          : processingMode === 'ocr'
            ? 'PDF (OCR mode)'
            : 'PDF (auto mode)',
    };
  }

  if (isImageFile(fileName, mimeType)) {
    const text = await recognizeImage(buffer, languages);
    if (!text) {
      throw new Error('OCR could not read text from the uploaded image.');
    }
    return { text, source: 'image OCR' };
  }

  const text = buffer.toString('utf8').trim();
  if (!text) {
    throw new Error('Unsupported file or empty content. Use PDF, image, or plain text.');
  }
  return { text, source: 'text file' };
}
