-- CreateTable
CREATE TABLE "PlaceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PlaceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "map" JSONB,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "platform" TEXT,
    "kind" TEXT NOT NULL,
    "placeId" TEXT,
    "placeName" TEXT,
    "blockId" TEXT,
    "blockName" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wifiCount" INTEGER NOT NULL,
    "bleCount" INTEGER NOT NULL,
    "matchName" TEXT,
    "matchDist" DOUBLE PRECISION,
    "matchCommon" INTEGER,
    "matchSource" TEXT,
    "matchSure" BOOLEAN,
    "note" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanReading" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bssid" TEXT NOT NULL,
    "ssid" TEXT,
    "rssi" INTEGER NOT NULL,
    "frequency" INTEGER,
    "kept" BOOLEAN NOT NULL,

    CONSTRAINT "ScanReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaceType_name_key" ON "PlaceType"("name");

-- CreateIndex
CREATE INDEX "Scan_createdAt_idx" ON "Scan"("createdAt");

-- CreateIndex
CREATE INDEX "Scan_placeId_idx" ON "Scan"("placeId");

-- CreateIndex
CREATE INDEX "Scan_blockId_idx" ON "Scan"("blockId");

-- CreateIndex
CREATE INDEX "Scan_deviceId_idx" ON "Scan"("deviceId");

-- CreateIndex
CREATE INDEX "ScanReading_bssid_idx" ON "ScanReading"("bssid");

-- CreateIndex
CREATE INDEX "ScanReading_scanId_idx" ON "ScanReading"("scanId");

-- AddForeignKey
ALTER TABLE "ScanReading" ADD CONSTRAINT "ScanReading_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
