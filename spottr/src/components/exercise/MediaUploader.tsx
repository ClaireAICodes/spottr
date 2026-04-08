import { type FC, useState, useCallback } from 'react';
import { db } from '../../db/schema';
import { compressImage, compressVideo } from '../../utils/mediaCompress';
import GlassCard from '../common/GlassCard';

interface MediaUploaderProps {
  exerciseId: number;
  onUploadComplete?: () => void;
}

/**
 * MediaUploader — Phase 4: Enhanced with compression.
 * Compresses images and videos before storing to minimize IndexedDB usage.
 */
const MediaUploader: FC<MediaUploaderProps> = ({ exerciseId, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const count = Array.from(files).length;
      for (let i = 0; i < count; i++) {
        const file = files[i];
        try {
          const isVideo = file.type.startsWith('video');
          let blob: Blob;

          // Phase 4: Apply compression based on media type
          if (isVideo) {
            blob = await compressVideo(file, 720, 2_000_000, 50); // 720p, 2Mbps, 50MB limit
          } else {
            blob = await compressImage(file, 1920, 0.8, 5); // 1920px width, 80% quality, 5MB limit
          }

          await db.exerciseMedia.add({
            exerciseId,
            mediaBlob: blob,
            mediaType: isVideo ? 'video' : 'image',
            sortOrder: Date.now() + i,
            createdAt: new Date(),
          });

          setProgress(Math.round(((i + 1) / count) * 100));
        } catch (err) {
          console.error('Failed to upload file:', file.name, err);
          // Provide user-friendly error messages
          if (err instanceof Error && err.message.includes('exceeds') && err.message.includes('MB limit')) {
            setError(`File too large after compression. Try a smaller file or lower resolution.`);
          } else {
            setError(`Failed to upload ${file.name}`);
          }
        }
      }
      onUploadComplete?.();
    } finally {
      setUploading(false);
      setTimeout(() => {
        setProgress(0);
        setError(null);
      }, 1000);
    }
  }, [exerciseId, onUploadComplete]);

  return (
    <GlassCard padded>
      <h3 className="text-sm font-semibold text-slate-200 mb-3">📷 Media Upload</h3>

      <div className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-accent/50 transition-colors">
        <div className="text-center">
          <div className="text-2xl mb-1">+</div>
          <div className="text-xs text-slate-400">
            {uploading ? `Uploading... ${progress}%` : 'Click to add photos/videos'}
          </div>
        </div>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFiles}
          className="hidden"
          aria-label="Upload media"
          disabled={uploading}
        />
      </div>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {uploading && (
        <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </GlassCard>
  );
};

export default MediaUploader;
