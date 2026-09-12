-- ==========================================
-- 003_phase_b: privacy settings, savings goals, loans, card due dates
-- Idempotent; recorded in SchemaMigrations by the runner.
-- ==========================================

-- Per-user preferences (privacy defaults, demo seed, later: notification prefs)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserSettings' AND xtype='U')
BEGIN
    CREATE TABLE UserSettings (
        user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY FOREIGN KEY REFERENCES Users(id),
        settings NVARCHAR(MAX) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

-- Savings goals linked to a category (progress = cumulative amounts in that category)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SavingsGoals' AND xtype='U')
BEGIN
    CREATE TABLE SavingsGoals (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(id),
        name NVARCHAR(100) NOT NULL,
        category_id UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES Categories(id),
        target_amount DECIMAL(18,2) NOT NULL,
        target_month VARCHAR(7) NULL,
        expected_annual_rate DECIMAL(5,2) NULL,
        starting_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

-- Loans with amortisation inputs; the schedule is computed in code
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Loans' AND xtype='U')
BEGIN
    CREATE TABLE Loans (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(id),
        name NVARCHAR(100) NOT NULL,
        category_id UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES Categories(id),
        principal DECIMAL(18,2) NOT NULL,
        annual_rate DECIMAL(6,3) NOT NULL,
        tenure_months INT NOT NULL,
        start_month VARCHAR(7) NOT NULL,
        emi_amount DECIMAL(18,2) NULL,
        created_at DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LoanPrepayments' AND xtype='U')
BEGIN
    CREATE TABLE LoanPrepayments (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        loan_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Loans(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        mode VARCHAR(10) NOT NULL DEFAULT 'tenure',
        created_at DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

-- Credit-card statement / due days live on the card's category
IF COL_LENGTH('Categories', 'card_statement_day') IS NULL
    ALTER TABLE Categories ADD card_statement_day TINYINT NULL;
GO

IF COL_LENGTH('Categories', 'card_due_day') IS NULL
    ALTER TABLE Categories ADD card_due_day TINYINT NULL;
GO
