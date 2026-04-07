import React, { useEffect, useState } from 'react';

type ApiResponse = {
  ok?: boolean;
  message?: string;
  database?: string;
  timestamp?: string;
  [key: string]: unknown;
};

export function RailwayApiTest() {
  const apiBaseUrl = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  const testUrl = apiBaseUrl ? `${apiBaseUrl}/test` : '';

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchHealthData = async () => {
      if (!testUrl) {
        if (isMounted) {
          setError('VITE_API_URL is not set.');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(testUrl, {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();

        if (isMounted) {
          setData(payload);
        }
      } catch (fetchError: any) {
        if (isMounted) {
          setData(null);
          setError(fetchError?.message || 'Unable to fetch API data.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchHealthData();

    return () => {
      isMounted = false;
    };
  }, [testUrl]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Railway API Test</h2>
        <p className="mt-1 text-sm text-gray-600">
          Checks the backend using <span className="font-mono">{testUrl || 'VITE_API_URL/test'}</span>
        </p>
      </div>

      {loading && (
        <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Loading deployment test data...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">Request failed</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-gray-800">
          <div>
            <span className="font-medium text-gray-900">Status:</span>{' '}
            <span className={data.ok ? 'text-green-700' : 'text-yellow-700'}>
              {data.ok ? 'Connected' : 'Response received'}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-900">Message:</span>{' '}
            <span>{data.message || 'No message returned'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-900">Database:</span>{' '}
            <span>{String(data.database || 'Unknown')}</span>
          </div>
          <div>
            <span className="font-medium text-gray-900">Timestamp:</span>{' '}
            <span>{data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Not provided'}</span>
          </div>

          <details className="rounded-lg bg-white/70 p-3">
            <summary className="cursor-pointer font-medium text-gray-900">Raw response</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-gray-700">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}

export default RailwayApiTest;