import { useEffect, useRef, useState } from 'react';

type Result = {
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
  status?: number;
  blob?: Blob | null;
};

/**
 * Fetch a file with Authorization (Bearer token from localStorage 'auth_token'),
 * convert to blob and return a object URL for rendering.
 *
 * filePath should be a path like `/uploads/doc-123.pdf` or a relative URL.
 */
export function useSecureFilePreview(filePath?: string | null): Result {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | undefined>(undefined);
  const [blob, setBlob] = useState<Blob | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let aborted = false;
    let createdUrl: string | null = null;

    async function load() {
      if (!filePath) {
        setObjectUrl(null);
        setError('No file specified');
        setLoading(false);
        setStatus(undefined);
        return;
      }

      setLoading(true);
      setError(null);
      setStatus(undefined);

      try {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(filePath, { headers });
        setStatus(resp.status);

        if (aborted) return;

        if (resp.status === 401) {
          setError('Unauthorized (401)');
          setObjectUrl(null);
          setLoading(false);
          return;
        }

        if (resp.status === 403) {
          setError('Forbidden (403)');
          setObjectUrl(null);
          setLoading(false);
          return;
        }

        if (!resp.ok) {
          setError(`Failed to load file (${resp.status})`);
          setObjectUrl(null);
          setLoading(false);
          return;
        }

        const blob = await resp.blob();
        setBlob(blob);
        if (aborted) return;
        createdUrl = URL.createObjectURL(blob);
        currentUrlRef.current = createdUrl;
        setObjectUrl(createdUrl);
        setLoading(false);
      } catch (e: any) {
        if (aborted) return;
        setError(e?.message || 'Unknown error');
        setObjectUrl(null);
        setLoading(false);
      }
    }

    load();

    return () => {
      aborted = true;
      if (createdUrl) {
        try {
          URL.revokeObjectURL(createdUrl);
        } catch (e) {
          // ignore
        }
      }
      currentUrlRef.current = null;
    };
  }, [filePath]);

  return { objectUrl, loading, error, status, blob };
}

export default useSecureFilePreview;
