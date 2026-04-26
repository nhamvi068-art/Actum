// Database
export * from './db/app-database';
export * from './db/asset-storage-service';
export * from './db/task-storage-service';
export * from './db/canvas-service';
export * from './db/resource-manager';
export * from './db/storage-monitor-service';
export * from './db/backup-service';
export * from './db/migration-service';
export * from './db/task-asset-manager';

// Services
export * from './unified-cache-service';
export * from './sw-register';
export * from './initializer';
export * from './image-generation';
export * from './task-manager';
export * from './storage';
export * from './image-element-factory';

// Canvas Operations
export * from './canvas-operations/split-image';

// Legacy Migration
export * from './legacy-migration-service';

// Re-export for convenience
export { unifiedCacheService } from './unified-cache-service';
export { setCachedThumbnail, getCachedThumbnail, clearCachedThumbnail } from './unified-cache-service';
export { canvasService } from './db/canvas-service';
export { resourceManager } from './db/resource-manager';
export { storageMonitorService } from './db/storage-monitor-service';
export { backupService } from './db/backup-service';
export { migrationService } from './db/migration-service';
export { taskAssetManager } from './db/task-asset-manager';
export { taskStorageService } from './db/task-storage-service';

// Snapshot Pod Services (离线后台快照架构)
export { SnapshotPodManager } from './snapshot-pod-manager';
export type { SnapshotPod } from './snapshot-pod-manager';
export { ThumbnailEventBus } from './thumbnail-event-bus';
export type { ThumbnailUpdateEvent } from './thumbnail-event-bus';
export { BackgroundSnapshotService } from './background-snapshot-service';

// Photo Wall Services
export * from './photo-wall-layout';
export * from './image-merger';
export * from './photo-wall-service';

// Task Queue & Polling Services (Phase 2)
export * from './task-store';
export * from './task-polling';
export * from './image-generation-adapter';
export * from './task-sync-service';

// Model Adapter Architecture (v2 - 解决图生图 Bug)
export * from './model-adapters';
