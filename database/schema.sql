-- 网站运维工作记录表 · SQLite 数据库结构
-- v1.2.1

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS record_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  menu_title TEXT,
  description TEXT,
  note TEXT,
  columns_json TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS record_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_key TEXT NOT NULL,
  record_code TEXT,
  record_date TEXT,
  row_json TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (table_key) REFERENCES record_tables(table_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_record_rows_table_key ON record_rows(table_key);
CREATE INDEX IF NOT EXISTS idx_record_rows_record_code ON record_rows(record_code);
CREATE INDEX IF NOT EXISTS idx_record_rows_record_date ON record_rows(record_date);
