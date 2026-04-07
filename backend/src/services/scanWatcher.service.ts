import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import pool from '../db';
import { processScannedImage, processScannedImageFast } from './imageProcessing.service';

// Store pending scan sessions waiting for files
interface PendingScan {
  sessionId: string;
  title: string;
  format: string;
  folderId: string;
  userId: string;
  userName: string;
  userRole?: string;
  department: string;
  departmentId?: string;
  batchId?: string;
  pageNumber?: number;
  createdAt: Date;
}

interface BatchPage {
  sessionId: string;
  pageNumber: number;
  filePath: string;
  ext: string;
  sizeBytes: number;
  createdAt: Date;
}

interface MultiPageBatch {
  batchId: string;
  title: string;
  format: string;
  folderId: string;
  userId: string;
  userName: string;
  userRole?: string;
  department: string;
  departmentId?: string;
  pages: BatchPage[];
  createdAt: Date;
}

const pendingScans: Map<string, PendingScan> = new Map();
const multiPageBatches: Map<string, MultiPageBatch> = new Map();
let watcher: chokidar.FSWatcher | null = null;

// Get the scans directory path
const SCANS_DIR = process.env.SCANS_DIR || path.join(process.cwd(), 'scans');
const BATCH_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'scan-batches');

// Ensure scans directory exists
export function ensureScansDir(): void {
  if (!fs.existsSync(SCANS_DIR)) {
    fs.mkdirSync(SCANS_DIR, { recursive: true });
    console.log(`Created scans directory: ${SCANS_DIR}`);
  }

  if (!fs.existsSync(BATCH_UPLOAD_DIR)) {
    fs.mkdirSync(BATCH_UPLOAD_DIR, { recursive: true });
    console.log(`Created scan batch directory: ${BATCH_UPLOAD_DIR}`);
  }
}

function ensureBatchDir(batchId: string): string {
  const batchDir = path.join(BATCH_UPLOAD_DIR, batchId);
  if (!fs.existsSync(batchDir)) {
    fs.mkdirSync(batchDir, { recursive: true });
  }
  return batchDir;
}

export function createMultiPageBatch(batch: Omit<MultiPageBatch, 'pages' | 'createdAt'>): MultiPageBatch {
  const existing = multiPageBatches.get(batch.batchId);
  if (existing) {
    return existing;
  }

  const created: MultiPageBatch = {
    ...batch,
    pages: [],
    createdAt: new Date()
  };

  multiPageBatches.set(batch.batchId, created);
  ensureBatchDir(batch.batchId);
  console.log(`Created multi-page scan batch: ${batch.batchId}`);
  return created;
}

export function getMultiPageBatch(batchId: string): MultiPageBatch | undefined {
  return multiPageBatches.get(batchId);
}

export function clearMultiPageBatch(batchId: string): boolean {
  const exists = multiPageBatches.delete(batchId);
  const batchDir = path.join(BATCH_UPLOAD_DIR, batchId);

  try {
    if (fs.existsSync(batchDir)) {
      fs.rmSync(batchDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`Failed to cleanup batch directory ${batchDir}:`, err);
  }

  return exists;
}

// Add a pending scan session
export function addPendingScan(scan: PendingScan): void {
  pendingScans.set(scan.sessionId, scan);
  console.log(`Added pending scan session: ${scan.sessionId} for "${scan.title}"`);
}

// Get pending scan by session ID
export function getPendingScan(sessionId: string): PendingScan | undefined {
  return pendingScans.get(sessionId);
}

// Remove pending scan
export function removePendingScan(sessionId: string): boolean {
  return pendingScans.delete(sessionId);
}

// Get the oldest pending scan (FIFO)
export function getOldestPendingScan(): PendingScan | undefined {
  let oldest: PendingScan | undefined;
  let oldestTime = Infinity;

  for (const scan of pendingScans.values()) {
    const time = scan.createdAt.getTime();
    if (time < oldestTime) {
      oldestTime = time;
      oldest = scan;
    }
  }

  return oldest;
}

// Process a new scanned file
async function processScannedFile(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase().slice(1);

  console.log(`New scan detected: ${fileName}`);

  // Timeout logic: if file is not processed within 60 seconds, mark as failed
  const MAX_WAIT_MS = 60000; // 60 seconds
  const startTime = Date.now();
  let processed = false;

  // Wait for file to be accessible (in case it's still being written)
  while (!processed && Date.now() - startTime < MAX_WAIT_MS) {
    try {
      // Try to open the file for reading
      fs.accessSync(filePath, fs.constants.R_OK);
      processed = true;
    } catch (err) {
      // File not ready yet, wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!processed) {
    console.error(`Timeout: Scanned file ${fileName} not accessible after ${MAX_WAIT_MS / 1000} seconds.`);
    // Mark the oldest pending scan as failed
    const pendingScan = getOldestPendingScan();
    if (pendingScan) {
      await pool.query(`
        UPDATE scan_sessions
        SET status = 'failed', error_message = $1
        WHERE id = $2
      `, [
        `Scan failed: File ${fileName} not detected or accessible after ${MAX_WAIT_MS / 1000} seconds. Please check scanner and network.`,
        pendingScan.sessionId
      ]);
      removePendingScan(pendingScan.sessionId);
    }
    return;
  }

  // Get the oldest pending scan session
  const pendingScan = getOldestPendingScan();

  if (!pendingScan) {
    console.log(`No pending scan session for file: ${fileName}. Skipping.`);
    return;
  }

  try {
    // Apply image processing (edge detection, cropping, enhancement) for image files
    let processedFilePath = filePath;
    const isImageFile = ['.jpg', '.jpeg', '.png', '.tiff', '.tif'].includes(`.${ext}`);

    if (isImageFile) {
      console.log(`Processing image with OpenCV: ${fileName}`);
      const processedPath = filePath.replace(/(\.[^.]+)$/, '_processed$1');

      try {
        // Use faster processing with reduced timeout (reduced from 10000ms to 3000ms)
        const processWithTimeout = async () => {
          const timeoutPromise = new Promise<{ success: false; message: string }>((resolve) => {
            setTimeout(() => resolve({ success: false, message: 'Image processing timed out' }), 3000);
          });

          // Use fast processing mode for better performance
          const processPromise = processScannedImageFast(filePath, {
            outputPath: processedPath
          });

          return Promise.race([processPromise, timeoutPromise]);
        };

        const processResult = await processWithTimeout();

        if (processResult.success && processResult.outputPath) {
          processedFilePath = processResult.outputPath;
          console.log(`Image processed successfully: ${processResult.outputPath}`);
        } else {
          console.log(`Image processing skipped: ${processResult.message || 'using original file'}`);
        }
      } catch (processingError: any) {
        console.log(`Image processing error: ${processingError.message || 'unknown error'}, using original file`);
      }
    }

    if (pendingScan.batchId) {
      const batch = getMultiPageBatch(pendingScan.batchId);
      if (!batch) {
        throw new Error(`Multi-page batch not found: ${pendingScan.batchId}`);
      }

      const sourceStat = fs.statSync(processedFilePath);
      const pageNumber = pendingScan.pageNumber || batch.pages.length + 1;
      const batchDir = ensureBatchDir(batch.batchId);
      const pageFileName = `page_${String(pageNumber).padStart(3, '0')}_${Date.now()}.${ext || 'pdf'}`;
      const batchFilePath = path.join(batchDir, pageFileName);

      fs.copyFileSync(processedFilePath, batchFilePath);

      batch.pages.push({
        sessionId: pendingScan.sessionId,
        pageNumber,
        filePath: batchFilePath,
        ext: ext || pendingScan.format,
        sizeBytes: sourceStat.size,
        createdAt: new Date()
      });

      batch.pages.sort((a, b) => a.pageNumber - b.pageNumber || a.createdAt.getTime() - b.createdAt.getTime());

      await pool.query(`
        UPDATE scan_sessions
        SET status = 'completed', completed_at = NOW()
        WHERE id = $1
      `, [pendingScan.sessionId]);

      removePendingScan(pendingScan.sessionId);

      try {
        fs.unlinkSync(filePath);
        if (processedFilePath !== filePath && fs.existsSync(processedFilePath)) {
          fs.unlinkSync(processedFilePath);
        }
      } catch (e) {
        console.log(`Could not delete original scan file: ${filePath}`);
      }

      console.log(`Captured page ${pageNumber} for batch ${batch.batchId}`);
      return;
    }

    // Read file content (use processed file if available)
    const fileBuffer = fs.readFileSync(processedFilePath);
    const fileSize = fs.statSync(processedFilePath).size;
    const fileSizeStr = `${(fileSize / 1024 / 1024).toFixed(1)} MB`;

    // Generate new filename based on document title
    const sanitizedTitle = pendingScan.title.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const newFileName = `${sanitizedTitle}_${timestamp}.${ext}`;
    const newFilePath = path.join(process.cwd(), 'uploads', newFileName);

    // Copy processed file to uploads directory
    fs.copyFileSync(processedFilePath, newFilePath);

// Optimized database operations with prepared statements and reduced queries
async function createDocumentOptimized(params: {
  docId: string;
  title: string;
  reference: string;
  userName: string;
  userId: string;
  department: string;
  ext: string;
  fileSizeStr: string;
  folderId: string | null;
  newFileName: string;
  fileBuffer: Buffer;
}): Promise<any> {
  const {
    docId, title, reference, userName, userId, department, ext,
    fileSizeStr, folderId, newFileName, fileBuffer
  } = params;

  // Use a transaction for faster batch operations
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let insertRes;
    try {
      // Try to insert document
      insertRes = await client.query(`
        INSERT INTO documents (
          id, title, reference, date, uploaded_by, uploaded_by_id,
          status, version, file_type, size, folder_id, needs_approval,
          department, file_path, file_data, scanned_from, description, created_at
        ) VALUES (
          $1, $2, $3, CURRENT_DATE, $4, $5, 'approved', 1, $6, $7, $8, false,
          $9, $10, $11, 'NAPS2 Scanner', 'Scanned via NAPS2', NOW()
        ) RETURNING *
      `, [
        docId, title, reference, userName, userId, ext,
        fileSizeStr, folderId, `uploads/${newFileName}`, department, fileBuffer
      ]);
    } catch (error: any) {
      // Duplicate reference error: 23505 is unique_violation in Postgres
      if (error.code === '23505' && error.constraint && error.constraint.includes('documents_reference_key')) {
        try {
          // Generate a new unique reference and retry ONCE
          const newReference = reference + '_' + Math.floor(Math.random() * 10000);
          insertRes = await client.query(`
            INSERT INTO documents (
              id, title, reference, date, uploaded_by, uploaded_by_id,
              status, version, file_type, size, folder_id, needs_approval,
              department, file_path, file_data, scanned_from, description, created_at
            ) VALUES (
              $1, $2, $3, CURRENT_DATE, $4, $5, 'approved', 1, $6, $7, $8, false,
              $9, $10, $11, 'NAPS2 Scanner', 'Scanned via NAPS2', NOW()
            ) RETURNING *
          `, [
            docId, title, newReference, userName, userId, ext,
            fileSizeStr, folderId, `uploads/${newFileName}`, department, fileBuffer
          ]);
        } catch (retryError) {
          await client.query('ROLLBACK');
          throw retryError;
        }
      } else {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    // Optimized activity log insert (combined with document insert in same transaction)
    await client.query(`
      INSERT INTO activity_logs (
        user_id, user_name, user_role, action, target, target_type, details, created_at
      ) VALUES ($1, $2, 'staff', 'DOCUMENT_SCANNED', $3, 'document', $4, NOW())
    `, [
      userId, userName, title,
      `Scanned document "${title}" via NAPS2. Reference: ${reference}`
    ]);

    await client.query('COMMIT');
    return insertRes.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Optimized reference generation with better caching
const referenceCache = new Map<string, { lastNumber: number; lastUpdated: number }>();
const REFERENCE_CACHE_DURATION = 30000; // 30 seconds

function getReferencePrefix(userRole: string | null | undefined, department: string): string {
  if (String(userRole || '').toLowerCase() === 'admin') {
    return 'ADM';
  }

  return (department || 'GEN').slice(0, 3).toUpperCase();
}

async function generateUniqueReferenceOptimized(department: string, departmentId?: string, userRole?: string): Promise<string> {
  const year = new Date().getFullYear();
  const deptCode = getReferencePrefix(userRole, department);
  const cacheKey = `${deptCode}_${year}_${departmentId || 'no-dept'}`;

  // Check cache first
  const cached = referenceCache.get(cacheKey);
  const now = Date.now();

  let lastNumber = 1;
  if (cached && (now - cached.lastUpdated) < REFERENCE_CACHE_DURATION) {
    lastNumber = cached.lastNumber + 1;
    referenceCache.set(cacheKey, { lastNumber, lastUpdated: now });
  } else {
    // Get from database
    try {
      if (departmentId) {
        const upsertRes = await pool.query(`
          INSERT INTO document_counters (id, department_id, year, last_number)
          VALUES (uuid_generate_v4(), $1, $2, 1)
          ON CONFLICT (department_id, year) DO UPDATE SET last_number = document_counters.last_number + 1
          RETURNING last_number
        `, [departmentId, year]);
        lastNumber = upsertRes.rows[0].last_number;
      } else {
        const maxRes = await pool.query(`
          SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_num
          FROM documents
          WHERE reference LIKE $1
        `, [`${deptCode}_${year}_%`]);
        lastNumber = maxRes.rows[0]?.next_num || 1;
      }
      referenceCache.set(cacheKey, { lastNumber, lastUpdated: now });
    } catch (err) {
      console.warn('Reference generation error:', err);
      lastNumber = Date.now() % 10000; // Fallback to timestamp-based
    }
  }

  return `${deptCode}_${year}_${String(lastNumber).padStart(3, '0')}`;
}

    // Generate unique reference using optimized method
    const reference = await generateUniqueReferenceOptimized(pendingScan.department, pendingScan.departmentId, pendingScan.userRole);

    // Insert document using optimized method
    const docId = randomUUID();
    const document = await createDocumentOptimized({
      docId,
      title: pendingScan.title,
      reference,
      userName: pendingScan.userName,
      userId: pendingScan.userId,
      department: pendingScan.department,
      ext: ext || pendingScan.format,
      fileSizeStr,
      folderId: pendingScan.folderId || null,
      newFileName,
      fileBuffer
    });

    // Update scan session status in parallel (not waiting for it)
    pool.query(`
      UPDATE scan_sessions
      SET status = 'completed', document_id = $1, completed_at = NOW()
      WHERE id = $2
    `, [docId, pendingScan.sessionId]).catch(err =>
      console.error('Failed to update scan session:', err)
    );

    // Remove from pending scans
    removePendingScan(pendingScan.sessionId);

    // Optionally delete original and processed files from scans folder
    try {
      fs.unlinkSync(filePath);
      if (processedFilePath !== filePath && fs.existsSync(processedFilePath)) {
        fs.unlinkSync(processedFilePath);
      }
    } catch (e) {
      console.log(`Could not delete original scan file: ${filePath}`);
    }

    console.log(`Processed scanned document: ${pendingScan.title} (${reference})`);

    // Emit event for real-time notification (can be picked up by WebSocket)
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).lastScannedDocument = {
        id: docId,
        title: pendingScan.title,
        reference,
        fileName: newFileName,
        fileType: ext,
        size: fileSizeStr,
        sessionId: pendingScan.sessionId,
        timestamp: new Date().toISOString()
      };
    }

  } catch (err: any) {
    console.error(`Error processing scanned file: ${err.message}`);

    // Update scan session with error
    await pool.query(`
      UPDATE scan_sessions
      SET status = 'failed', error_message = $1
      WHERE id = $2
    `, [err.message, pendingScan.sessionId]);
  }
}

// Start the file watcher
export function startScanWatcher(): void {
  ensureScansDir();

  if (watcher) {
    console.log('Scan watcher already running');
    return;
  }

  console.log(`Starting scan watcher on: ${SCANS_DIR}`);

  watcher = chokidar.watch(SCANS_DIR, {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,  // Reduced from 200ms to 100ms for faster detection
      pollInterval: 10          // Reduced from 25ms to 10ms for faster polling
    },
    ignoreInitial: false,       // Process existing files on startup
    usePolling: false,          // Use native OS events for better performance
    alwaysStat: true            // Get file stats immediately
  });

  watcher
    .on('add', (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      // Only process supported image/document formats
      if (['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif'].includes(ext)) {
        processScannedFile(filePath);
      }
    })
    .on('error', (error) => {
      console.error(`Scan watcher error: ${error}`);
    })
    .on('ready', () => {
      console.log('Scan watcher ready and monitoring for new files');
    });
}

// Stop the file watcher
export function stopScanWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('Scan watcher stopped');
  }
}

// Get watcher status
export function getWatcherStatus(): { running: boolean; directory: string; pendingScans: number } {
  return {
    running: watcher !== null,
    directory: SCANS_DIR,
    pendingScans: pendingScans.size
  };
}

export default {
  startScanWatcher,
  stopScanWatcher,
  getWatcherStatus,
  addPendingScan,
  getPendingScan,
  removePendingScan,
  createMultiPageBatch,
  getMultiPageBatch,
  clearMultiPageBatch,
  ensureScansDir,
  SCANS_DIR,
  BATCH_UPLOAD_DIR
};
