import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteFolderModalProps {
  folderName: string;
  hasChildren: boolean;
  childCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteFolderModal({
  folderName,
  hasChildren,
  childCount,
  onConfirm,
  onCancel,
}: DeleteFolderModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-red-50 rounded-xl flex-shrink-0">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 text-base">Delete Folder</h3>
              {hasChildren ? (
                <p className="text-sm text-gray-500 mt-1">
                  Cannot delete <span className="font-medium text-gray-700">"{folderName}"</span> — it
                  has {childCount} subfolder{childCount !== 1 ? 's' : ''}. Delete subfolders first.
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">
                  Are you sure you want to delete{' '}
                  <span className="font-medium text-gray-700">"{folderName}"</span>?
                  <br />
                  This action cannot be undone.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {!hasChildren && (
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
