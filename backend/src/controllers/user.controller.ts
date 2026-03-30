import type { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_to_a_strong_random_string';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Password validation rules
const PASSWORD_RULES = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~;']/,
};

function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < PASSWORD_RULES.minLength) {
    errors.push('Password must be at least 8 characters');
  }
  if (!PASSWORD_RULES.hasUppercase.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!PASSWORD_RULES.hasLowercase.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!PASSWORD_RULES.hasNumber.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!PASSWORD_RULES.hasSpecial.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { isValid: errors.length === 0, errors };
}

// ── helpers ──────────────────────────────────────────────
function signToken(userId: string, role: string) {
  return jwt.sign({ id: userId, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

function sanitiseUser(row: any) {
  const { password, ...user } = row;
  return {
    ...user,
    createdAt: user.created_at ?? user.createdAt,
  };
}

// ── LOGIN ────────────────────────────────────────────────
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'inactive')
      return res.status(403).json({ error: 'Account is deactivated' });

    const token = signToken(user.id, user.role);
    return res.json({ token, user: sanitiseUser(user) });
  } catch (err) {
    console.error('loginUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET ALL USERS ────────────────────────────────────────
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, department, status, avatar, created_at
       FROM users
       WHERE status != 'trashed'
       ORDER BY created_at DESC`
    );
    const users = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    }));
    return res.json(users);
  } catch (err) {
    console.error('getUsers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET SINGLE USER ──────────────────────────────────────
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, email, role, department, status, avatar, created_at FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const r = result.rows[0];
    return res.json({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('getUserById error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE USER ──────────────────────────────────────────
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, department, status } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });

    if (!email.endsWith('@maptech.com')) {
      return res.status(400).json({ error: 'Email address must end with @maptech.com' });
    }

    // Validate password security rules
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }

    // check duplicate
    const dup = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (dup.rows.length > 0)
      return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, department, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department, status, avatar, created_at`,
      [name, email, hashed, role || 'staff', department || '', status || 'active']
    );

    const r = result.rows[0];
    return res.status(201).json({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('createUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── UPDATE USER ──────────────────────────────────────────
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, status, avatar } = req.body;

    // fetch previous department to detect changes
    const prevRes = await pool.query('SELECT department FROM users WHERE id = $1', [id]);
    const prevDept = prevRes.rows[0]?.department || null;

    const result = await pool.query(
      `UPDATE users
       SET name       = COALESCE($1, name),
           email      = COALESCE($2, email),
           role       = COALESCE($3, role),
           department = COALESCE($4, department),
           status     = COALESCE($5, status),
           avatar     = COALESCE($6, avatar)
       WHERE id = $7
       RETURNING id, name, email, role, department, status, avatar, created_at`,
      [name, email, role, department, status, avatar, id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const r = result.rows[0];

    // If department changed, create a notification for the affected user
    try {
      const newDept = r.department || null;
      if (prevDept !== newDept && newDept) {
        const title = `Assigned to department ${newDept}`;
        const message = `You have been assigned to the ${newDept} department.`;
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
           VALUES ($1, $2, $3, $4, FALSE, NOW())`,
          [id, 'assignment', title, message]
        );
      }
    } catch (e) {
      console.error('Failed to create department assignment notification:', e);
    }
    return res.json({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('updateUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── DELETE USER ──────────────────────────────────────────
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check user exists
    const userRes = await pool.query('SELECT id, name, email, department FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const user = userRes.rows[0];

    // SOFT DELETE: Mark user as trashed
    await pool.query(
      `UPDATE users SET status = 'trashed', trashed_at = NOW() WHERE id = $1`,
      [id]
    );

    // CASCADE: Trash all folders created by this user (non-department folders)
    await pool.query(
      `UPDATE folders SET status = 'trashed', trashed_at = NOW()
       WHERE created_by_id = $1 AND is_department = FALSE`,
      [id]
    );

    // CASCADE: Trash all documents uploaded by this user
    await pool.query(
      `UPDATE documents SET status = 'trashed', trashed_at = NOW()
       WHERE uploaded_by_id = $1`,
      [id]
    );

    // Log to trash_history
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, scheduled_deletion_at, metadata)
       VALUES ('user', $1, $2, 'trashed', NOW() + INTERVAL '30 days', $3)`,
      [user.id, user.name, JSON.stringify({ department: user.department, email: user.email })]
    );

    return res.json({ message: 'User and associated content moved to trash' });
  } catch (err) {
    console.error('deleteUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── RESET PASSWORD ───────────────────────────────────────
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword)
      return res.status(400).json({ error: 'New password is required' });

    // Validate password security rules
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
      [hashed, id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CHANGE PASSWORD (requires current password) ─────────────
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });

    // Validate password security rules
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }

    // Only allow users to change their own password (admins can use resetPassword)
    if (!req.userId || req.userId !== id) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query('SELECT password FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = result.rows[0];
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, id]);

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── UPLOAD AVATAR ────────────────────────────────────────
export const uploadAvatar = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    const result = await pool.query(
      'UPDATE users SET avatar = $1 WHERE id = $2 RETURNING id, name, email, role, department, status, avatar, created_at',
      [avatarPath, id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const r = result.rows[0];
    return res.json({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('uploadAvatar error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── RESTORE USER ─────────────────────────────────────────
export const restoreUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get user details first
    const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const userData = userCheck.rows[0];

    // If user belongs to a department, ensure department folder exists and is active
    if (userData.department) {
      const deptFolderCheck = await pool.query(
        'SELECT * FROM folders WHERE department = $1 AND is_department = TRUE',
        [userData.department]
      );

      // If department folder exists and is trashed, restore it first
      if (deptFolderCheck.rows.length > 0) {
        const deptFolder = deptFolderCheck.rows[0];
        if (deptFolder.status === 'trashed') {
          await pool.query(
            `UPDATE folders SET status = 'active', trashed_at = NULL WHERE id = $1`,
            [deptFolder.id]
          );
        }
      } else {
        // If department folder doesn't exist, create it
        await pool.query(
          `INSERT INTO folders (name, department, is_department, created_by_role)
           VALUES ($1, $2, TRUE, 'admin')
           ON CONFLICT DO NOTHING`,
          [userData.department, userData.department]
        );
      }
    }

    // Restore the user
    const result = await pool.query(
      `UPDATE users SET status = 'active', trashed_at = NULL WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    // Restore their folders to the user's department
    await pool.query(
      `UPDATE folders SET status = 'active', trashed_at = NULL
       WHERE created_by_id = $1 AND status = 'trashed'`,
      [id]
    );

    // Restore their documents to the user's department
    await pool.query(
      `UPDATE documents SET status = 'approved', trashed_at = NULL
       WHERE uploaded_by_id = $1 AND status = 'trashed'`,
      [id]
    );

    // Log to trash_history
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, metadata)
       VALUES ('user', $1, $2, 'restored', $3)`,
      [result.rows[0].id, result.rows[0].name,
       JSON.stringify({ department: userData.department, email: userData.email })]
    );

    const r = result.rows[0];
    return res.json({
      message: `User and content restored to ${userData.department || 'their'} department`,
      user: {
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        department: r.department,
        status: r.status,
        avatar: r.avatar,
        createdAt: r.created_at,
      },
    });
  } catch (err) {
    console.error('restoreUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── PERMANENTLY DELETE USER ──────────────────────────────
export const permanentlyDeleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1 AND status = $2', [id, 'trashed']);
    if (userRes.rows.length === 0)
      return res.status(404).json({ error: 'User not found in trash' });

    const user = userRes.rows[0];

    // Permanently delete folders created by this user
    await pool.query(
      'DELETE FROM folders WHERE created_by_id = $1 AND is_department = FALSE',
      [id]
    );

    // Permanently delete documents uploaded by this user
    await pool.query('DELETE FROM documents WHERE uploaded_by_id = $1', [id]);

    // Delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    // Log to trash_history
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, actual_deletion_at, metadata)
       VALUES ('user', $1, $2, 'permanently_deleted', NOW(), $3)`,
      [user.id, user.name, JSON.stringify({ email: user.email })]
    );

    return res.json({ message: 'User permanently deleted' });
  } catch (err) {
    console.error('permanentlyDeleteUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
