-- DROP AND RECREATE delete_requests TABLE WITH CORRECT SCHEMA
-- WARNING: This will remove all existing delete requests!

DROP TABLE IF EXISTS delete_requests CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE delete_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('folder','document')),
  target_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  denied_by UUID REFERENCES users(id) ON DELETE SET NULL,
  denied_at TIMESTAMPTZ
);
