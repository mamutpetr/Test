-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'ACTIVE', 'DEGRADED', 'DISABLED', 'DEMO');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CRYPTO', 'FIAT');

-- CreateEnum
CREATE TYPE "CommissionModel" AS ENUM ('REVENUE_SHARE', 'PARTNER_EXTRA_FEE', 'AFFILIATE_REFERRAL');

-- CreateEnum
CREATE TYPE "ExchangeStatus" AS ENUM ('CREATED', 'AWAITING_DEPOSIT', 'CONFIRMING', 'EXCHANGING', 'SENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'REFUNDED', 'VERIFICATION_REQUIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RevenueStatus" AS ENUM ('EXPECTED', 'CONFIRMED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST');

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "integrationStatus" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "extraFeePercent" DECIMAL(10,4),
    "commissionModel" "CommissionModel",
    "commissionRate" DECIMAL(10,6),
    "commissionCurrency" TEXT,
    "websiteUrl" TEXT,
    "termsUrl" TEXT,
    "supportUrl" TEXT,
    "lastHealthAt" TIMESTAMP(3),
    "lastHealthOk" BOOLEAN,
    "lastHealthMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "precision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Network" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chainIdentifier" TEXT,
    "isFiatRail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAsset" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "providerAssetCode" TEXT NOT NULL,
    "providerNetworkCode" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSession" (
    "id" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "mode" TEXT NOT NULL,
    "quoteCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "searchSessionId" TEXT,
    "providerId" TEXT NOT NULL,
    "executingPartner" TEXT,
    "route" TEXT NOT NULL,
    "sendAmount" DECIMAL(38,18) NOT NULL,
    "receiveAmount" DECIMAL(38,18) NOT NULL,
    "rateType" TEXT NOT NULL,
    "fees" JSONB NOT NULL,
    "providerReference" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralClick" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "searchSessionId" TEXT,
    "quoteId" TEXT,
    "route" TEXT NOT NULL,
    "sendAmount" DECIMAL(38,18) NOT NULL,
    "receiveAmountShown" DECIMAL(38,18) NOT NULL,
    "redirectHost" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exchange" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "ExchangeStatus" NOT NULL DEFAULT 'CREATED',
    "providerStatus" TEXT,
    "statusFromProvider" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL,
    "fromAsset" TEXT NOT NULL,
    "fromNetwork" TEXT NOT NULL,
    "toAsset" TEXT NOT NULL,
    "toNetwork" TEXT NOT NULL,
    "sendAmount" DECIMAL(38,18) NOT NULL,
    "expectedReceive" DECIMAL(38,18) NOT NULL,
    "actualReceive" DECIMAL(38,18),
    "payinAddress" TEXT,
    "payinExtraId" TEXT,
    "payoutAddress" TEXT NOT NULL,
    "payoutExtraId" TEXT,
    "refundAddress" TEXT,
    "payTill" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerRevenue" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "exchangeId" TEXT,
    "providerTransactionId" TEXT,
    "commissionModel" "CommissionModel" NOT NULL,
    "commissionRate" DECIMAL(10,6),
    "currency" TEXT NOT NULL,
    "volume" DECIMAL(38,18),
    "expectedAmount" DECIMAL(38,18),
    "confirmedAmount" DECIMAL(38,18),
    "paidAmount" DECIMAL(38,18),
    "status" "RevenueStatus" NOT NULL DEFAULT 'EXPECTED',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "importBatchId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCallLog" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "httpStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerId" TEXT,
    "sessionRef" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAsset_providerId_assetId_networkId_key" ON "ProviderAsset"("providerId", "assetId", "networkId");

-- CreateIndex
CREATE INDEX "SearchSession_createdAt_idx" ON "SearchSession"("createdAt");

-- CreateIndex
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");

-- CreateIndex
CREATE INDEX "ReferralClick_createdAt_idx" ON "ReferralClick"("createdAt");

-- CreateIndex
CREATE INDEX "ReferralClick_providerId_createdAt_idx" ON "ReferralClick"("providerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_idempotencyKey_key" ON "Exchange"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Exchange_status_idx" ON "Exchange"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_providerId_externalId_key" ON "Exchange"("providerId", "externalId");

-- CreateIndex
CREATE INDEX "PartnerRevenue_status_idx" ON "PartnerRevenue"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerRevenue_providerId_providerTransactionId_commissionM_key" ON "PartnerRevenue"("providerId", "providerTransactionId", "commissionModel");

-- CreateIndex
CREATE INDEX "ProviderCallLog_providerId_createdAt_idx" ON "ProviderCallLog"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCallLog_createdAt_idx" ON "ProviderCallLog"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- AddForeignKey
ALTER TABLE "ProviderAsset" ADD CONSTRAINT "ProviderAsset_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAsset" ADD CONSTRAINT "ProviderAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAsset" ADD CONSTRAINT "ProviderAsset_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_searchSessionId_fkey" FOREIGN KEY ("searchSessionId") REFERENCES "SearchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClick" ADD CONSTRAINT "ReferralClick_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClick" ADD CONSTRAINT "ReferralClick_searchSessionId_fkey" FOREIGN KEY ("searchSessionId") REFERENCES "SearchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClick" ADD CONSTRAINT "ReferralClick_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRevenue" ADD CONSTRAINT "PartnerRevenue_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRevenue" ADD CONSTRAINT "PartnerRevenue_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCallLog" ADD CONSTRAINT "ProviderCallLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
