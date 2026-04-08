/**
 * Media Compression Utilities for Spottr
 *
 * Handles image and video compression to minimize IndexedDB storage usage
 * while maintaining acceptable quality for workout reference media.
 */

// ============================================================
// Types
// ============================================================

export interface CompressionOptions {
  maxWidth?: number;
  quality?: number;
  maxSizeMB?: number;
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

// ============================================================
// Image Compression
// ============================================================

/**
 * Compresses an image file by resizing and re-encoding with reduced quality.
 * @param file - Source image file (from <input type="file">)
 * @param maxWidth - Maximum width in pixels (maintains aspect ratio). Default: 1920
 * @param quality - JPEG quality 0-1. Default: 0.8
 * @param maxSizeMB - Hard limit on final blob size. Default: 5MB
 * @returns Promise<Blob> - Compressed image blob
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8,
  maxSizeMB: number = 5
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate target dimensions maintaining aspect ratio
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      // Draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Export with compression
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create compressed blob'));
            return;
          }

          // Enforce max size
          const maxBytes = maxSizeMB * 1024 * 1024;
          if (blob.size > maxBytes) {
            reject(new Error(`Compressed image exceeds ${maxSizeMB}MB limit (actual: ${(blob.size / 1024 / 1024).toFixed(1)}MB)`));
          } else {
            resolve(blob);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };

    // Ensure we're using a fresh URL each time
    img.src = url;
    if (img.complete) {
      // Synchronous load (cached)
      URL.revokeObjectURL(url);
      img.onload?.(new Event('load'));
    }
  });
}

// ============================================================
// Video Compression (Simplified Approach)
// ============================================================

/**
 * Compresses video by re-encoding at lower resolution and bitrate.
 * Uses real-time recording from canvas (simplified; for production consider ffmpeg.wasm).
 * @param file - Source video file
 * @param maxHeight - Maximum height in pixels. Default: 720
 * @param maxBitrate - Target bitrate in bits per second. Default: 2,000,000 (2 Mbps)
 * @param maxSizeMB - Hard limit on final blob size. Default: 50MB
 * @returns Promise<Blob> - Compressed video (WebM format)
 */
export async function compressVideo(
  file: File,
  maxHeight: number = 720,
  maxBitrate: number = 2_000_000,
  maxSizeMB: number = 50
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    // Cleanup helper
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      video.currentTime = 0;
    };

    video.onseeked = async () => {
      try {
        // Calculate target dimensions
        let width = video.videoWidth;
        let height = video.videoHeight;

        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        // Setup canvas for rendering
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Failed to create canvas context for video'));
          return;
        }

        // Draw first frame to verify dimensions (optional debug)
        ctx.drawImage(video, 0, 0, width, height);

        // Setup MediaRecorder for real-time capture
        const stream = canvas.captureStream(30); // 30 FPS
        const mimeType = getSupportedVideoMimeType();
        if (!mimeType) {
          cleanup();
          reject(new Error('No supported video MIME type (VP9/VP8/MP4)'));
          return;
        }

        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: maxBitrate,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          cleanup();
          const blob = new Blob(chunks, { type: mimeType });
          const maxBytes = maxSizeMB * 1024 * 1024;

          if (blob.size > maxBytes) {
            reject(new Error(`Compressed video exceeds ${maxSizeMB}MB limit (actual: ${(blob.size / 1024 / 1024).toFixed(1)}MB)`));
          } else if (chunks.length === 0) {
            reject(new Error('No video data recorded'));
          } else {
            resolve(blob);
          }
        };

        // Start recording and play video through canvas
        recorder.start();
        video.play();

        // Draw video frames to canvas continuously
        const draw = () => {
          if (video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, width, height);
          requestAnimationFrame(draw);
        };
        draw();

        // Stop when video ends or after max duration (5 min limit)
        const maxDuration = Math.min(video.duration, 5 * 60); // 5 minutes max
        setTimeout(() => {
          video.pause();
          recorder.stop();
        }, maxDuration * 1000);

        video.onended = () => {
          video.pause();
          recorder.stop();
        };

      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video for compression'));
    };

    video.src = url;
    if (video.readyState >= 1) {
      // Already loaded (unlikely)
      video.onloadedmetadata?.(new Event('loadedmetadata'));
    }
  });
}

/**
 * Detect supported video MIME types in order of preference.
 */
function getSupportedVideoMimeType(): string | null {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
}

// ============================================================
// Utility: Get File Size
// ============================================================

export function getFileSizeMB(file: File): number {
  return file.size / 1024 / 1024;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
