import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Folder, FileText, Hash, X } from 'lucide-react';

export interface SearchItem {
  id: string;
  type: 'folder' | 'document';
  name: string;
  reference?: string;
  department?: string;
}

interface UnifiedSearchProps {
  documents: Array<{
    id: string;
    title: string;
    reference?: string;
    department?: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    department?: string;
  }>;
  onSelectFolder: (folderId: string) => void;
  onSelectDocument: (documentId: string) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export function UnifiedSearch({
  documents,
  folders,
  onSelectFolder,
  onSelectDocument,
  onSearch,
  placeholder = 'Search files and folders...',
  className = '',
}: UnifiedSearchProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build combined suggestions from folders and documents
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];

    const queryLower = query.toLowerCase();
    const results: SearchItem[] = [];

    // Search folders by name AND department
    folders.forEach((folder) => {
      const matchesName = folder.name.toLowerCase().includes(queryLower);
      const matchesDept = folder.department?.toLowerCase().includes(queryLower);

      if (matchesName || matchesDept) {
        results.push({
          id: folder.id,
          type: 'folder',
          name: folder.name,
          department: folder.department,
        });
      }
    });

    // Search documents by title, reference, and department
    documents.forEach((doc) => {
      const matchesTitle = doc.title.toLowerCase().includes(queryLower);
      const matchesRef = doc.reference?.toLowerCase().includes(queryLower);
      const matchesDept = doc.department?.toLowerCase().includes(queryLower);

      if (matchesTitle || matchesRef || matchesDept) {
        results.push({
          id: doc.id,
          type: 'document',
          name: doc.title,
          reference: doc.reference,
          department: doc.department,
        });
      }
    });

    // Sort: folders first, then documents, limit to 10
    return results
      .sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [query, documents, folders]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        onSearch(query);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSelect(suggestions[selectedIndex]);
      } else {
        onSearch(query);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Handle selection
  const handleSelect = (item: SearchItem) => {
    if (item.type === 'folder') {
      onSelectFolder(item.id);
      setQuery('');
    } else {
      onSelectDocument(item.id);
      setQuery(item.name);
    }
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowSuggestions(true);
    onSearch(value);
  };

  // Clear search
  const handleClear = () => {
    setQuery('');
    onSearch('');
    inputRef.current?.focus();
  };

  // Highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="font-semibold text-[#005F02]">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-8 py-1.5 text-sm bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#404040] rounded-md focus:outline-none focus:ring-2 focus:ring-[#005F02] text-gray-800 dark:text-gray-200"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-[#2d2d2d] rounded-lg shadow-lg border border-gray-200 dark:border-[#404040] z-50 overflow-hidden max-h-80 overflow-y-auto">
          {/* Folders Section */}
          {suggestions.some((s) => s.type === 'folder') && (
            <>
              <div className="px-3 py-1.5 bg-gray-50 dark:bg-[#1d1d1d] text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Folders
              </div>
              {suggestions
                .filter((s) => s.type === 'folder')
                .map((item, index) => {
                  const actualIndex = suggestions.findIndex((s) => s.id === item.id && s.type === item.type);
                  return (
                    <button
                      key={`folder-${item.id}`}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors ${
                        actualIndex === selectedIndex
                          ? 'bg-[#F0FDF4] dark:bg-[#005F02]/20 text-[#005F02]'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]'
                      }`}
                    >
                      <Folder size={16} className="text-[#dcb67a] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{highlightMatch(item.name, query)}</p>
                        {item.department && (
                          <p className="text-xs text-gray-400 truncate">{item.department}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
            </>
          )}

          {/* Documents Section */}
          {suggestions.some((s) => s.type === 'document') && (
            <>
              <div className="px-3 py-1.5 bg-gray-50 dark:bg-[#1d1d1d] text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Documents
              </div>
              {suggestions
                .filter((s) => s.type === 'document')
                .map((item) => {
                  const actualIndex = suggestions.findIndex((s) => s.id === item.id && s.type === item.type);
                  return (
                    <button
                      key={`doc-${item.id}`}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors ${
                        actualIndex === selectedIndex
                          ? 'bg-[#F0FDF4] dark:bg-[#005F02]/20 text-[#005F02]'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]'
                      }`}
                    >
                      <FileText size={16} className="text-[#427A43] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{highlightMatch(item.name, query)}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {item.reference && (
                            <span className="flex items-center gap-1">
                              <Hash size={10} />
                              {highlightMatch(item.reference, query)}
                            </span>
                          )}
                          {item.department && <span>{item.department}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </>
          )}
        </div>
      )}

      {/* No results message */}
      {showSuggestions && query.trim() && suggestions.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-[#2d2d2d] rounded-lg shadow-lg border border-gray-200 dark:border-[#404040] z-50 p-4 text-center">
          <Search size={24} className="mx-auto text-gray-300 dark:text-gray-500 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No results found for "{query}"</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try searching by file name or reference number</p>
        </div>
      )}
    </div>
  );
}

export default UnifiedSearch;
