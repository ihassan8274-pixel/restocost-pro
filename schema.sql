-- ============================================================
-- RestoCost Pro v8 - Schema
-- منصة تقارير وتحليل تكلفة وتحليل مالي متكاملة
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#D4AF37',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  region TEXT,
  opening NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_records (
  month DATE NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  opening NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchases NUMERIC(14,2) NOT NULL DEFAULT 0,
  transfers NUMERIC(14,2) NOT NULL DEFAULT 0,
  sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (month, branch_id)
);

CREATE TABLE IF NOT EXISTS expense_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('fixed','variable','administrative','operational','other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  expense_type_id INTEGER NOT NULL REFERENCES expense_types(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('revenue','cost','expense','profit')),
  planned NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, branch_id, type)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS state_backups (
  id BIGSERIAL PRIMARY KEY,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS monthly_records_month_idx ON monthly_records(month);
CREATE INDEX IF NOT EXISTS monthly_records_branch_idx ON monthly_records(branch_id);
CREATE INDEX IF NOT EXISTS branches_brand_idx ON branches(brand_id);
CREATE INDEX IF NOT EXISTS expenses_month_idx ON expenses(month);
CREATE INDEX IF NOT EXISTS expenses_branch_idx ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS budgets_month_idx ON budgets(month);
CREATE INDEX IF NOT EXISTS budgets_branch_idx ON budgets(branch_id);

COMMIT;