-- ==========================================
-- 008_sessions: revocable sign-in sessions
--   Users.session_version is signed into every session cookie. "Sign out
--   other devices" increments it, so every older cookie stops working at once.
--   RevokedSessions holds the id (jti) of each session ended by Log out, until
--   the cookie would have expired anyway.
-- Idempotent; recorded in SchemaMigrations by the runner only when it succeeds.
-- ==========================================

IF COL_LENGTH('Users', 'session_version') IS NULL
    ALTER TABLE Users ADD session_version INT NOT NULL CONSTRAINT DF_Users_session_version DEFAULT 0;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RevokedSessions' AND xtype='U')
BEGIN
    CREATE TABLE RevokedSessions (
        jti UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        user_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(id),
        expires_at DATETIME2 NOT NULL,
        revoked_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RevokedSessions_Expires' AND object_id = OBJECT_ID('RevokedSessions'))
    CREATE INDEX IX_RevokedSessions_Expires ON RevokedSessions (expires_at);
GO
