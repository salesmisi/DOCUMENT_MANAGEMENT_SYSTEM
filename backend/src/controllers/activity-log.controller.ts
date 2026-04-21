import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const DARK_GREEN = 'FF005F02';
const GOLD = 'FFC0B87A';
const LIGHT_GREEN = 'FFE8F5E9';
const WHITE = 'FFFFFFFF';

const applyCellStyle = (cell: ExcelJS.Cell, options?: {
  fillColor?: string;
  fontColor?: string;
  bold?: boolean;
  horizontal?: ExcelJS.Alignment['horizontal'];
  vertical?: ExcelJS.Alignment['vertical'];
  wrapText?: boolean;
}) => {
  cell.font = {
    name: 'Arial',
    size: 10,
    bold: options?.bold ?? false,
    color: options?.fontColor ? { argb: options.fontColor } : undefined,
  };
  cell.alignment = {
    horizontal: options?.horizontal ?? 'left',
    vertical: options?.vertical ?? 'middle',
    wrapText: options?.wrapText ?? false,
  };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  };
  if (options?.fillColor) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: options.fillColor },
    };
  }
};

// Get all activity logs (admin only)
export const getActivityLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT 
        id, user_id, user_name, user_role, action, target, target_type, 
        ip_address, details, created_at
       FROM activity_logs 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [Number(limit), Number(offset)]
    );

    // Normalize to camelCase for frontend
    const logs = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      action: row.action,
      target: row.target,
      targetType: row.target_type,
      timestamp: row.created_at,
      ipAddress: row.ip_address,
      details: row.details,
    }));

    return res.json({ logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('getActivityLogs error:', message);
    return res.status(500).json({ error: message });
  }
};

// Create a new activity log
export const createActivityLog = async (req: AuthRequest, res: Response) => {
  try {
    const { action, target, targetType, ipAddress, details } = req.body;

    if (!action || !target || !targetType) {
      return res.status(400).json({ error: 'action, target, and targetType are required' });
    }

    // Get user info from auth middleware or request body
    const userId = req.userId || req.body.userId;
    const userName = req.body.userName || 'Unknown';
    const userRole = req.body.userRole || 'staff';

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await pool.query(
      `INSERT INTO activity_logs 
        (user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [userId, userName, userRole, action, target, targetType, ipAddress || null, details || null]
    );

    const row = result.rows[0];
    const log = {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      action: row.action,
      target: row.target,
      targetType: row.target_type,
      timestamp: row.created_at,
      ipAddress: row.ip_address,
      details: row.details,
    };

    return res.status(201).json({ log });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('createActivityLog error:', message);
    return res.status(500).json({ error: message });
  }
};

// Download activity logs as Excel using template
export const downloadActivityLogs = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT created_at, user_name, action, target, ip_address, details
       FROM activity_logs
       ORDER BY created_at DESC`
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Activity Logs', {
      properties: { defaultRowHeight: 22 },
      views: [{ state: 'frozen', ySplit: 2 }],
    });

    worksheet.columns = [
      { header: 'Timestamp', key: 'timestamp', width: 24 },
      { header: 'User', key: 'user', width: 22 },
      { header: 'Action', key: 'action', width: 22 },
      { header: 'Target', key: 'target', width: 24 },
      { header: 'IP Address', key: 'ipAddress', width: 18 },
      { header: 'Details', key: 'details', width: 50 },
    ];

    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'MAPTECH DOCUMENT MANAGEMENT SYSTEM - ACTIVITY LOGS';
    applyCellStyle(titleCell, {
      fillColor: DARK_GREEN,
      fontColor: WHITE,
      bold: true,
      horizontal: 'center',
      vertical: 'middle',
    });
    titleCell.font = { ...titleCell.font, size: 14 };
    worksheet.getRow(1).height = 28;

    const headerRow = worksheet.getRow(2);
    headerRow.values = ['Timestamp', 'User', 'Action', 'Target', 'IP Address', 'Details'];
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      applyCellStyle(cell, {
        fillColor: GOLD,
        fontColor: DARK_GREEN,
        bold: true,
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      });
    });

    result.rows.forEach((log, index) => {
      const timestamp = log.created_at
        ? new Date(log.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })
        : '';

      const row = worksheet.addRow([
        timestamp,
        log.user_name || '',
        log.action || '',
        log.target || '',
        log.ip_address || '',
        log.details || '',
      ]);

      row.height = 22;
      row.eachCell((cell) => {
        applyCellStyle(cell, {
          fillColor: index % 2 === 0 ? LIGHT_GREEN : WHITE,
          fontColor: 'FF333333',
          vertical: 'middle',
          wrapText: true,
        });
      });
    });

    const filename = `Activity_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('downloadActivityLogs error:', message);
    return res.status(500).json({ error: message });
  }
};

// Download activity logs as PDF
export const downloadActivityLogsPdf = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT created_at, user_name, action, target, ip_address, details
       FROM activity_logs
       ORDER BY created_at DESC`
    );

    const filename = `Activity_Logs_${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    doc.pipe(res);

    const darkGreen = '#005F02';
    const gold = '#C0B87A';
    const lightGreen = '#E8F5E9';
    const white = '#FFFFFF';

    // Title bar
    doc.rect(30, 30, doc.page.width - 60, 40).fill(darkGreen);
    doc.fontSize(14).fill(white).text(
      'MAPTECH DOCUMENT MANAGEMENT SYSTEM - ACTIVITY LOGS',
      30, 42, { align: 'center', width: doc.page.width - 60 }
    );

    // Table config
    const colWidths = [120, 100, 110, 130, 95, 195];
    const headers = ['TIMESTAMP', 'USER', 'ACTION', 'TARGET', 'IP ADDRESS', 'DETAILS'];
    const tableLeft = 30;
    let y = 80;
    const rowHeight = 22;
    const headerHeight = 26;

    // Header row
    let x = tableLeft;
    headers.forEach((header, i) => {
      doc.rect(x, y, colWidths[i], headerHeight).fill(gold);
      doc.fontSize(8).fill(darkGreen).text(
        header, x + 4, y + 8,
        { width: colWidths[i] - 8, align: 'center' }
      );
      x += colWidths[i];
    });
    y += headerHeight;

    // Data rows
    const pageBottom = doc.page.height - 50;

    result.rows.forEach((log, index) => {
      if (y + rowHeight > pageBottom) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
        y = 30;

        // Repeat header on new page
        x = tableLeft;
        headers.forEach((header, i) => {
          doc.rect(x, y, colWidths[i], headerHeight).fill(gold);
          doc.fontSize(8).fill(darkGreen).text(
            header, x + 4, y + 8,
            { width: colWidths[i] - 8, align: 'center' }
          );
          x += colWidths[i];
        });
        y += headerHeight;
      }

      const bgColor = index % 2 === 0 ? lightGreen : white;
      const timestamp = log.created_at
        ? new Date(log.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })
        : '';

      const rowData = [
        timestamp,
        log.user_name || '',
        log.action || '',
        log.target || '',
        log.ip_address || '',
        log.details || '',
      ];

      x = tableLeft;
      rowData.forEach((text, i) => {
        doc.rect(x, y, colWidths[i], rowHeight).fill(bgColor);
        doc.rect(x, y, colWidths[i], rowHeight).stroke('#CCCCCC');
        doc.fontSize(7).fill('#333333').text(
          String(text), x + 4, y + 6,
          { width: colWidths[i] - 8, lineBreak: false }
        );
        x += colWidths[i];
      });

      y += rowHeight;
    });

    doc.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('downloadActivityLogsPdf error:', message);
    return res.status(500).json({ error: message });
  }
};

// Get activity log count
export const getActivityLogCount = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM activity_logs');
    return res.json({ count: result.rows[0].count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('getActivityLogCount error:', message);
    return res.status(500).json({ error: message });
  }
};

// Archive activity logs (move to activity_logs_archive and clear)
export const downloadAndArchiveActivityLogs = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM activity_logs');
    if (countResult.rows[0].count === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No activity logs to archive' });
    }

    // Move logs to archive table
    await client.query(
      `INSERT INTO activity_logs_archive (id, user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
       SELECT id, user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at
       FROM activity_logs`
    );

    // Clear the activity_logs table
    await client.query('DELETE FROM activity_logs');

    await client.query('COMMIT');

    return res.json({ success: true, archived: countResult.rows[0].count });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('downloadAndArchiveActivityLogs error:', message);
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
};

export default {
  getActivityLogs,
  createActivityLog,
  downloadActivityLogs,
  downloadActivityLogsPdf,
  getActivityLogCount,
  downloadAndArchiveActivityLogs,
};
