import { type FC, useEffect } from 'react';

interface ExerciseMediaProps {
  mediaBlob: Blob;
  mediaType: 'image' | 'video';
  alt?: string;
}

/**
 * ExerciseMedia - Displays exercise media (image or video)
 * Handles blob URLs properly and cleans up on unmount to prevent memory leaks
 */
const ExerciseMedia: FC<ExerciseMediaProps> = ({ mediaBlob, mediaType, alt = '' }) => {
  useEffect(() => {
    return () => {
      // Clean up blob URL on unmount to prevent memory leaks
      URL.revokeObjectURL(URL.createObjectURL(mediaBlob));
    };
  }, [mediaBlob]);

  return (
    <div className="w-full h-48 object-cover rounded-lg">
      {mediaType === 'video' ? (
        <video
          src={URL.createObjectURL(mediaBlob)}
          className="w-full h-full object-cover rounded-lg"
          muted
          playsInline
        />
      ) : (
        <img
          src={URL.createObjectURL(mediaBlob)}
          alt={alt}
          className="w-full h-full object-cover rounded-lg"
        />
      )}
    </div>
  );
};

export default ExerciseMedia;