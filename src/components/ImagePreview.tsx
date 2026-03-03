import React, { useEffect, useState } from 'react';
import { fetchFileBlob } from '../serverApi';

interface ImagePreviewProps {
  fileId: string;
  fileName: string;
  apiBaseUrl: string;
  remoteConnected: boolean;
  remoteToken: string | null;
  localContent?: string;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  fileId,
  fileName,
  apiBaseUrl,
  remoteConnected,
  remoteToken,
  localContent,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revokedUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      setError(null);
      setImageUrl(null);

      if (!remoteConnected) {
        if (localContent?.startsWith('data:image/')) {
          setImageUrl(localContent);
          return;
        }
        setError('不支持打开此文件');
        return;
      }

      if (!remoteToken) {
        setError('请先连接 Server Workspace');
        return;
      }

      setLoading(true);
      try {
        const blob = await fetchFileBlob(apiBaseUrl, remoteToken, fileId);
        if (!blob.type.startsWith('image/')) {
          throw new Error('不支持打开此文件');
        }
        const objectUrl = URL.createObjectURL(blob);
        revokedUrl = objectUrl;
        if (!cancelled) {
          setImageUrl(objectUrl);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || '不支持打开此文件');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [apiBaseUrl, fileId, localContent, remoteConnected, remoteToken]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Loading image...
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 italic">
        {error || '不支持打开此文件'}
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-editor-bg overflow-auto p-4 no-scrollbar">
      <img
        src={imageUrl}
        alt={fileName}
        className="mx-auto max-w-full max-h-full object-contain rounded-xl shadow-xl border border-white/10"
      />
    </div>
  );
};
