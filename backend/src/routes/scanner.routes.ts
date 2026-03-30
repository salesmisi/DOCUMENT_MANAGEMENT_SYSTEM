import express from 'express';
import scannerController from '../controllers/scanner.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Check if NAPS2 is installed
router.get('/naps2/status', authenticate, scannerController.checkNaps2Installation);

// List available scanners
router.get('/devices', authenticate, scannerController.listScanners);

// Start a new scan with real-time device refresh
router.post('/scan', authenticate, async (req, res, next) => {
	try {
		// Always refresh device list before scan
		const naps2Exists = require('fs').existsSync(process.env.NAPS2_PATH || 'C:\\Program Files\\NAPS2\\NAPS2.Console.exe');
		const scanPerformance = require('../services/scanPerformance.service');
		const allDevices = await scanPerformance.detectAllScannersOptimized(
			naps2Exists ? (process.env.NAPS2_PATH || 'C:\\Program Files\\NAPS2\\NAPS2.Console.exe') : undefined
		);
		if (!allDevices || allDevices.length === 0) {
			return res.status(503).json({ error: 'No scanners detected. Please check device connection and power.' });
		}
		// Optionally, attach device list to request for downstream use
		req.scannerDevices = allDevices;
		// Continue to original scan handler
		return scannerController.startScan(req, res, next);
	} catch (err) {
		return res.status(500).json({ error: 'Failed to refresh scanner devices: ' + (err.message || err) });
	}
});

// Finalize a multi-page scan batch into one document
router.post('/scan-batch/:batchId/finalize', authenticate, scannerController.finalizeScanBatch);

// Discard a multi-page scan batch
router.delete('/scan-batch/:batchId', authenticate, scannerController.discardScanBatch);

// Get scan session status
router.get('/scan/:sessionId', authenticate, scannerController.getScanStatus);

// Get recent scans for current user
router.get('/recent', authenticate, scannerController.getRecentScans);

// Get file watcher status
router.get('/watcher/status', authenticate, scannerController.getWatcherStatus);

// Get last scanned document (for preview)
router.get('/last-scanned', authenticate, scannerController.getLastScannedDocument);

// Cancel a pending scan
router.delete('/scan/:sessionId', authenticate, scannerController.cancelScan);

export default router;
