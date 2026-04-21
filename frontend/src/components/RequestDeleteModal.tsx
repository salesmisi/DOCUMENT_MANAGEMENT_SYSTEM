import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { apiUrl } from '../utils/api';

interface Props {
  document: any;
  onClose: () => void;
  onRequested: () => void;
}

const RequestDeleteModal: React.FC<Props> = ({ document, onClose, onRequested }) => {
  const { token } = useAuth();
  const { fetchNotifications } = useNotifications();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/delete-requests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: document.type || 'document',
          target_id: document.id,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request delete');
      setSuccess(true);
      await fetchNotifications();
      onRequested();
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to request delete');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-2">Request Document Deletion</h3>
        <p className="mb-4 text-gray-600">This will send a request to the admin for approval. The document will not be deleted until approved.</p>
        <textarea
          className="w-full border rounded p-2 mb-4"
          rows={3}
          placeholder="Reason for deletion (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-3">⚠️ {error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-3">✅ Delete request sent successfully!</div>}
        <div className="flex gap-2 justify-end">
          <button
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
            onClick={onClose}
            disabled={loading}
          >Cancel</button>
          <button
            className="px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700"
            onClick={handleRequest}
            disabled={loading}
          >{loading ? 'Requesting...' : 'Request Delete'}</button>
        </div>
      </div>
    </div>
  );
};

export default RequestDeleteModal;
