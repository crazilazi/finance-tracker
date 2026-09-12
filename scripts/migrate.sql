-- ==========================================
-- Gaddi Tracker Relational Schema Migration
-- ==========================================

-- 1. Create Users Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
BEGIN
    CREATE TABLE Users (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        oauth_provider VARCHAR(50) NULL,
        oauth_id VARCHAR(100) NULL,
        username NVARCHAR(100) NOT NULL,
        email VARCHAR(255) NULL,
        created_at DATETIME DEFAULT GETDATE()
    );
END
GO

-- 2. Create Types Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Types' AND xtype='U')
BEGIN
    CREATE TABLE Types (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name VARCHAR(50) NOT NULL UNIQUE
    );
    INSERT INTO Types (id, name) VALUES 
        (NEWID(), 'Expense'), 
        (NEWID(), 'Income'), 
        (NEWID(), 'EMI'), 
        (NEWID(), 'Saving');
END
GO

-- 3. Create Categories Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Categories' AND xtype='U')
BEGIN
    CREATE TABLE Categories (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(100) NOT NULL,
        type_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Types(id),
        user_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(id),
        UNIQUE(name, type_id, user_id)
    );
END
GO

-- 4. Rename old flat Expenses table to Expenses_Legacy
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Expenses') AND name = 'category')
BEGIN
    EXEC sp_rename 'Expenses', 'Expenses_Legacy';
END
GO

-- 5. Create new Relational Expenses Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Expenses' AND xtype='U')
BEGIN
    CREATE TABLE Expenses (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(id),
        category_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Categories(id),
        type_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Types(id),
        month VARCHAR(7) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        notes NVARCHAR(500) NULL,
        sheet NVARCHAR(100) NULL
    );
END
GO

-- 6. Create Expenses Audit Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Expenses_Audit' AND xtype='U')
BEGIN
    CREATE TABLE Expenses_Audit (
        audit_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        audit_action VARCHAR(10) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
        audit_timestamp DATETIME DEFAULT GETDATE(),
        id UNIQUEIDENTIFIER NOT NULL,
        user_id UNIQUEIDENTIFIER NOT NULL,
        category_id UNIQUEIDENTIFIER NOT NULL,
        type_id UNIQUEIDENTIFIER NOT NULL,
        month VARCHAR(7) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        notes NVARCHAR(500) NULL,
        sheet NVARCHAR(100) NULL
    );
END
GO

-- 7. Create Trigger for Audits
CREATE OR ALTER TRIGGER trg_Expenses_Audit
ON Expenses
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Handle DELETES
    IF EXISTS(SELECT * FROM deleted) AND NOT EXISTS(SELECT * FROM inserted)
    BEGIN
        INSERT INTO Expenses_Audit (audit_action, id, user_id, category_id, type_id, month, amount, notes, sheet)
        SELECT 'DELETE', id, user_id, category_id, type_id, month, amount, notes, sheet
        FROM deleted;
    END

    -- Handle INSERTS
    IF EXISTS(SELECT * FROM inserted) AND NOT EXISTS(SELECT * FROM deleted)
    BEGIN
        INSERT INTO Expenses_Audit (audit_action, id, user_id, category_id, type_id, month, amount, notes, sheet)
        SELECT 'INSERT', id, user_id, category_id, type_id, month, amount, notes, sheet
        FROM inserted;
    END

    -- Handle UPDATES
    IF EXISTS(SELECT * FROM inserted) AND EXISTS(SELECT * FROM deleted)
    BEGIN
        INSERT INTO Expenses_Audit (audit_action, id, user_id, category_id, type_id, month, amount, notes, sheet)
        SELECT 'UPDATE', id, user_id, category_id, type_id, month, amount, notes, sheet
        FROM inserted;
    END
END
GO


-- ==========================================
-- DATA MIGRATION LOGIC
-- ==========================================
IF EXISTS (SELECT 1 FROM sysobjects WHERE name='Expenses_Legacy' AND xtype='U')
BEGIN
    PRINT 'Migrating legacy flat data to relational schema...'

    -- A. Seed Users from historic data
    INSERT INTO Users (id, username)
    SELECT NEWID(), u.username 
    FROM (
        SELECT DISTINCT ISNULL(username, 'Default User') as username
        FROM Expenses_Legacy
        WHERE ISNULL(username, 'Default User') NOT IN (SELECT username FROM Users)
    ) u;

    -- B. Seed Categories from historic data
    INSERT INTO Categories (id, name, type_id, user_id)
    SELECT NEWID(), cat.name, cat.type_id, cat.user_id 
    FROM (
        SELECT DISTINCT 
            el.category as name, 
            ISNULL(t.id, (SELECT TOP 1 id FROM Types WHERE name = 'Expense')) as type_id,
            u.id as user_id
        FROM Expenses_Legacy el
        JOIN Users u ON ISNULL(el.username, 'Default User') = u.username
        LEFT JOIN Types t ON el.type = t.name
        WHERE NOT EXISTS (
            SELECT 1 FROM Categories c 
            WHERE c.name = el.category 
            AND c.type_id = ISNULL(t.id, (SELECT TOP 1 id FROM Types WHERE name = 'Expense'))
            AND c.user_id = u.id
        )
    ) cat;

    -- C. Migrate records to new Expenses table mapping IDs
    INSERT INTO Expenses (id, user_id, category_id, type_id, month, amount, sheet)
    SELECT 
        ISNULL(TRY_CAST(el.uuid AS UNIQUEIDENTIFIER), NEWID()),
        u.id,
        c.id,
        ISNULL(t.id, (SELECT TOP 1 id FROM Types WHERE name = 'Expense')),
        el.month,
        el.amount,
        el.sheet
    FROM Expenses_Legacy el
    JOIN Users u ON ISNULL(el.username, 'Default User') = u.username
    LEFT JOIN Types t ON el.type = t.name
    JOIN Categories c ON el.category = c.name 
        AND c.type_id = ISNULL(t.id, (SELECT TOP 1 id FROM Types WHERE name = 'Expense'))
        AND c.user_id = u.id
    WHERE NOT EXISTS (SELECT 1 FROM Expenses e WHERE e.id = TRY_CAST(el.uuid AS UNIQUEIDENTIFIER));

    PRINT 'Migration complete. Expenses_Legacy has been kept as a backup; drop it manually once the new schema is verified.'
END
GO
