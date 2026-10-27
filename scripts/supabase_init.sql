-- ============================================
-- CRÉATION DES TABLES + DONNÉES INITIALES
-- À exécuter dans Supabase → SQL Editor
-- ============================================

-- 1. Table Agent (commerciaux)
CREATE TABLE IF NOT EXISTS "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDirectRate" DOUBLE PRECISION NOT NULL DEFAULT 0.07,
    "defaultCentraleRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endedAt" TIMESTAMP(3),
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- Index unique sur le nom
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_name_key" ON "Agent"("name");

-- 2. Table Enseigne (clients)
CREATE TABLE IF NOT EXISTS "Enseigne" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "oteraLocation" TEXT,
    "lastManualUpdate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Enseigne_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Enseigne_name_key" ON "Enseigne"("name");
CREATE INDEX IF NOT EXISTS "Enseigne_agent_idx" ON "Enseigne"("agent");
CREATE INDEX IF NOT EXISTS "Enseigne_type_idx" ON "Enseigne"("type");
CREATE INDEX IF NOT EXISTS "Enseigne_oteraLocation_idx" ON "Enseigne"("oteraLocation");

-- 3. Table Sale (ventes)
CREATE TABLE IF NOT EXISTS "Sale" (
    "id" TEXT NOT NULL,
    "blNumber" TEXT,
    "deduplicationKey" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "enseigne" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "amountHT" DOUBLE PRECISION NOT NULL,
    "amountTTC" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_deduplicationKey_key" ON "Sale"("deduplicationKey");
CREATE INDEX IF NOT EXISTS "Sale_year_month_idx" ON "Sale"("year", "month");
CREATE INDEX IF NOT EXISTS "Sale_agent_idx" ON "Sale"("agent");
CREATE INDEX IF NOT EXISTS "Sale_enseigne_idx" ON "Sale"("enseigne");
CREATE INDEX IF NOT EXISTS "Sale_date_idx" ON "Sale"("date");

-- 4. Table Parameter (paramètres globaux)
CREATE TABLE IF NOT EXISTS "Parameter" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Parameter_pkey" PRIMARY KEY ("key")
);

-- ============================================
-- DONNÉES INITIALES
-- ============================================

-- Agents CAP FRAIS et BROCARD
INSERT INTO "Agent" ("id", "name", "defaultDirectRate", "defaultCentraleRate", "isActive", "createdAt", "updatedAt")
VALUES 
('agent_cap_frais', 'CAP FRAIS', 0.07, 0.05, true, now(), now()),
('agent_brocard', 'BROCARD', 0.07, 0.05, true, now(), now())
ON CONFLICT ("name") DO NOTHING;

-- Paramètres période courante
INSERT INTO "Parameter" ("key", "value", "updatedAt")
VALUES 
('currentYear', '2026', now()),
('currentMonth', '9', now())
ON CONFLICT ("key") DO NOTHING;

-- ============================================
-- Vérification
-- ============================================
SELECT 'Tables créées' as status;
SELECT COUNT(*) as total_agents FROM "Agent";
SELECT COUNT(*) as total_params FROM "Parameter";
