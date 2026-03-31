import React, { useState, useRef } from 'react';
import { Upload, RotateCcw, Check, X, Loader2 } from 'lucide-react';
import { useLogo, LOGO_SIZES, LogoSize } from '../context/LogoContext';

export function LogoSettings() {
  const { logo, logoSize, updateLogo, updateLogoSize, resetLogo, loading } = useLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savingSize, setSavingSize] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Invalid file type. Please use PNG, JPEG, GIF, SVG, or WebP.' });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File size must be less than 5MB.' });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setMessage(null);

    try {
      const success = await updateLogo(selectedFile);
      if (success) {
        setMessage({ type: 'success', text: 'Logo updated successfully!' });
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setMessage({ type: 'error', text: 'Failed to update logo. Please try again.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while updating the logo.' });
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setMessage(null);

    try {
      const success = await resetLogo();
      if (success) {
        setMessage({ type: 'success', text: 'Logo reset to default!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to reset logo. Please try again.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while resetting the logo.' });
    } finally {
      setResetting(false);
    }
  };

  const handleSizeChange = async (size: LogoSize) => {
    setSavingSize(true);
    setMessage(null);

    try {
      const success = await updateLogoSize(size);
      if (success) {
        setMessage({ type: 'success', text: 'Logo size updated!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to update logo size.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while updating logo size.' });
    } finally {
      setSavingSize(false);
    }
  };

  const isCustomLogo = logo.includes('/uploads/');

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Current Logo Preview */}
      <div className="flex flex-col items-center">
        <p className="text-sm font-medium text-gray-700 mb-3">Current Logo</p>
        <div className="w-48 h-32 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden">
          {loading ? (
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          ) : (
            <img
              src={logo}
              alt="Current Logo"
              className="max-w-full max-h-full object-contain p-2"
            />
          )}
        </div>
        {isCustomLogo && (
          <span className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
            Custom Logo
          </span>
        )}
      </div>

      {/* Logo Size Selection */}
      <div className="border-t pt-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Logo Size</p>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(LOGO_SIZES) as LogoSize[]).map((size) => (
            <button
              key={size}
              onClick={() => handleSizeChange(size)}
              disabled={savingSize}
              className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                logoSize === size
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              } ${savingSize ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`bg-gray-200 rounded flex items-center justify-center overflow-hidden ${
                size === 'small' ? 'w-12 h-6' : size === 'medium' ? 'w-16 h-8' : 'w-20 h-10'
              }`}>
                <img src={logo} alt="Preview" className="max-w-full max-h-full object-contain" />
              </div>
              <span className={`text-xs font-medium ${logoSize === size ? 'text-blue-700' : 'text-gray-600'}`}>
                {LOGO_SIZES[size].label}
              </span>
              {logoSize === size && (
                <Check size={14} className="text-blue-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Upload New Logo */}
      <div className="border-t pt-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Upload New Logo</p>

        {/* File Input Area */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          {previewUrl ? (
            <div className="space-y-3">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-[200px] max-h-[100px] object-contain mx-auto"
              />
              <p className="text-sm text-gray-600">{selectedFile?.name}</p>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-gray-400">
                PNG, JPEG, GIF, SVG, or WebP (max 5MB)
              </p>
            </>
          )}
        </div>

        {/* Action Buttons */}
        {selectedFile && (
          <div className="flex justify-center gap-3 mt-4">
            <button
              onClick={handleCancel}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Save Logo
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Reset to Default */}
      {isCustomLogo && (
        <div className="border-t pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Reset to Default</p>
              <p className="text-xs text-gray-500">
                Restore the original Maptech logo
              </p>
            </div>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 flex items-center gap-2"
            >
              {resetting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  Reset Logo
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="border-t pt-4">
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> The logo will be displayed in the login page and sidebar.
          For best results, use a transparent PNG with dimensions around 200x80 pixels.
        </p>
      </div>
    </div>
  );
}
