-- Migration: Add indexes and support for hierarchy restore operations
-- Run this migration to optimize restore operations

-- Index for faster folder hierarchy traversal
CREATE INDEX IF NOT EXISTS idx_folders_parent_status
  ON folders(parent_id, status);

-- Index for faster trashed item queries
CREATE INDEX IF NOT EXISTS idx_folders_trashed
  ON folders(status, trashed_at)
  WHERE status = 'trashed';

CREATE INDEX IF NOT EXISTS idx_documents_trashed
  ON documents(status, trashed_at)
  WHERE status = 'trashed';

-- Index for is_department lookups
CREATE INDEX IF NOT EXISTS idx_folders_is_department
  ON folders(is_department, department)
  WHERE is_department = TRUE;

-- ============================================
-- RECURSIVE CTE for getting folder hierarchy
-- This can be used for debugging or one-off queries
-- ============================================
-- Example usage:
-- SELECT * FROM get_folder_hierarchy('your-folder-uuid');

CREATE OR REPLACE FUNCTION get_folder_hierarchy(start_folder_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  parent_id UUID,
  department VARCHAR(100),
  is_department BOOLEAN,
  status VARCHAR(20),
  trashed_at TIMESTAMPTZ,
  depth INT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE folder_chain AS (
    -- Base case: start with the given folder
    SELECT
      f.id, f.name, f.parent_id, f.department, f.is_department, f.status, f.trashed_at,
      1 as depth
    FROM folders f
    WHERE f.id = start_folder_id

    UNION ALL

    -- Recursive case: get parent folders
    SELECT
      f.id, f.name, f.parent_id, f.department, f.is_department, f.status, f.trashed_at,
      fc.depth + 1
    FROM folders f
    INNER JOIN folder_chain fc ON f.id = fc.parent_id
    WHERE fc.depth < 100  -- Safety limit
  )
  SELECT * FROM folder_chain
  ORDER BY depth ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function to restore a document with hierarchy
-- Can be called directly from SQL: SELECT restore_document_with_hierarchy('doc-uuid', 'user-uuid');
-- ============================================
CREATE OR REPLACE FUNCTION restore_document_with_hierarchy(
  p_document_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  folders_restored INT,
  department_restored BOOLEAN
) AS $$
DECLARE
  v_doc RECORD;
  v_folder_id UUID;
  v_folders_restored INT := 0;
  v_department_restored BOOLEAN := FALSE;
  v_folder RECORD;
BEGIN
  -- Get document
  SELECT id, title, folder_id, status INTO v_doc
  FROM documents WHERE id = p_document_id;

  IF v_doc.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Document not found'::TEXT, 0, FALSE;
    RETURN;
  END IF;

  IF v_doc.status != 'trashed' THEN
    RETURN QUERY SELECT TRUE, 'Document already active'::TEXT, 0, FALSE;
    RETURN;
  END IF;

  v_folder_id := v_doc.folder_id;

  -- Restore folders from root to leaf (ordered by depth DESC means closest to root first)
  FOR v_folder IN (
    SELECT * FROM get_folder_hierarchy(v_folder_id) ORDER BY depth DESC
  ) LOOP
    IF v_folder.status = 'trashed' THEN
      UPDATE folders SET status = 'active', trashed_at = NULL WHERE id = v_folder.id;
      v_folders_restored := v_folders_restored + 1;

      IF v_folder.is_department THEN
        v_department_restored := TRUE;
      END IF;
    END IF;
  END LOOP;

  -- Restore the document
  UPDATE documents
  SET status = 'approved', trashed_at = NULL, archived_at = NULL
  WHERE id = p_document_id;

  RETURN QUERY SELECT TRUE,
    format('Document restored with %s folders', v_folders_restored)::TEXT,
    v_folders_restored,
    v_department_restored;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_folder_hierarchy(UUID) IS
  'Returns the complete folder hierarchy from a given folder up to the root, ordered by depth';

COMMENT ON FUNCTION restore_document_with_hierarchy(UUID, UUID) IS
  'Restores a document along with its complete folder hierarchy (department → folders → document)';
