import express from 'express';
import documentController from '../controllers/document.controller';
import { authenticate } from '../middleware/auth.middleware';
import multer from 'multer';

const storage = multer.diskStorage({
	destination: (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
		cb(null, 'uploads/');
	},
	filename: (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
		const unique = `${Date.now()}-${file.originalname}`;
		cb(null, unique);
	}
});

const upload = multer({ storage });

const router = express.Router();

router.get('/', authenticate, documentController.listDocuments);
router.post('/', authenticate, upload.single('file'), documentController.createDocument);
router.get('/:id/download', authenticate, documentController.downloadDocument);
router.get('/:id/preview', authenticate, documentController.previewDocument);
router.patch('/:id/approve', authenticate, documentController.approveDocument);
router.patch('/:id/reject', authenticate, documentController.rejectDocument);
router.patch('/:id/trash', authenticate, documentController.trashDocument);
router.patch('/:id/restore', authenticate, documentController.restoreDocument);
router.patch('/:id/archive', authenticate, documentController.archiveDocument);
router.delete('/:id', authenticate, documentController.permanentlyDeleteDocument);

export default router;
