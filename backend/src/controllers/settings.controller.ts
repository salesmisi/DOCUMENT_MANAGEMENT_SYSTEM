import { Request, Response } from 'express';
import pool from '../db';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth.middleware';

// Get current logo
export const getLogo = async (req: Request, res: Response) => {
  try {
    const logoResult = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'app_logo'`
    );
    const sizeResult = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'logo_size'`
    );

    const logo = logoResult.rows.length > 0 ? logoResult.rows[0].setting_value : '/maptechlogo.png';
    const size = sizeResult.rows.length > 0 ? sizeResult.rows[0].setting_value : 'medium';

    res.json({ logo, size });
  } catch (error) {
    console.error('Error fetching logo:', error);
    res.status(500).json({ message: 'Failed to fetch logo' });
  }
};

// Upload new logo
export const uploadLogo = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const logoPath = `/uploads/logos/${req.file.filename}`;
    const userId = req.userId;

    // Update or insert the logo setting
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value, setting_type, updated_by, updated_at)
       VALUES ('app_logo', $1, 'image', $2, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, updated_by = $2, updated_at = NOW()`,
      [logoPath, userId]
    );

    res.json({ logo: logoPath, message: 'Logo updated successfully' });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ message: 'Failed to upload logo' });
  }
};

// Reset logo to default
export const resetLogo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const defaultLogo = '/maptechlogo.png';

    // Get current logo to delete the file if it's a custom one
    const current = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'app_logo'`
    );

    if (current.rows.length > 0 && current.rows[0].setting_value.startsWith('/uploads/')) {
      const oldFilePath = path.join(process.cwd(), current.rows[0].setting_value);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Reset to default
    await pool.query(
      `UPDATE app_settings SET setting_value = $1, updated_by = $2, updated_at = NOW()
       WHERE setting_key = 'app_logo'`,
      [defaultLogo, userId]
    );

    res.json({ logo: defaultLogo, message: 'Logo reset to default' });
  } catch (error) {
    console.error('Error resetting logo:', error);
    res.status(500).json({ message: 'Failed to reset logo' });
  }
};

// Update logo size
export const updateLogoSize = async (req: AuthRequest, res: Response) => {
  try {
    const { size } = req.body;
    const userId = req.userId;

    // Validate size
    const validSizes = ['small', 'medium', 'large'];
    if (!size || !validSizes.includes(size)) {
      return res.status(400).json({ message: 'Invalid size. Must be small, medium, or large.' });
    }

    // Update or insert the logo size setting
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value, setting_type, updated_by, updated_at)
       VALUES ('logo_size', $1, 'text', $2, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, updated_by = $2, updated_at = NOW()`,
      [size, userId]
    );

    res.json({ size, message: 'Logo size updated successfully' });
  } catch (error) {
    console.error('Error updating logo size:', error);
    res.status(500).json({ message: 'Failed to update logo size' });
  }
};
