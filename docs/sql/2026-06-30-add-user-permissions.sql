IF COL_LENGTH(N'dbo.users', N'permissions_json') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD permissions_json nvarchar(max) NULL;
END;

UPDATE dbo.users
SET permissions_json = CASE
    WHEN role = N'admin' THEN N'{"deliveries":true,"deleted":true,"upload":true,"archive":true,"users":true,"driver":true}'
    ELSE N'{"deliveries":false,"deleted":false,"upload":false,"archive":false,"users":false,"driver":true}'
END
WHERE permissions_json IS NULL OR LTRIM(RTRIM(permissions_json)) = N'';
