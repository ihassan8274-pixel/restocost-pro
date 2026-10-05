import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Option {
  value: string;
  label: string;
  [key: string]: any;
}

interface AutocompleteSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  getOptionLabel?: (opt: Option) => string;
  onSelect?: (opt: Option) => void;
  disabled?: boolean;
  required?: boolean;
}

interface DropPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

export const AutocompleteSelect: React.FC<AutocompleteSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'ابحث أو اختر...',
  className = '',
  getOptionLabel = (opt) => opt.label,
  onSelect,
  disabled = false,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [pos, setPos] = useState<DropPos>({ left: 0, width: 0, top: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((opt) =>
    getOptionLabel(opt).includes(search) || opt.value.includes(search)
  );

  const selectedOption = options.find((opt) => opt.value === value);

  const closeAll = () => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  };

  const updatePosition = () => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const MIN_H = 240;
    if (spaceBelow < MIN_H && rect.top > spaceBelow) {
      setPos({ left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 4 });
    } else {
      setPos({ left: rect.left, width: rect.width, top: rect.bottom + 4 });
    }
  };

  const openList = () => {
    if (disabled) return;
    updatePosition();
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  // إغلاق القائمة عند التمرير أو تغيير حجم النافذة؛ وإعادة تموضعها عند تغيير الحجم
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => updatePosition());
    const onScroll = (e: Event) => {
      if (listRef.current && listRef.current.contains(e.target as Node)) return;
      closeAll();
    };
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node) &&
          listRef.current && !listRef.current.contains(e.target as Node)) {
        closeAll();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // إظهار الخيار المميز داخل القائمة أثناء التنقل بالكيبورد
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !listRef.current) return;
    const li = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    li?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          const opt = filteredOptions[highlightedIndex];
          onChange(opt.value);
          onSelect?.(opt);
          closeAll();
          inputRef.current?.blur();
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeAll();
        inputRef.current?.blur();
        break;
      case 'Tab':
        closeAll();
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    setIsOpen(true);
    setHighlightedIndex(0);
    updatePosition();
    const match = options.find((opt) => getOptionLabel(opt) === val || opt.value === val);
    if (match) {
      onChange(match.value);
      onSelect?.(match);
    }
  };

  const handleOptionClick = (opt: Option) => {
    onChange(opt.value);
    onSelect?.(opt);
    closeAll();
    inputRef.current?.focus();
  };

  const foundValue = options.find((o) => o.value === value);
  const displayValue = selectedOption ? getOptionLabel(selectedOption) : (value && foundValue ? getOptionLabel(foundValue) : '');

  return (
    <div className={`relative ${className}`}>
      <div
        className={`flex items-center border rounded-xl bg-white ${disabled ? 'bg-slate-50 cursor-not-allowed' : 'border-slate-300 hover:border-brand-400 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500'} transition-all`}
        onClick={(e) => { if (!disabled && (e.target as HTMLElement).closest('svg')) { if (isOpen) closeAll(); else openList(); } }}
      >
        <input
          ref={inputRef}
          type="text"
          value={search || displayValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (!disabled) openList(); }}
          onBlur={() => { setTimeout(() => { if (!listRef.current?.matches(':hover')) { closeAll(); } }, 150); }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="flex-1 px-3 py-2 text-right text-sm font-medium text-slate-900 placeholder-slate-400 bg-transparent outline-none min-w-0"
          autoComplete="off"
          spellCheck={false}
        />
        <svg className={`w-5 h-5 text-slate-400 ml-2 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="z-[70] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-center text-slate-500 text-sm">لا توجد نتائج مطابقة</div>
          ) : (
            filteredOptions.map((opt, idx) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleOptionClick(opt)}
                className={`w-full px-3 py-2 text-right text-sm ${idx === highlightedIndex ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-700'} flex items-center gap-2`}
              >
                <span className="font-medium">{getOptionLabel(opt)}</span>
                {opt.code && <span className="text-[10px] text-slate-400 font-mono">{opt.code}</span>}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
};