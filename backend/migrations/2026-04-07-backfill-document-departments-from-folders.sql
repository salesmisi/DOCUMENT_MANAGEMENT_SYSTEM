-- Backfill document.department and document.department_id from folder hierarchy.
-- This fixes older uploads where the stored document department did not match the
-- selected folder's root department, which could hide documents from staff views.

WITH RECURSIVE folder_chain AS (
  SELECT
    d.id AS document_id,
    f.id AS folder_id,
    f.parent_id,
    f.name,
    f.department,
    f.is_department,
    1 AS depth
  FROM documents d
  JOIN folders f ON f.id = d.folder_id
  WHERE d.folder_id IS NOT NULL

  UNION ALL

  SELECT
    fc.document_id,
    f.id AS folder_id,
    f.parent_id,
    f.name,
    f.department,
    f.is_department,
    fc.depth + 1 AS depth
  FROM folder_chain fc
  JOIN folders f ON f.id = fc.parent_id
  WHERE fc.parent_id IS NOT NULL
    AND fc.depth < 100
),
resolved_departments AS (
  SELECT DISTINCT ON (document_id)
    document_id,
    COALESCE(NULLIF(BTRIM(department), ''), NULLIF(BTRIM(name), '')) AS resolved_department
  FROM folder_chain
  WHERE is_department = TRUE
     OR parent_id IS NULL
  ORDER BY document_id,
    CASE WHEN is_department THEN 0 ELSE 1 END ASC,
    depth DESC
),
resolved_targets AS (
  SELECT
    rd.document_id,
    rd.resolved_department,
    dep.id AS resolved_department_id
  FROM resolved_departments rd
  LEFT JOIN departments dep
    ON LOWER(dep.name) = LOWER(rd.resolved_department)
  WHERE rd.resolved_department IS NOT NULL
),
updated_documents AS (
  UPDATE documents d
  SET
    department = rt.resolved_department,
    department_id = rt.resolved_department_id
  FROM resolved_targets rt
  WHERE d.id = rt.document_id
    AND (
      COALESCE(BTRIM(d.department), '') <> COALESCE(BTRIM(rt.resolved_department), '')
      OR d.department_id IS DISTINCT FROM rt.resolved_department_id
    )
  RETURNING d.id, d.reference, rt.resolved_department
)
SELECT COUNT(*)::INT AS updated_count
FROM updated_documents;