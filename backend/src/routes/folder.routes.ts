
import { Router } from 'express';
import folderController from '../controllers/folder.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// List all folders
router.get('/', folderController.listFolders);
// Create a new folder (authenticated)
router.post('/', verifyToken, folderController.createFolder);
// Update a folder
router.put('/:id', verifyToken, folderController.updateFolder);
// Delete a folder (admin only - soft delete)
router.delete('/:id', verifyToken, requireRole(['admin']), folderController.deleteFolder);
// Restore a folder from trash
router.patch('/:id/restore', verifyToken, requireRole(['admin']), folderController.restoreFolder);
// Permanently delete a folder (admin only)
router.delete('/:id/permanent', verifyToken, requireRole(['admin']), folderController.permanentlyDeleteFolder);

export default router;
