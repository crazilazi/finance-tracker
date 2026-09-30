-- ==========================================
-- 005_unlock_attempts: brute-force protection for the unlock PIN
--   One row per user. attempt_count counts PIN attempts since the last correct
--   PIN; each attempt is reserved atomically *before* the PIN is checked, so
--   parallel requests cannot all see the same count. After the limit the row
--   is locked until locked_until, and each further lockout doubles in length
--   (capped at 24 h). A correct PIN resets the row.
-- Idempotent; recorded in SchemaMigrations by the runner.
-- ==========================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UnlockAttempts' AND xtype='U')
BEGIN
    CREATE TABLE UnlockAttempts (
        user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY FOREIGN KEY REFERENCES Users(id),
        attempt_count INT NOT NULL DEFAULT 0,
        lockout_count INT NOT NULL DEFAULT 0,
        locked_until DATETIME2 NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
