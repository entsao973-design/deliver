IF COL_LENGTH(N'dbo.users', N'display_name') IS NULL
BEGIN
    ALTER TABLE dbo.users
    ADD display_name nvarchar(255) NOT NULL CONSTRAINT DF_users_display_name DEFAULT N'';
END;
