-- CreateTable
CREATE TABLE "channels" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "mainChatId" TEXT NOT NULL,
    "buckets" JSONB NOT NULL,
    "rewritePrompts" JSONB NOT NULL,
    "schedule" TEXT NOT NULL,
    "previewTtl" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" BIGSERIAL NOT NULL,
    "channelId" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "guid" TEXT,
    "origTitle" TEXT NOT NULL,
    "origText" TEXT NOT NULL,
    "author" TEXT,
    "categories" JSONB NOT NULL,
    "pubDate" TIMESTAMP(3) NOT NULL,
    "images" JSONB NOT NULL,
    "bucket" TEXT,
    "embedding" JSONB,
    "rewrittenTitle" TEXT,
    "rewrittenText" TEXT,
    "finalTitle" TEXT,
    "finalText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ingested',
    "previewMessageId" BIGINT,
    "publishedMessageId" BIGINT,
    "aiError" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_channelId_status_pubDate_idx" ON "posts"("channelId", "status", "pubDate");

-- CreateIndex
CREATE INDEX "posts_channelId_bucket_idx" ON "posts"("channelId", "bucket");

-- CreateIndex
CREATE INDEX "posts_pubDate_idx" ON "posts"("pubDate");

-- CreateIndex
CREATE UNIQUE INDEX "posts_channelId_link_key" ON "posts"("channelId", "link");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
