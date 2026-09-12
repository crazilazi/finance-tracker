-- ==========================================
-- 002_features: Phase A product features
--   Category metadata for the category manager, recurring templates,
--   budgets (Phase B) and cadence-based reminders (Phase B).
-- Every statement is idempotent; the runner records this file in
-- SchemaMigrations so it is only applied once.
-- ==========================================

IF COL_LENGTH('Categories', 'icon') IS NULL
    ALTER TABLE Categories ADD icon NVARCHAR(16) NULL;
GO

IF COL_LENGTH('Categories', 'color') IS NULL
    ALTER TABLE Categories ADD color VARCHAR(16) NULL;
GO

IF COL_LENGTH('Categories', 'is_recurring') IS NULL
    ALTER TABLE Categories ADD is_recurring BIT NOT NULL CONSTRAINT DF_Categories_is_recurring DEFAULT 0;
GO

IF COL_LENGTH('Categories', 'default_amount') IS NULL
    ALTER TABLE Categories ADD default_amount DECIMAL(18,2) NULL;
GO

IF COL_LENGTH('Categories', 'budget_amount') IS NULL
    ALTER TABLE Categories ADD budget_amount DECIMAL(18,2) NULL;
GO

IF COL_LENGTH('Categories', 'cadence') IS NULL
    ALTER TABLE Categories ADD cadence VARCHAR(10) NULL;
GO

IF COL_LENGTH('Categories', 'archived') IS NULL
    ALTER TABLE Categories ADD archived BIT NOT NULL CONSTRAINT DF_Categories_archived DEFAULT 0;
GO

-- Speeds up the per-category stats and month summaries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Expenses_User_Month' AND object_id = OBJECT_ID('Expenses'))
    CREATE INDEX IX_Expenses_User_Month ON Expenses (user_id, month) INCLUDE (category_id, amount);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Expenses_Category_Month' AND object_id = OBJECT_ID('Expenses'))
    CREATE INDEX IX_Expenses_Category_Month ON Expenses (category_id, month) INCLUDE (amount);
GO
