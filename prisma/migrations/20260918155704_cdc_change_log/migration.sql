-- CreateTable
CREATE TABLE "change_log" (
    "seq" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "change_log_key_idx" ON "change_log"("key");

-- CreateIndex
CREATE INDEX "change_log_ts_idx" ON "change_log"("ts");
