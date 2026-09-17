-- ==========================================
-- 004_unlock_revocations: durable revocation list for per-tab unlock grants
--   Lock / extend insert the grant's jti here so a revoked grant is refused by
--   every app instance, not only the one that revoked it. Rows are pruned once
--   the grant would have expired anyway.
-- Idempotent; recorded in SchemaMigrations by the runner.
-- ==========================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RevokedUnlockGrants' AND xtype='U')
BEGIN
    CREATE TABLE RevokedUnlockGrants (
        jti UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        user_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(id),
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RevokedUnlockGrants_Expires' AND object_id = OBJECT_ID('RevokedUnlockGrants'))
    CREATE INDEX IX_RevokedUnlockGrants_Expires ON RevokedUnlockGrants (expires_at);
GO
