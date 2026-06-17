IF COL_LENGTH(N'dbo.deliveries', N'address') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD address nvarchar(1000) NOT NULL CONSTRAINT DF_deliveries_address DEFAULT N'';
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'normalized_address') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD normalized_address nvarchar(1000) NULL;
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'geocode_lat') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_lat decimal(9,6) NULL;
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'geocode_lng') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_lng decimal(9,6) NULL;
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'geocode_status') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_status nvarchar(20) NOT NULL CONSTRAINT DF_deliveries_geocode_status DEFAULT N'pending';
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'geocode_provider') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_provider nvarchar(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'geocode_place_id') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_place_id nvarchar(255) NULL;
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'geocode_updated_at') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_updated_at datetime2(0) NULL;
END;
GO

IF COL_LENGTH(N'dbo.deliveries', N'geocode_error') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_error nvarchar(500) NULL;
END;
GO

IF OBJECT_ID(N'dbo.address_geocode_cache', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.address_geocode_cache (
        cache_key char(64) NOT NULL CONSTRAINT PK_address_geocode_cache PRIMARY KEY,
        normalized_address nvarchar(1000) NOT NULL,
        original_address nvarchar(1000) NULL,
        provider nvarchar(50) NULL,
        place_id nvarchar(255) NULL,
        lat decimal(9,6) NULL,
        lng decimal(9,6) NULL,
        status nvarchar(20) NOT NULL,
        error_message nvarchar(500) NULL,
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_address_geocode_cache_updated_at DEFAULT SYSDATETIME()
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_deliveries_geocode_status'
      AND object_id = OBJECT_ID(N'dbo.deliveries')
)
BEGIN
    CREATE INDEX IX_deliveries_geocode_status ON dbo.deliveries(geocode_status, deleted_at);
END;
GO
