import express from 'express';
import departmentController from '../controllers/department.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = express.Router();

// GET all departments
router.get('/', departmentController.listDepartments);

// POST create new department (admin only)
router.post('/', verifyToken, requireRole(['admin']), departmentController.createDepartment);

// DELETE department (admin only)
router.delete('/:id', verifyToken, requireRole(['admin']), departmentController.deleteDepartment);

export default router;
