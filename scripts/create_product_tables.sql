-- Create tables for products and prices management
-- Product catalog, purchase prices (pot/colis), sales prices (tarif départ + remise per enseigne)

-- ========================================
-- 1. Products (catalogue)
-- ========================================
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" TEXT NOT NULL DEFAULT 'colis',
    "potsPerColis" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'colis',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_name_key" UNIQUE ("name")
);

CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON "Product"("isActive");

-- ========================================
-- 2. ProductPurchasePrice (historisé)
-- ========================================
CREATE TABLE IF NOT EXISTS "ProductPurchasePrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pricePerPot" DOUBLE PRECISION NOT NULL,
    "pricePerColis" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPurchasePrice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductPurchasePrice_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductPurchasePrice_productId_idx" ON "ProductPurchasePrice"("productId");

-- ========================================
-- 3. ProductSalesPrice (matrice produit × enseigne)
-- ========================================
CREATE TABLE IF NOT EXISTS "ProductSalesPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enseigne" TEXT NOT NULL,
    "tarifDepart" DOUBLE PRECISION NOT NULL,
    "remisePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSalesPrice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductSalesPrice_productId_enseigne_key" UNIQUE ("productId", "enseigne"),
    CONSTRAINT "ProductSalesPrice_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductSalesPrice_productId_idx" ON "ProductSalesPrice"("productId");
CREATE INDEX IF NOT EXISTS "ProductSalesPrice_enseigne_idx" ON "ProductSalesPrice"("enseigne");

-- ========================================
-- Comment column remarks (for documentation)
-- ========================================
COMMENT ON TABLE "Product" IS 'Catalogue des produits. Format = pot ou colis. potsPerColis indique combien de pots dans 1 colis';
COMMENT ON TABLE "ProductPurchasePrice" IS 'Prix dachat historisé. endDate null = prix courant. pricePerColis peut etre auto-calcule = pricePerPot * potsPerColis';
COMMENT ON TABLE "ProductSalesPrice" IS 'Prix de vente par produit x enseigne. finalPrice = tarifDepart * (1 - remisePercent/100)';

-- ========================================
-- Enable RLS but allow access via service role (secret key)
-- ========================================
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductPurchasePrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductSalesPrice" ENABLE ROW LEVEL SECURITY;

-- Service role (sb_secret_...) bypasses RLS automatically
-- No policies needed since we always use the secret key from the API

-- Done!
SELECT 'Tables Product, ProductPurchasePrice, ProductSalesPrice créées avec succès' as result;
