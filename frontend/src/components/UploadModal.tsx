import React, { useState } from 'react';
import {
  Upload,
  X,
  FileText,
  CheckCircle,
  Tag } from
'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
interface UploadModalProps {
  onClose: () => void;
  defaultFolderId?: string;
}
export function UploadModal({ onClose, defaultFolderId }: UploadModalProps) {
  const { addDocument, folders, addLog, refreshDocuments } = useDocuments();
  const { user, token } = useAuth();
  const requiresApproval = user?.role === 'staff';
  const [form, setForm] = useState({
    title: '',
    departmentId: '',
    date: new Date().toISOString().split('T')[0],
    folderId: defaultFolderId || '',
    needsApproval: requiresApproval,
    description: '',
    tags: '',
    fileType: 'pdf' as 'pdf' | 'doc' | 'docx' | 'xlsx' | 'jpg' | 'png' | 'tiff' | 'mp4' | 'mov' | 'avi' | 'mkv',
    size: '1.2 MB'
  });
  const [selectedParentFolderId, setSelectedParentFolderId] = useState<string>('');
  const [selectedSubfolderId, setSelectedSubfolderId] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedNeedsApproval, setSubmittedNeedsApproval] = useState(requiresApproval);
  const [serverReference, setServerReference] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [departments, setDepartments] = React.useState<Array<{id: string; name: string}>>([]);

  const visibleFolders = React.useMemo(() => folders, [folders]);
  const rootFolders = visibleFolders.filter((f) => f.parentId === null);
  const subFolders = visibleFolders.filter((f) => f.parentId !== null);

  // Get all descendant subfolders (including nested) for the selected parent folder
  const availableSubfolders = React.useMemo(() => {
    if (!selectedParentFolderId) return [];

    type FolderWithDepth = typeof visibleFolders[0] & { depth: number; path: string };
    const result: FolderWithDepth[] = [];

    // Recursive function to get all descendants
    const getDescendants = (parentId: string, depth: number, parentPath: string) => {
      const children = visibleFolders.filter((f) => f.parentId === parentId);
      for (const child of children) {
        const path = parentPath ? `${parentPath} / ${child.name}` : child.name;
        result.push({ ...child, depth, path });
        getDescendants(child.id, depth + 1, path);
      }
    };

    getDescendants(selectedParentFolderId, 0, '');
    return result;
  }, [visibleFolders, selectedParentFolderId]);

  // Update folderId when parent or subfolder changes
  React.useEffect(() => {
    if (selectedSubfolderId) {
      setForm((prev) => ({ ...prev, folderId: selectedSubfolderId }));
    } else if (selectedParentFolderId) {
      setForm((prev) => ({ ...prev, folderId: selectedParentFolderId }));
    } else {
      setForm((prev) => ({ ...prev, folderId: '' }));
    }
  }, [selectedParentFolderId, selectedSubfolderId]);

  // Initialize from defaultFolderId if provided
  React.useEffect(() => {
    if (defaultFolderId && folders.length > 0) {
      const folder = folders.find((f) => f.id === defaultFolderId);
      if (folder) {
        if (folder.parentId) {
          // It's a subfolder - find the root ancestor
          let rootId = folder.parentId;
          let current = folders.find((f) => f.id === rootId);
          while (current && current.parentId) {
            rootId = current.parentId;
            current = folders.find((f) => f.id === rootId);
          }
          setSelectedParentFolderId(rootId);
          setSelectedSubfolderId(folder.id);
        } else {
          // It's a root folder
          setSelectedParentFolderId(folder.id);
          setSelectedSubfolderId('');
        }
      }
    }
  }, [defaultFolderId, folders]);

  React.useEffect(() => {
    setForm((prev) => ({ ...prev, needsApproval: requiresApproval }));
  }, [requiresApproval]);

  const API_BASE = (import.meta.env.VITE_API_URL as string) || '';
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!fileName) errs.file = 'Please attach a file';
    return errs;
  };
  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setUploadError(null);
    setLoading(true);

    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);

    try {
  if (!form.folderId) {
    alert("Please select a folder before uploading.");
    return;
  }

  const formData = new FormData();

  if (selectedFile) formData.append('file', selectedFile);
  formData.append('title', form.title);
  formData.append('department_id', form.departmentId);
  formData.append('date', form.date);
  formData.append('folder_id', form.folderId); // REQUIRED
  formData.append('needs_approval', String(requiresApproval));
  formData.append('description', form.description || '');
  formData.append('file_type', form.fileType);
  formData.append('size', form.size);
  formData.append('tags', JSON.stringify(tags));

  const authToken = token || localStorage.getItem('dms_token') || localStorage.getItem('token');

  if (!authToken) {
    throw new Error('Authentication required. Please sign in again.');
  }

  const res = await fetch(apiUrl('/documents'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`
    },
    body: formData
  });

      const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (data && data.error) ? data.error : 'Upload failed';
    if (msg.toLowerCase().includes('duplicate reference')) {
      setUploadError('Duplicate reference generated — please try again');
     } else {
      setUploadError(msg);
    }
    setLoading(false);    return;
  }
      

      // server returns { message, reference, document }
      const reference = data.reference || null;
      setServerReference(reference);

      // Add document locally (omit id so context generates local id)
      const serverDoc = data.document || {};
      const effectiveNeedsApproval = serverDoc.needs_approval === undefined ? requiresApproval : serverDoc.needs_approval;
      const localDoc = {
        id: serverDoc.id,
        title: serverDoc.title || form.title,
        department: serverDoc.department || (departments.find(d => d.id === form.departmentId)?.name) || '',
        reference: reference || '',
        date: serverDoc.date || form.date,
        uploadedBy: serverDoc.uploaded_by || user?.name || '',
        uploadedById: serverDoc.uploaded_by_id || user?.id || '',
        status: serverDoc.status || (effectiveNeedsApproval ? 'pending' : 'approved'),
        version: serverDoc.version || 1,
        fileType: serverDoc.file_type || form.fileType,
        size: serverDoc.size || form.size,
        folderId: serverDoc.folder_id || form.folderId,
        needsApproval: effectiveNeedsApproval,
        description: serverDoc.description || form.description,
        tags: serverDoc.tags || tags
      };

      addDocument(localDoc as any);
      await refreshDocuments();

      addLog({
        userId: user?.id || '',
        userName: user?.name || '',
        userRole: user?.role || '',
        action: 'DOCUMENT_UPLOAD',
        target: form.title,
        targetType: 'document',
        timestamp: new Date().toISOString(),
        ipAddress: '192.168.1.100',
        details: effectiveNeedsApproval ? 'Uploaded, pending approval' : 'Uploaded and auto-approved'
      });

      setSubmittedNeedsApproval(effectiveNeedsApproval);
      setSubmitted(true);
      setLoading(false);
      // keep modal open briefly to show success & reference
      setTimeout(onClose, 1800);
    } catch (err: any) {
      console.error('Upload error', err);
      setUploadError(err?.message || 'Network error — upload failed');
      setLoading(false);
    }
  };

  // Load departments on mount
  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/departments`, {
          headers: {
            ...(user && (window.localStorage.getItem('dms_token')) ? { Authorization: `Bearer ${window.localStorage.getItem('dms_token')}` } : {})
          }
        });
        if (!mounted) return;
        const json = await res.json().catch(() => ({}));
        const list = json.departments || [];
        setDepartments(list);
        // set default selection if none
        if (list.length > 0) {
          // prefer matching user's department name when possible
          const match = list.find((d: any) => d.name === user?.department || d.name.toLowerCase() === (user?.department || '').toLowerCase());
          setForm(prev => ({ ...prev, departmentId: match ? match.id : prev.departmentId || list[0].id }));
        }
      } catch (err) {
        console.error('Failed to load departments', err);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user]);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setFileName(file.name);
      setSelectedFile(file);
      const nameExt = file.name.split('.').pop()?.toLowerCase();
      let ext = (nameExt || file.type.split('/').pop() || '').toLowerCase();
      if (file.type && file.type.startsWith('video')) {
        ext = nameExt || (file.type.split('/')[1] || 'mp4');
      }
      const allowed = ['pdf', 'doc', 'docx', 'xlsx', 'jpg', 'png', 'tiff', 'mp4', 'mov', 'avi', 'mkv'];
      if (allowed.includes(ext)) {
        setForm((prev) => ({
          ...prev,
          fileType: ext as any,
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`
        }));
      }
      setErrors((prev) => ({
        ...prev,
        file: ''
      }));
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setSelectedFile(file);
      const nameExt = file.name.split('.').pop()?.toLowerCase();
      let ext = (nameExt || file.type.split('/').pop() || '').toLowerCase();
      if (file.type && file.type.startsWith('video')) {
        ext = nameExt || (file.type.split('/')[1] || 'mp4');
      }
      const allowed = ['pdf', 'doc', 'docx', 'xlsx', 'jpg', 'png', 'tiff', 'mp4', 'mov', 'avi', 'mkv'];
      if (allowed.includes(ext)) {
        setForm((prev) => ({
          ...prev,
          fileType: ext as any,
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`
        }));
      }
      setErrors((prev) => ({
        ...prev,
        file: ''
      }));
    }
  };
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h3 className="font-semibold text-gray-800 text-lg mb-2">
            Document Uploaded!
          </h3>
          <p className="text-sm text-gray-500">
            {submittedNeedsApproval ?
            'Your document has been submitted for approval.' :
            'Your document has been saved successfully.'}
          </p>
          {serverReference && (
            <p className="mt-3 text-sm font-medium text-gray-700">
              Reference: <span className="font-mono text-sm text-[#005F02]">{serverReference}</span>
            </p>
          )}
        </div>
      </div>);

  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 text-lg">
              Upload New Document
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Fill in document details and attach a file
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">

            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* File Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragging ? 'border-[#427A43] bg-[#F0FDF4]' : errors.file ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-[#427A43]'}`}>

            {fileName ?
            <div className="flex items-center justify-center gap-2">
                <FileText size={20} className="text-[#005F02]" />
                <span className="text-sm font-medium text-gray-800">
                  {fileName}
                </span>
                <button
                onClick={() => setFileName('')}
                className="text-gray-400 hover:text-red-500">

                  <X size={16} />
                </button>
              </div> :

            <>
                <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 mb-1">
                  Drag & drop your file here
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  PDF, DOC, DOCX, XLSX, JPG, PNG, TIFF and video files supported
                </p>
                <label className="cursor-pointer px-4 py-2 bg-[#005F02] text-white text-xs font-medium rounded-lg hover:bg-[#427A43] transition-colors">
                  Browse Files
                  <input
                  type="file"
                  className="hidden"
                  accept="video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.png,.tiff"
                  onChange={handleFileInput} />

                </label>
              </>
            }
            {errors.file &&
            <p className="text-xs text-red-500 mt-2">{errors.file}</p>
            }
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Document Title *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    title: e.target.value
                  }));
                  setErrors((prev) => ({
                    ...prev,
                    title: ''
                  }));
                }}
                placeholder="e.g. Q1 Financial Report"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] ${errors.title ? 'border-red-300' : 'border-gray-200'}`} />

              {errors.title &&
              <p className="text-xs text-red-500 mt-1">{errors.title}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Reference Number
              </label>
              <div className="w-full px-3 py-2.5 border rounded-lg text-sm bg-gray-50 text-gray-600">
                {serverReference || 'Will be generated after upload'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  date: e.target.value
                }))
                }
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]" />

            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Department / Folder
              </label>
              <select
                value={selectedParentFolderId}
                onChange={(e) => {
                  setSelectedParentFolderId(e.target.value);
                  setSelectedSubfolderId(''); // Reset subfolder when parent changes
                }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]">
                <option value="">Select folder...</option>
                {rootFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Subfolder (Optional)
              </label>
              <select
                value={selectedSubfolderId}
                onChange={(e) => setSelectedSubfolderId(e.target.value)}
                disabled={!selectedParentFolderId}
                className={`w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] ${!selectedParentFolderId ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}>
                <option value="">Save in department root</option>
                {availableSubfolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {'—'.repeat(f.depth)} {f.depth > 0 ? ' ' : ''}{f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: e.target.value
                }))
                }
                placeholder="Brief description of this document..."
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] resize-none" />

            </div>

            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Tag size={14} />
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  tags: e.target.value
                }))
                }
                placeholder="e.g. financial, quarterly, 2026"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]" />

            </div>
          </div>

          {/* Requires Approval Notice */}
          <div className="flex items-center gap-3 p-4 bg-[#F2E3BB] rounded-xl border border-[#C0B87A]/50">
            <div className="w-5 h-5 bg-[#005F02] rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#005F02]">
                {requiresApproval ? 'Requires Approval' : 'Auto Approved'}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {requiresApproval
                  ? 'Staff uploads are sent to a manager or admin for review'
                  : 'Admin and manager uploads are saved immediately without approval'}
              </p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white p-6 pt-0">
          {uploadError && (
            <div className="mb-2 text-sm text-red-600">{uploadError}</div>
          )}
          <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`flex-1 py-3 text-white font-semibold text-sm rounded-xl transition-colors ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#005F02] hover:bg-[#427A43]'}`}>

            {loading ? 'Uploading...' : requiresApproval ? 'Submit for Approval' : 'Upload Document'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-300 text-gray-600 font-medium text-sm rounded-xl hover:bg-gray-50 transition-colors">

            Cancel
          </button>
          </div>
        </div>
      </div>
    </div>);

}