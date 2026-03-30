import React, { useState } from 'react';
import { formatDate } from '../utils/locale';
import {
  XIcon,
  PrinterIcon,
  ScanIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  Loader2Icon } from
'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}
type ScanStatus = 'idle' | 'scanning' | 'success' | 'error';
export function ScanModal({ isOpen, onClose }: ScanModalProps) {
  const { user } = useAuth();
  const { folders, uploadDocument, addActivityLog, departments } =
  useDocuments();
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [formData, setFormData] = useState({
    title: '',
    reference: '',
    department: user?.department || '',
    folderId: 'folder-9',
    resolution: '300',
    colorMode: 'color',
    sendToEmail: false,
    email: ''
  });
  if (!isOpen) return null;
  const handleScan = async () => {
    setScanStatus('scanning');
    // Simulate scanning process
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!user) {
      setScanStatus('error');
      return;
    }
    const newDoc = uploadDocument({
      title:
      formData.title || `Scanned Document - ${formatDate(new Date())}`,
      department: formData.department,
      reference: formData.reference || `SCAN-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      uploadedBy: user.name,
      uploadedById: user.id,
      status: 'approved',
      version: 1,
      fileType: 'pdf',
      size: '1.2 MB',
      folderId: formData.folderId,
      needsApproval: false,
      metadata: {
        scannedFrom: 'Brother DCP-T520DW',
        resolution: `${formData.resolution} DPI`,
        colorMode: formData.colorMode
      }
    });
    addActivityLog({
      action: 'SCAN',
      userId: user.id,
      userName: user.name,
      documentId: newDoc.id,
      documentTitle: newDoc.title,
      details: `Document scanned from Brother DCP-T520DW at ${formData.resolution} DPI`,
      ipAddress: '192.168.1.100'
    });
    setScanStatus('success');
  };
  const handleClose = () => {
    onClose();
    setScanStatus('idle');
    setFormData({
      title: '',
      reference: '',
      department: user?.department || '',
      folderId: 'folder-9',
      resolution: '300',
      colorMode: 'color',
      sendToEmail: false,
      email: ''
    });
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-maptech-cream rounded-lg flex items-center justify-center">
              <PrinterIcon className="text-maptech-primary" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-maptech-dark">
                Scan Document
              </h2>
              <p className="text-sm text-gray-500">Brother DCP-T520DW</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">

            <XIcon size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {scanStatus === 'idle' &&
          <div className="space-y-5">
              {/* Scanner Status */}
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircleIcon className="text-green-600" size={20} />
                <span className="text-sm text-green-700 font-medium">
                  Scanner connected and ready
                </span>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                  Document Title
                </label>
                <input
                type="text"
                value={formData.title}
                onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  title: e.target.value
                }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
                placeholder="Optional - auto-generated if empty" />

              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                  Department
                </label>
                <select
                value={formData.department}
                onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  department: e.target.value
                }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary">

                  {departments.map((dept) =>
                <option key={dept.id} value={dept.name}>
                      {dept.name}
                    </option>
                )}
                </select>
              </div>

              {/* Folder */}
              <div>
                <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                  Save to Folder
                </label>
                <select
                value={formData.folderId}
                onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  folderId: e.target.value
                }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary">

                  {folders.map((folder) =>
                <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                )}
                </select>
              </div>

              {/* Scan Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                    Resolution
                  </label>
                  <select
                  value={formData.resolution}
                  onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    resolution: e.target.value
                  }))
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary">

                    <option value="150">150 DPI</option>
                    <option value="300">300 DPI</option>
                    <option value="600">600 DPI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                    Color Mode
                  </label>
                  <select
                  value={formData.colorMode}
                  onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    colorMode: e.target.value
                  }))
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary">

                    <option value="color">Color</option>
                    <option value="grayscale">Grayscale</option>
                    <option value="bw">Black & White</option>
                  </select>
                </div>
              </div>

              {/* Email Option */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                  type="checkbox"
                  id="sendToEmail"
                  checked={formData.sendToEmail}
                  onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    sendToEmail: e.target.checked
                  }))
                  }
                  className="w-4 h-4 text-maptech-primary border-gray-300 rounded focus:ring-maptech-primary" />

                  <label
                  htmlFor="sendToEmail"
                  className="text-sm text-maptech-dark">

                    Also send to email
                  </label>
                </div>
                {formData.sendToEmail &&
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  email: e.target.value
                }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
                placeholder="Enter email address" />

              }
              </div>

              {/* Scan Button */}
              <button
              onClick={handleScan}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-maptech-primary text-white rounded-lg hover:bg-maptech-primary/90 transition-colors font-medium">

                <ScanIcon size={20} />
                Start Scanning
              </button>
            </div>
          }

          {scanStatus === 'scanning' &&
          <div className="py-12 text-center">
              <Loader2Icon
              className="mx-auto text-maptech-primary animate-spin mb-4"
              size={48} />

              <p className="text-lg font-medium text-maptech-dark">
                Scanning document...
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Please wait while the document is being scanned
              </p>
            </div>
          }

          {scanStatus === 'success' &&
          <div className="py-12 text-center">
              <CheckCircleIcon
              className="mx-auto text-green-600 mb-4"
              size={48} />

              <p className="text-lg font-medium text-maptech-dark">
                Scan Complete!
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Document has been saved successfully
              </p>
              <button
              onClick={handleClose}
              className="mt-6 px-6 py-2.5 bg-maptech-primary text-white rounded-lg hover:bg-maptech-primary/90 transition-colors font-medium">

                Done
              </button>
            </div>
          }

          {scanStatus === 'error' &&
          <div className="py-12 text-center">
              <AlertCircleIcon
              className="mx-auto text-red-600 mb-4"
              size={48} />

              <p className="text-lg font-medium text-maptech-dark">
                Scan Failed
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Please check the scanner connection and try again
              </p>
              <button
              onClick={() => setScanStatus('idle')}
              className="mt-6 px-6 py-2.5 bg-maptech-primary text-white rounded-lg hover:bg-maptech-primary/90 transition-colors font-medium">

                Try Again
              </button>
            </div>
          }
        </div>
      </div>
    </div>);

}