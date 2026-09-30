-- ==========================================
-- 007_paid_status: "mark as paid" for expense rows
--   Expenses.paid_at: NULL = pending, a timestamp = paid (or received /
--   transferred, depending on the type). Audited like every other column.
--   Existing rows from months before the current one are backfilled as paid
--   (at the end of their month, since the real date is unknown); rows for the
--   current month and later stay pending.
-- Idempotent; recorded in SchemaMigrations by the runner only when it succeeds.
-- ==========================================

IF COL_LENGTH('Expenses', 'paid_at') IS NULL
    ALTER TABLE Expenses ADD paid_at DATETIME2 NULL;
GO

IF COL_LENGTH('Expenses_Audit', 'paid_at') IS NULL
    ALTER TABLE Expenses_Audit ADD paid_at DATETIME2 NULL;
GO

-- Same trigger as scripts/migrate.sql step 7, with paid_at audited. migrate.sql
-- now only creates the trigger when it is missing, so this version is kept.
CREATE OR ALTER TRIGGER trg_Expenses_Audit
ON Expenses
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Handle DELETES
    IF EXISTS(SELECT * FROM deleted) AND NOT EXISTS(SELECT * FROM inserted)
    BEGIN
        INSERT INTO Expenses_Audit (audit_action, id, user_id, category_id, type_id, month, amount, notes, sheet, paid_at)
        SELECT 'DELETE', id, user_id, category_id, type_id, month, amount, notes, sheet, paid_at
        FROM deleted;
    END

    -- Handle INSERTS
    IF EXISTS(SELECT * FROM inserted) AND NOT EXISTS(SELECT * FROM deleted)
    BEGIN
        INSERT INTO Expenses_Audit (audit_action, id, user_id, category_id, type_id, month, amount, notes, sheet, paid_at)
        SELECT 'INSERT', id, user_id, category_id, type_id, month, amount, notes, sheet, paid_at
        FROM inserted;
    END

    -- Handle UPDATES
    IF EXISTS(SELECT * FROM inserted) AND EXISTS(SELECT * FROM deleted)
    BEGIN
        INSERT INTO Expenses_Audit (audit_action, id, user_id, category_id, type_id, month, amount, notes, sheet, paid_at)
        SELECT 'UPDATE', id, user_id, category_id, type_id, month, amount, notes, sheet, paid_at
        FROM inserted;
    END
END
GO

-- Backfill: months before the current month (Indian time) are paid. The audit
-- trigger is paused for this one statement so history does not gain one audit
-- row per expense; the transaction re-enables it even if the update fails.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
    DECLARE @currentMonth VARCHAR(7) = FORMAT(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+05:30'), 'yyyy-MM');
    DISABLE TRIGGER trg_Expenses_Audit ON Expenses;
    UPDATE Expenses
    SET paid_at = CAST(EOMONTH(CAST(month + '-01' AS DATE)) AS DATETIME2)
    WHERE paid_at IS NULL AND month < @currentMonth;
    PRINT CONCAT('Backfilled ', @@ROWCOUNT, ' rows before ', @currentMonth, ' as paid.');
    ENABLE TRIGGER trg_Expenses_Audit ON Expenses;
COMMIT TRANSACTION;
GO

-- Pending lists read (user, month) with type and paid state
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Expenses_User_Month' AND object_id = OBJECT_ID('Expenses'))
    CREATE INDEX IX_Expenses_User_Month ON Expenses (user_id, month) INCLUDE (category_id, type_id, amount, paid_at) WITH (DROP_EXISTING = ON);
ELSE
    CREATE INDEX IX_Expenses_User_Month ON Expenses (user_id, month) INCLUDE (category_id, type_id, amount, paid_at);
GO
