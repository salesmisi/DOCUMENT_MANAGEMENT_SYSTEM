import React, { useState, useEffect } from 'react';
import {
  Archive,
  RotateCcw,
  Trash2,
  Clock,
  Search,
  AlertTriangle } from
'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import { useAuth } from '../context/AuthContext';
export function ArchivePage() {
  const { documents, restoreDocument, permanentlyDelete, addLog } =
  useDocuments();
  const { user, users } = useAuth();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');

  // Auto-purge archived documents that have exceeded 30-day retention
  useEffect(() => {
    documents.forEach((doc) => {
      if (doc.status !== 'archived') return;
      const retention = doc.retentionDays || 30;
      const daysArchived = Math.floor(
        (Date.now() - new Date(doc.archivedAt || 0).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysArchived >= retention) {
        permanentlyDelete(doc.id);
      }
    });
  }, []);

  // Role-based document access
  const hasAccess = (doc: (typeof documents)[0]) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'manager') return doc.department === user.department;
    // staff: only their own documents
    return doc.uploadedById === user.id;
  };

  const archived = documents.filter((d) => d.status === 'archived' && hasAccess(d));
  const filtered = archived.filter((d) => {
    const matchSearch =
    !search || d.title.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === 'all' || d.department === filterDept;
    return matchSearch && matchDept;
  });
  const archiveSuggestions = React.useMemo(() =>
    archived.map((d) => d.title).filter(Boolean),
    [archived]
  );
  const getDaysArchived = (archivedAt?: string) => {
    if (!archivedAt) return 0;
    return Math.floor(
      (Date.now() - new Date(archivedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  };
  const departmentOptions = React.useMemo(() => {
    const set = new Set<string>();
    if (users && users.length) {
      users.forEach((u: any) => {
        const d = String(u.department || '').trim();
        if (d) set.add(d);
      });
    }
    // also include departments present on archived docs
    archived.forEach((doc) => {
      const d = String(doc.department || '').trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [users, archived]);
  const RETENTION_DAYS = 30;
  const getRetentionStatus = (doc: (typeof documents)[0]) => {
    const daysArchived = getDaysArchived(doc.archivedAt);
    const retention = doc.retentionDays || RETENTION_DAYS;
    const remaining = Math.max(retention - daysArchived, 0);
    if (remaining <= 7)
    return {
      label: remaining === 0 ? 'Expired' : `${remaining}d remaining`,
      color: 'text-red-600 bg-red-50'
    };
    if (remaining <= 15)
    return {
      label: `${remaining}d remaining`,
      color: 'text-yellow-600 bg-yellow-50'
    };
    return {
      label: `${remaining}d remaining`,
      color: 'text-green-600 bg-green-50'
    };
  };
  const handleRestore = (doc: (typeof documents)[0]) => {
    restoreDocument(doc.id);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_RESTORED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: 'Restored from archive'
    });
  };
  const handlePermanentDelete = (doc: (typeof documents)[0]) => {
    if (
    window.confirm(
      `Permanently delete "${doc.title}"? This cannot be undone.`
    ))
    {
      permanentlyDelete(doc.id);
      addLog({
        userId: user?.id || '',
        userName: user?.name || '',
        userRole: user?.role || '',
        action: 'DOCUMENT_PERMANENTLY_DELETED',
        target: doc.title,
        targetType: 'document',
        timestamp: new Date().toISOString(),
        ipAddress: '192.168.1.100'
      });
    }
  };
  const fileTypeColors: Record<string, string> = {
    pdf: 'bg-red-100 text-red-700',
    docx: 'bg-blue-100 text-blue-700',
    xlsx: 'bg-green-100 text-green-700',
    jpg: 'bg-purple-100 text-purple-700',
    png: 'bg-pink-100 text-pink-700',
    tiff: 'bg-cyan-100 text-cyan-700',
    mp4: 'bg-indigo-100 text-indigo-700',
    mov: 'bg-indigo-100 text-indigo-700',
    avi: 'bg-indigo-100 text-indigo-700',
    mkv: 'bg-indigo-100 text-indigo-700'
  };
  return (
    <div className="space-y-6">
      <div className="bg-[#005F02] rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
          <Archive size={28} />
          Document Archives
        </h2>
        <p className="text-[#C0B87A] text-sm">
          {archived.length} archived documents
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <AutocompleteSearch
          value={search}
          onChange={setSearch}
          suggestions={archiveSuggestions}
          placeholder="Search archived documents..."
          className="bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-100 flex-1 min-w-48"
        />
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#427A43] shadow-sm">

          <option value="all">All Departments</option>
          {departmentOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Archive List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ?
        <div className="py-16 text-center text-gray-400">
            <Archive size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No archived documents</p>
            <p className="text-xs mt-1">
              Documents moved to archive will appear here
            </p>
          </div> :

        <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Document
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">
                  Department
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">
                  Archived
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Retention
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((doc) => {
              const retention = getRetentionStatus(doc);
              const daysArchived = getDaysArchived(doc.archivedAt);
              return (
                <tr
                  key={doc.id}
                  className="hover:bg-gray-50 transition-colors">

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                        className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase ${fileTypeColors[doc.fileType] || 'bg-gray-100 text-gray-600'}`}>

                          {doc.fileType}
                        </span>
                        <div>
                          <p className="font-medium text-gray-800">
                            {doc.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {doc.reference} · v{doc.version}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      {doc.department}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                      {daysArchived} days ago
                    </td>
                    <td className="px-4 py-3">
                      <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${retention.color}`}>

                        {retention.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                        onClick={() => handleRestore(doc)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#005F02] border border-[#427A43] rounded-lg hover:bg-[#F0FDF4] transition-colors">

                          <RotateCcw size={12} />
                          Restore
                        </button>
                        {user?.role === 'admin' &&
                      <button
                        onClick={() => handlePermanentDelete(doc)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">

                            <Trash2 size={12} />
                            Delete
                          </button>
                      }
                      </div>
                    </td>
                  </tr>);

            })}
            </tbody>
          </table>
        }
      </div>
    </div>);

}