/**
 * Storage Management Utilities for Spottr
 *
 * Monitors IndexedDB storage usage and provides cleanup utilities.
 */

// ============================================================
// Storage Estimation
// ============================================================

/**
 * Get current storage usage and quota.
 * Uses navigator.storage.estimate() if available, otherwise falls back to approximate.
 */
export async function getStorageUsage(): Promise<{ used: number; quota: number }> {
  if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    } catch (e) {
      console.warn('[Storage] estimate() failed:', e);
    }
  }

  // Fallback: sum blob sizes in exerciseMedia
  const approximate = await getIndexedDBSize();
  return {
    used: approximate,
    quota: 0, // unknown
  };
}

/**
 * Approximate IndexedDB size by summing blob sizes in exerciseMedia table.
 */
export async function getIndexedDBSize(): Promise<number> {
  if (typeof window === 'undefined' || !window.indexedDB) return 0;

  try {
    const { db } = await import('./../db/schema.ts');
    const allMedia = await db.exerciseMedia.toArray();

    let totalBlobSize = 0;
    for (const media of allMedia) {
      try {
        const blob = media.mediaBlob as Blob;
        totalBlobSize += blob.size;
      } catch (e) {
        // Ignore individual blob size errors
      }
    }
    return totalBlobSize;
  } catch (e) {
    console.warn('[Storage] Cannot calculate IndexedDB size:', e);
    return 0;
  }
}

// ============================================================
// Formatting
// ============================================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getStoragePercentage(used: number, quota: number): number {
  if (quota === 0) return 0;
  return Math.round((used / quota) * 100);
}

// ============================================================
// Orphaned Media Detection
// ============================================================

/**
 * Find media blobs that are not attached to any exercise.
 * These occur if an exercise is deleted without cascading media deletion.
 */
export async function findOrphanedMedia(): Promise<{ id: number; blob: Blob; size: number }[]> {
  try {
    const { db } = await import('./../db/schema.ts');
    const allMedia = await db.exerciseMedia.toArray();

    // Get set of existing exercise IDs
    const exerciseIds = new Set<number>(
      (await db.exerciseDefinitions.toArray()).map((e) => e.id!)
    );

    // Orphaned = media whose exerciseId is missing
    const orphans = allMedia.filter((m) => !exerciseIds.has(m.exerciseId));

    return orphans.map((m) => ({
      id: m.id!,
      blob: m.mediaBlob as Blob,
      size: (m.mediaBlob as Blob).size,
    }));
  } catch (e) {
    console.error('[Storage] Orphan detection failed:', e);
    return [];
  }
}

/**
 * Delete orphaned media records and their blobs.
 * Returns count of deleted items.
 */
export async function cleanupOrphanedMedia(): Promise<number> {
  const { db } = await import('./../db/schema.ts');
  const orphans = await findOrphanedMedia();
  if (orphans.length === 0) return 0;

  const ids = orphans.map((o) => o.id);
  await db.exerciseMedia.bulkDelete(ids);
  return orphans.length;
}

// ============================================================
// Storage Warnings
// ============================================================

export const WARNING_THRESHOLD_PERCENT = 80;
export const CRITICAL_THRESHOLD_PERCENT = 95;

export function getStorageStatus(percent: number): 'ok' | 'warning' | 'critical' {
  if (percent >= CRITICAL_THRESHOLD_PERCENT) return 'critical';
  if (percent >= WARNING_THRESHOLD_PERCENT) return 'warning';
  return 'ok';
}
