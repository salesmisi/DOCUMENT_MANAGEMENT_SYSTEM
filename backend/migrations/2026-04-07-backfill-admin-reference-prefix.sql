-- Backfill admin-uploaded document references to use the ADM prefix when the
-- target ADM reference is not already taken.

WITH admin_docs AS (
  SELECT
    d.id,
    d.reference,
    regexp_replace(d.reference, '^[^_]+', 'ADM') AS target_reference
  FROM documents d
  JOIN users u ON u.id = d.uploaded_by_id
  WHERE LOWER(u.role) = 'admin'
    AND d.reference !~ '^ADM_'
),
unique_targets AS (
  SELECT target_reference
  FROM admin_docs
  GROUP BY target_reference
  HAVING COUNT(*) = 1
),
available_targets AS (
  SELECT a.*
  FROM admin_docs a
  JOIN unique_targets ut ON ut.target_reference = a.target_reference
  WHERE NOT EXISTS (
    SELECT 1
    FROM documents existing
    WHERE existing.reference = a.target_reference
  )
),
updated_documents AS (
  UPDATE documents d
  SET reference = a.target_reference
  FROM available_targets a
  WHERE d.id = a.id
  RETURNING d.id, d.reference
)
SELECT COUNT(*)::INT AS updated_count
FROM updated_documents;