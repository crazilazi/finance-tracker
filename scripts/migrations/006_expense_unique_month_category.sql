-- ==========================================
-- 006_expense_unique_month_category: one row per (user, month, category)
--   The app has always assumed this (every write is an upsert on it), but the
--   database did not enforce it, so concurrent saves or older category merges
--   could leave two rows. This migration never deletes data: if duplicates
--   exist it stops, and scripts/dedupe-expenses.js resolves them with you.
-- Idempotent; recorded in SchemaMigrations by the runner only when it succeeds.
-- ==========================================

IF EXISTS (
    SELECT 1 FROM Expenses
    GROUP BY user_id, month, category_id
    HAVING COUNT(*) > 1
)
BEGIN
    ;THROW 50006, N'Duplicate expense rows exist for the same user, month and category. Run "node scripts/dedupe-expenses.js" to review and resolve them, then run the migration again. Nothing was changed.', 1;
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Expenses_User_Month_Category' AND object_id = OBJECT_ID('Expenses'))
    CREATE UNIQUE INDEX UX_Expenses_User_Month_Category ON Expenses (user_id, month, category_id);
GO
