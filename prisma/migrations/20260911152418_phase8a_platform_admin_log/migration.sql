-- CreateTable
CREATE TABLE "platform_admin_log" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_admin_log_actorAdminId_idx" ON "platform_admin_log"("actorAdminId");

-- CreateIndex
CREATE INDEX "platform_admin_log_targetType_targetId_idx" ON "platform_admin_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "platform_admin_log_action_idx" ON "platform_admin_log"("action");

-- CreateIndex
CREATE INDEX "platform_admin_log_createdAt_idx" ON "platform_admin_log"("createdAt");

-- AddForeignKey
ALTER TABLE "platform_admin_log" ADD CONSTRAINT "platform_admin_log_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "platform_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
