// src/lib/files.ts
// Multi-provider file storage abstraction: WORKDRIVE | SUPABASE_TEST | MOCK.
// Handles file upload and download for invoices, receipts, bills, agreements, evidence, and office dispatches.
// Merges phone camera captures into single PDFs via pdf-lib with canvas-based compression.

import { PDFDocument } from 'pdf-lib';
import { clock } from './clock';
import { coreDb, isSupabaseConfigured, supabase } from './supabase';

export type StorageProviderType = 'WORKDRIVE' | 'SUPABASE_TEST' | 'MOCK';

export const MAX_UPLOAD_SIZE_BYTES = 4.2 * 1024 * 1024; // 4.2 MB (Vercel payload ceiling)

export const FINANCE_FILE_CATEGORIES = [
  'Invoices',
  'Quotations',
  'Reimbursement_Bills',
  'Govt_Fee_Receipts',
  'Payment_Proofs',
  'Agreements',
  'Tax_Documents',
  'Evidence',
  'Internal',
] as const;

export type FinanceFileCategory = typeof FINANCE_FILE_CATEGORIES[number];

export interface DocumentRecord {
  id: string;
  project_code_id?: string | null;
  category: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  zoho_resource_id?: string | null;
  zoho_permalink?: string | null;
  workdrive_path?: string | null;
  client_shared: boolean;
  finance_only: boolean;
  source_app: string;
  uploaded_by?: string | null;
  uploaded_at: string;
}

export type CoreDocument = DocumentRecord;

export function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim();
}

/**
 * Detect active storage provider based on environment
 */
export function getActiveProvider(): StorageProviderType {
  if (import.meta.env.VITE_WORKDRIVE_ROOT_FOLDER_ID && import.meta.env.VITE_ZOHO_CLIENT_ID) {
    return 'WORKDRIVE';
  }
  if (isSupabaseConfigured) {
    return 'SUPABASE_TEST';
  }
  return 'MOCK';
}

/**
 * Generates standardized file name:
 * {project_code}_{kind}_{DD-MM-YYYY}_{tracking_id_or_entry_no}.pdf
 */
export function generateFileName(
  projectCode: string,
  kind: string,
  trackingOrEntryNo: string,
  dateISO?: string
): string {
  const code = projectCode ? sanitizeFolderName(projectCode) : 'OFFICE';
  const cleanKind = sanitizeFolderName(kind);
  const cleanId = sanitizeFolderName(trackingOrEntryNo);
  const dateStr = dateISO ? clock.formatDisplay(dateISO) : clock.todayDisplay();
  return `${code}_${cleanKind}_${dateStr}_${cleanId}.pdf`;
}

/**
 * Calculates standardized folder path for Office operations
 */
export function resolveFolderPath(
  category: 'Postal & Courier' | 'IDF & Client Docs' | 'Petty Cash' | 'General',
  clientCode?: string,
  clientName?: string,
  projectCode?: string
): string {
  if (category === 'Petty Cash') {
    return `Lextria Office/Petty Cash/${clock.currentYearMonth()}`;
  }
  if (category === 'General' || !projectCode) {
    return `Lextria Office/General/${clock.currentYearMonth()}`;
  }
  const cleanClient = sanitizeFolderName(`${clientCode || 'CLI'} - ${clientName || 'Client'}`);
  const cleanProject = sanitizeFolderName(projectCode);
  return `${cleanClient}/${cleanProject}/${category}`;
}

/**
 * Calculates standardized folder path for Finance:
 * {client_code} - {client_name}/{project_code}/{category}/
 */
export function resolveFinanceFolderPath(
  category: FinanceFileCategory | string,
  clientCode?: string,
  clientName?: string,
  projectCode?: string
): string {
  const cleanClient = sanitizeFolderName(`${clientCode || 'CLI'} - ${clientName || 'Client'}`);
  const cleanProject = sanitizeFolderName(projectCode || 'FINANCE');
  const cleanCategory = sanitizeFolderName(category || 'General');
  return `${cleanClient}/${cleanProject}/${cleanCategory}`;
}

/**
 * Compresses an image blob via canvas downscaling and JPEG re-encoding.
 */
export async function compressImageForPdf(
  imgBlob: Blob | File,
  maxDimension = 1400,
  quality = 0.72
): Promise<{ buffer: ArrayBuffer; isJpeg: boolean }> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      let width = 0;
      let height = 0;
      let source: CanvasImageSource;

      if (typeof createImageBitmap !== 'undefined') {
        const bmp = await createImageBitmap(imgBlob);
        width = bmp.width;
        height = bmp.height;
        source = bmp;
      } else {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = URL.createObjectURL(imgBlob);
        });
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
        source = img;
      }

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(source, 0, 0, width, height);

        const compressedBlob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        });

        if (compressedBlob) {
          const buf = await compressedBlob.arrayBuffer();
          return { buffer: buf, isJpeg: true };
        }
      }
    } catch (e) {
      console.warn('Canvas image compression failed, falling back to raw bytes:', e);
    }
  }

  const rawBuf = await imgBlob.arrayBuffer();
  const isPng = imgBlob.type.toLowerCase().includes('png');
  return { buffer: rawBuf, isJpeg: !isPng };
}

/**
 * Takes an array of image Blobs/Files, compresses them, and stitches them into a single PDF Blob
 */
export async function imagesToPdf(images: (Blob | File)[]): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  for (const imgBlob of images) {
    const { buffer, isJpeg } = await compressImageForPdf(imgBlob);

    let embeddedImage;
    if (isJpeg) {
      embeddedImage = await pdfDoc.embedJpg(buffer);
    } else {
      embeddedImage = await pdfDoc.embedPng(buffer);
    }

    const { width, height } = embeddedImage.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

// In-memory mock storage
const mockFileStore = new Map<string, { blob: Blob | File; record: DocumentRecord }>();

/**
 * Main Upload Function (Dispatches, Office Docs)
 */
export async function uploadDocument(params: {
  file: Blob | File;
  fileName: string;
  category: string;
  projectCodeId?: string | null;
  folderPath: string;
  uploadedByUserId?: string;
  clientShared?: boolean;
  financeOnly?: boolean;
}): Promise<DocumentRecord> {
  if (params.file.size > MAX_UPLOAD_SIZE_BYTES) {
    const mb = (params.file.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `File size (${mb} MB) exceeds maximum upload limit of 4.2 MB. Please compress or optimize the file.`
    );
  }

  const provider = getActiveProvider();
  const fileId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const sizeBytes = params.file.size;
  const mimeType = params.file.type || 'application/pdf';

  let zohoResourceId: string | null = null;
  let zohoPermalink: string | null = null;
  const fullPath = `${params.folderPath}/${params.fileName}`;

  if (provider === 'WORKDRIVE') {
    try {
      const formData = new FormData();
      formData.append('file', params.file, params.fileName);

      const resp = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (resp.ok) {
        const uploadResult = await resp.json();
        zohoPermalink = uploadResult.url || null;
        zohoResourceId = uploadResult.resourceId || `res_${Date.now()}`;
      }
    } catch (e) {
      console.warn('WorkDrive upload exception:', e);
    }
  } else if (provider === 'SUPABASE_TEST') {
    try {
      const storagePath = `${params.folderPath}/${params.fileName}`;
      const { data, error } = await supabase.storage
        .from('test-files')
        .upload(storagePath, params.file, { upsert: true });

      if (error) {
        console.warn('Supabase storage upload error:', error);
      } else if (data) {
        zohoResourceId = data.path;
      }
    } catch (e) {
      console.warn('Supabase upload exception:', e);
    }
  }

  const record: DocumentRecord = {
    id: fileId,
    project_code_id: params.projectCodeId || null,
    category: params.category,
    file_name: params.fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    zoho_resource_id: zohoResourceId || `res-${fileId}`,
    zoho_permalink: zohoPermalink || `https://workdrive.zoho.com/file/${fileId}`,
    workdrive_path: fullPath,
    client_shared: params.clientShared || false,
    finance_only: params.financeOnly || false,
    source_app: 'OFFICE',
    uploaded_by: params.uploadedByUserId || null,
    uploaded_at: clock.nowISO(),
  };

  if (isSupabaseConfigured) {
    try {
      await coreDb.from('documents').insert(record);
    } catch (err) {
      console.warn('Could not insert to core.documents:', err);
    }
  }

  mockFileStore.set(fileId, { blob: params.file, record });
  return record;
}

/**
 * Uploads a file through Finance provider and logs to core.documents
 */
export async function uploadFinanceFile(params: {
  file: File;
  category: FinanceFileCategory | string;
  clientCode?: string;
  clientName?: string;
  projectCode?: string;
  projectCodeId?: string;
  clientShared?: boolean;
  financeOnly?: boolean;
  uploadedByUserId?: string;
}): Promise<CoreDocument> {
  return uploadDocument({
    file: params.file,
    fileName: sanitizeFolderName(params.file.name),
    category: params.category,
    projectCodeId: params.projectCodeId,
    folderPath: resolveFinanceFolderPath(
      params.category,
      params.clientCode,
      params.clientName,
      params.projectCode
    ),
    uploadedByUserId: params.uploadedByUserId,
    clientShared: params.clientShared,
    financeOnly: params.financeOnly ?? true,
  });
}

/**
 * Get short-lived download / preview URL
 */
export async function getDocumentUrl(doc: DocumentRecord): Promise<string> {
  const provider = getActiveProvider();

  if (mockFileStore.has(doc.id)) {
    return URL.createObjectURL(mockFileStore.get(doc.id)!.blob);
  }

  if (provider === 'SUPABASE_TEST' && doc.zoho_resource_id) {
    const { data } = await supabase.storage
      .from('test-files')
      .createSignedUrl(doc.zoho_resource_id, 900); // 15 mins
    if (data?.signedUrl) return data.signedUrl;
  }

  if (provider === 'WORKDRIVE') {
    return `/api/files?action=download_url&resourceId=${doc.zoho_resource_id}`;
  }

  return doc.zoho_permalink || '#';
}

/**
 * Returns a direct/proxy download or preview link for immediate JSX rendering
 */
export function getDocumentDownloadLink(
  doc?: { zoho_permalink?: string | null; zoho_resource_id?: string | null } | null
): string {
  if (!doc) return '#';
  if (doc.zoho_permalink) return doc.zoho_permalink;
  if (doc.zoho_resource_id) {
    return `/api/files?action=download_url&resourceId=${doc.zoho_resource_id}`;
  }
  return '#';
}

/**
 * Fetch matter files for Matter Files Panel
 */
export async function fetchMatterFiles(projectCodeId: string): Promise<DocumentRecord[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await coreDb
      .from('documents')
      .select('*')
      .eq('project_code_id', projectCodeId)
      .eq('finance_only', false)
      .order('uploaded_at', { ascending: false });

    if (!error && data) return data as DocumentRecord[];
  }

  const results: DocumentRecord[] = [];
  for (const item of mockFileStore.values()) {
    if (item.record.project_code_id === projectCodeId && !item.record.finance_only) {
      results.push(item.record);
    }
  }
  return results;
}
