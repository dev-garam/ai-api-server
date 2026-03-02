-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterpretingUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguages" TEXT[],
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterpretingUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "modelName" TEXT NOT NULL,
    "voice" TEXT,
    "inputChars" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtsUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterpretingUsage_tenantId_createdAt_idx" ON "InterpretingUsage"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "InterpretingUsage_userId_createdAt_idx" ON "InterpretingUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TtsUsage_tenantId_createdAt_idx" ON "TtsUsage"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TtsUsage_userId_createdAt_idx" ON "TtsUsage"("userId", "createdAt");
