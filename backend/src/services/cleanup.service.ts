import pool from '../db';
import cron, { ScheduledTask } from 'node-cron';

export class CleanupService {
  private static instance: CleanupService;
  private isRunning = false;
  private cronJob: ScheduledTask | null = null;

  private constructor() {}

  public static getInstance(): CleanupService {
    if (!CleanupService.instance) {
      CleanupService.instance = new CleanupService();
    }
    return CleanupService.instance;
  }

  /**
   * Start the cleanup scheduler
   * Runs daily at 2:00 AM to clean up items older than 30 days
   */
  public start() {
    if (this.isRunning) {
      console.log('Cleanup service is already running');
      return;
    }

    // Run daily at 2:00 AM (cron: '0 2 * * *')
    this.cronJob = cron.schedule('0 2 * * *', async () => {
      await this.performCleanup();
    });

    this.isRunning = true;
    console.log('🗑️  Cleanup service started (runs daily at 2:00 AM)');
  }

  /**
   * Stop the cleanup scheduler
   */
  public stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log('Cleanup service stopped');
  }

  /**
   * Manually trigger cleanup (for testing or admin actions)
   */
  public async performCleanup(): Promise<{
    documentsDeleted: number;
    foldersDeleted: number;
    usersDeleted: number;
  }> {
    console.log('🗑️  Starting trash cleanup...');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const retentionDays = 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // 1. Clean up DOCUMENTS older than 30 days
      const documentsResult = await client.query(
        `DELETE FROM documents
         WHERE status = 'trashed'
         AND trashed_at IS NOT NULL
         AND trashed_at < $1
         RETURNING id, title, trashed_at`,
        [cutoffDate]
      );

      // Log deletions to trash_history
      for (const doc of documentsResult.rows) {
        await client.query(
          `INSERT INTO trash_history (target_type, target_id, target_name, action, actual_deletion_at, metadata)
           VALUES ('document', $1, $2, 'permanently_deleted', NOW(), $3)`,
          [doc.id, doc.title, JSON.stringify({ trashed_at: doc.trashed_at })]
        );
      }

      // 2. Clean up FOLDERS older than 30 days
      const foldersResult = await client.query(
        `DELETE FROM folders
         WHERE status = 'trashed'
         AND trashed_at IS NOT NULL
         AND trashed_at < $1
         RETURNING id, name, trashed_at`,
        [cutoffDate]
      );

      for (const folder of foldersResult.rows) {
        await client.query(
          `INSERT INTO trash_history (target_type, target_id, target_name, action, actual_deletion_at, metadata)
           VALUES ('folder', $1, $2, 'permanently_deleted', NOW(), $3)`,
          [folder.id, folder.name, JSON.stringify({ trashed_at: folder.trashed_at })]
        );
      }

      // 3. Clean up USERS older than 30 days
      const usersResult = await client.query(
        `DELETE FROM users
         WHERE status = 'trashed'
         AND trashed_at IS NOT NULL
         AND trashed_at < $1
         RETURNING id, name, email, trashed_at`,
        [cutoffDate]
      );

      for (const usr of usersResult.rows) {
        await client.query(
          `INSERT INTO trash_history (target_type, target_id, target_name, action, actual_deletion_at, metadata)
           VALUES ('user', $1, $2, 'permanently_deleted', NOW(), $3)`,
          [usr.id, usr.name, JSON.stringify({ email: usr.email, trashed_at: usr.trashed_at })]
        );
      }

      await client.query('COMMIT');

      const summary = {
        documentsDeleted: documentsResult.rowCount || 0,
        foldersDeleted: foldersResult.rowCount || 0,
        usersDeleted: usersResult.rowCount || 0,
      };

      console.log(`✅ Cleanup completed:`, summary);
      return summary;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Cleanup failed:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get items scheduled for deletion (for preview/UI)
   */
  public async getScheduledDeletions() {
    const retentionDays = 30;
    const client = await pool.connect();

    try {
      const documents = await client.query(
        `SELECT id, title, reference, department, file_type, trashed_at,
                EXTRACT(DAY FROM (NOW() - trashed_at)) as days_in_trash
         FROM documents
         WHERE status = 'trashed' AND trashed_at IS NOT NULL
         ORDER BY trashed_at ASC`
      );

      const folders = await client.query(
        `SELECT id, name, department, trashed_at,
                EXTRACT(DAY FROM (NOW() - trashed_at)) as days_in_trash
         FROM folders
         WHERE status = 'trashed' AND trashed_at IS NOT NULL
         ORDER BY trashed_at ASC`
      );

      const users = await client.query(
        `SELECT id, name, email, department, trashed_at,
                EXTRACT(DAY FROM (NOW() - trashed_at)) as days_in_trash
         FROM users
         WHERE status = 'trashed' AND trashed_at IS NOT NULL
         ORDER BY trashed_at ASC`
      );

      return {
        documents: documents.rows.map((d) => ({
          ...d,
          daysRemaining: Math.max(0, retentionDays - Math.floor(d.days_in_trash)),
        })),
        folders: folders.rows.map((f) => ({
          ...f,
          daysRemaining: Math.max(0, retentionDays - Math.floor(f.days_in_trash)),
        })),
        users: users.rows.map((u) => ({
          ...u,
          daysRemaining: Math.max(0, retentionDays - Math.floor(u.days_in_trash)),
        })),
      };
    } finally {
      client.release();
    }
  }
}

export default CleanupService.getInstance();
