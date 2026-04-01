import React, { useState, useMemo, useEffect } from 'react';
import { useDocuments } from '../context/DocumentContext';
import { useNotifications } from '../context/NotificationContext';
import { Modal } from './ui/Modal';
import { User } from '../context/AuthContext';
import { Document } from '../context/DocumentContext';
import { Mail, Copy, Lock, Users, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document | null;
  currentUser: User;
}


export function ShareDialog({ isOpen, onClose, document, currentUser }: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [access, setAccess] = useState<'restricted' | 'anyone'>('restricted');
  const { refreshDocuments } = useDocuments();
  const { fetchNotifications } = useNotifications();
  const [saving, setSaving] = useState(false);
  const [loadingShares, setLoadingShares] = useState(false);
  const { users } = useAuth();
  // Track people with access (owner always included)
  const [peopleWithAccess, setPeopleWithAccess] = useState<Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
    self: boolean;
  }>>([]);

  // Load existing shared users when dialog opens
  useEffect(() => {
    if (isOpen && document) {
      // Reset to owner first
      setPeopleWithAccess([
        { id: currentUser.id, name: currentUser.name, email: currentUser.email, role: 'Owner', avatar: currentUser.avatar, self: true }
      ]);

      // Fetch existing shares
      const fetchShares = async () => {
        setLoadingShares(true);
        try {
          const token = localStorage.getItem('dms_token');
          const res = await fetch(`http://localhost:5000/api/documents/${document.id}/shares`, {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.shares && Array.isArray(data.shares)) {
              const existingShares = data.shares.map((s: any) => ({
                id: s.user_id || s.userId,
                name: s.user_name || s.userName || 'Unknown',
                email: s.user_email || s.userEmail || '',
                role: s.role || 'Editor',
                self: false
              }));
              setPeopleWithAccess(prev => [
                ...prev.filter(p => p.self), // Keep owner
                ...existingShares
              ]);
            }
          }
        } catch (err) {
          console.error('Failed to fetch shares:', err);
        } finally {
          setLoadingShares(false);
        }
      };
      fetchShares();
    }
  }, [isOpen, document, currentUser]);

  // Autocomplete staff and managers
  const selectableOptions = useMemo(
    () => users.filter(u => (u.role === 'staff' || u.role === 'manager') && u.id !== currentUser.id),
    [users, currentUser.id]
  );
  const filteredOptions = useMemo(() => {
    if (!email) return [];
    const lower = email.toLowerCase();
    return selectableOptions.filter(u => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower));
  }, [email, selectableOptions]);

  // Add staff/manager to access list
  const handleAddPerson = (person: any) => {
    if (peopleWithAccess.some(p => p.id === person.id)) return;
    setPeopleWithAccess(prev => [...prev, { ...person, role: 'Editor', self: false }]);
    setEmail('');
  };

  // Change role
  const handleRoleChange = (id: string, newRole: string) => {
    setPeopleWithAccess(prev => prev.map(p => p.id === id ? { ...p, role: newRole } : p));
  };

  // Remove person
  const handleRemovePerson = (id: string) => {
    setPeopleWithAccess(prev => prev.filter(p => p.id !== id));
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href + `/documents/${document?.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Save/share changes to backend
  const handleShare = async () => {
    if (!document) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('dms_token');
      // Exclude owner/self from share list
      const users = peopleWithAccess.filter(p => !p.self).map(p => ({ userId: p.id, role: p.role }));
      await fetch(`http://localhost:5000/api/documents/${document.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ users })
      });
      await refreshDocuments();
      await fetchNotifications();
      onClose();
    } catch (err) {
      alert('Failed to share document.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Share "${document?.title || ''}"`} maxWidth="md">
      <div className="space-y-4">
        <div className="relative mb-2">
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Add people, groups, spaces, and calendar events"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="off"
          />
          {email && filteredOptions.length > 0 && (
            <div className="absolute left-0 right-0 bg-white border rounded shadow z-10 mt-1 max-h-40 overflow-auto">
              {filteredOptions.map(person => (
                <div
                  key={person.id}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                  onClick={() => handleAddPerson(person)}
                >
                  <Users size={18} />
                  <span className="font-medium">{person.name}</span>
                  <span className="text-xs text-gray-500">{person.email}</span>
                  <span className="text-xs text-gray-400">{person.role.charAt(0).toUpperCase() + person.role.slice(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mb-2">
          <div className="font-semibold mb-1">People with access</div>
          <div className="space-y-2">
            {peopleWithAccess.map((person, idx) => (
              <div key={person.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{person.name} {person.self && '(you)'}</div>
                  <div className="text-xs text-gray-500 truncate">{person.email}</div>
                </div>
                <div className="text-xs text-gray-500">{person.role}</div>
                {person.role !== 'Owner' && (
                  <>
                    <select
                      className="ml-2 border rounded px-1 py-0.5 text-xs"
                      value={person.role}
                      onChange={e => handleRoleChange(person.id, e.target.value)}
                    >
                      <option>Editor</option>
                      <option>Viewer</option>
                    </select>
                    <button
                      className="ml-2 text-red-500 hover:text-red-700 text-xs"
                      onClick={() => handleRemovePerson(person.id)}
                      title="Remove access"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mb-2">
          <div className="font-semibold mb-1">General access</div>
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-gray-500" />
            <select value={access} onChange={e => setAccess(e.target.value as any)} className="border rounded px-2 py-1 text-xs">
              <option value="restricted">Restricted</option>
              <option value="anyone">Anyone with the link</option>
            </select>
            <span className="text-xs text-gray-500">
              {access === 'restricted' ? 'Only people with access can open with the link' : 'Anyone with the link can view'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-3 py-1.5 border rounded text-sm bg-gray-50 hover:bg-gray-100 transition"
          >
            <Copy size={16} /> {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={handleShare}
            disabled={saving}
            className="ml-auto px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save & Share'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
