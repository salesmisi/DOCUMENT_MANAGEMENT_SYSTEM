import React, { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';

interface AutocompleteSearchProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  maxSuggestions?: number;
}

export function AutocompleteSearch({
  value,
  onChange,
  suggestions,
  placeholder = 'Search...',
  className = '',
  inputClassName = '',
  maxSuggestions = 6,
}: AutocompleteSearchProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.trim()
    ? [...new Set(
        suggestions.filter((s) =>
          s.toLowerCase().includes(value.toLowerCase())
        )
      )].slice(0, maxSuggestions)
    : [];

  useEffect(() => {
    setSelectedIndex(-1);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      onChange(filtered[selectedIndex]);
      setShowSuggestions(false);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSelect = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <Search size={16} className="text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          className={`bg-transparent text-sm outline-none flex-1 text-gray-700 ${inputClassName}`}
        />
      </div>

      {showSuggestions && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          {filtered.map((suggestion, index) => {
            const matchStart = suggestion.toLowerCase().indexOf(value.toLowerCase());
            const matchEnd = matchStart + value.length;
            return (
              <button
                key={`${suggestion}-${index}`}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  index === selectedIndex
                    ? 'bg-[#F0FDF4] text-[#005F02]'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Search size={12} className="text-gray-300 flex-shrink-0" />
                <span>
                  {matchStart >= 0 ? (
                    <>
                      {suggestion.slice(0, matchStart)}
                      <span className="font-semibold text-[#005F02]">
                        {suggestion.slice(matchStart, matchEnd)}
                      </span>
                      {suggestion.slice(matchEnd)}
                    </>
                  ) : (
                    suggestion
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
