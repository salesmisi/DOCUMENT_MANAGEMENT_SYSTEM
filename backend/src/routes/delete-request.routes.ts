import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import {
  requestDelete,
  listDeleteRequests,
  approveDeleteRequest,
  denyDeleteRequest
} from '../controllers/delete-request.controller';

const router = Router();

// Staff: Request deletion
router.post('/', authenticate, requestDelete);

// Admin/Manager: List all pending delete requests
router.get('/', authenticate, requireRole(['admin', 'manager']), listDeleteRequests);

// Admin/Manager: Approve a delete request
router.put('/:id/approve', authenticate, requireRole(['admin', 'manager']), approveDeleteRequest);

// Admin/Manager: Deny a delete request
router.put('/:id/deny', authenticate, requireRole(['admin', 'manager']), denyDeleteRequest);

export default router;
