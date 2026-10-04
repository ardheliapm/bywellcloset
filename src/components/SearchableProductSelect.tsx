'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Package, Layers } from 'lucide-react';
import { ProductItem } from '@/app/products/actions';

interface SearchableProductSelectProps {
  products: ProductItem[];
  value: string;
  onChange: (productId: string, product?: ProductItem) => void;
  placeholder?: string;
  allowManual?: boolean;
  onManualSelect?: () => void;
  disabled?: boolean;
  stockType?: 'PHYSICAL' | 'AVAILABLE';
  className?: string;
}

export default function SearchableProductSelect({
  products = [],
  value,
  onChange,
  placeholder = 'Ketik SKU atau nama motif untuk mencari...',
  allowManual = false,
  onManualSelect,
  disabled = false,
  stockType = 'PHYSICAL',
  className = '',
}: SearchableProductSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find currently selected product
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === value);
  }, [products, value]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const skuMatch = p.sku.toLowerCase().includes(q);
      const nameMatch = p.name.toLowerCase().includes(q);
      const motifMatch = p.motif ? p.motif.toLowerCase().includes(q) : false;
      const colorMatch = p.color ? p.color.toLowerCase().includes(q) : false;
      return skuMatch || nameMatch || motifMatch || colorMatch;
    });
  }, [products, searchQuery]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (prod: ProductItem) => {
    onChange(prod.id, prod);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  const handleSelectManual = () => {
    if (onManualSelect) {
      onManualSelect();
    } else {
      onChange('__MANUAL__');
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredProducts.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts[highlightedIndex]) {
        handleSelect(filteredProducts[highlightedIndex]);
      } else if (allowManual && searchQuery.trim()) {
        handleSelectManual();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button / Selected Display */}
      <div
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`w-full px-3 py-2 bg-white border rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer transition-all shadow-2xs ${
          isOpen
            ? 'border-rose-500 ring-2 ring-rose-500/20'
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
      >
        <div className="flex-1 flex items-center gap-2 truncate">
          {selectedProduct ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] border border-slate-200 shrink-0">
                {selectedProduct.sku}
              </span>
              <span className="font-semibold text-slate-800 truncate">
                {selectedProduct.name}
                {selectedProduct.motif ? ` - ${selectedProduct.motif}` : ''}
                {selectedProduct.color ? ` (${selectedProduct.color})` : ''}
              </span>
              <span className="text-[11px] text-slate-400 shrink-0">
                • {stockType === 'PHYSICAL' ? `Stok: ${selectedProduct.physicalStock}` : `Tersedia: ${selectedProduct.availableStock}`} pcs
              </span>
            </div>
          ) : value === '__MANUAL__' ? (
            <span className="font-semibold text-indigo-600 flex items-center gap-1">
              ✍️ Input Manual Custom
            </span>
          ) : (
            <span className="text-slate-400 font-normal truncate flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-100 hover:text-rose-500 transition-colors cursor-pointer"
              title="Hapus pilihan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-rose-500' : 'text-slate-400'
            }`}
          />
        </div>
      </div>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 flex flex-col max-h-72">
          {/* Search Box Header */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ketik SKU (cth: BW83, 119, Paris)..."
                className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Match info */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium px-1 pt-1.5">
              <span>{filteredProducts.length} SKU ditemukan</span>
              {searchQuery && (
                <span className="text-rose-500 font-semibold">Filter: &quot;{searchQuery}&quot;</span>
              )}
            </div>
          </div>

          {/* Product Items List */}
          <div ref={listRef} className="overflow-y-auto divide-y divide-slate-50 p-1 flex-1">
            {filteredProducts.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400 space-y-1.5">
                <Package className="w-6 h-6 mx-auto text-slate-300" />
                <p className="font-semibold text-slate-600">Produk tidak ditemukan</p>
                <p className="text-[11px]">Tidak ada SKU atau nama yang cocok dengan &quot;{searchQuery}&quot;</p>
              </div>
            ) : (
              filteredProducts.map((prod, idx) => {
                const isSelected = prod.id === value;
                const isHighlighted = idx === highlightedIndex;

                const stockCount =
                  stockType === 'PHYSICAL' ? prod.physicalStock : prod.availableStock;

                return (
                  <div
                    key={prod.id}
                    onClick={() => handleSelect(prod)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-rose-50 text-rose-900 font-semibold'
                        : isHighlighted
                        ? 'bg-slate-100/80 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-800 text-[11px] border border-slate-300/60 shrink-0">
                        {prod.sku}
                      </span>
                      <div className="truncate">
                        <div className="font-semibold text-slate-900 truncate flex items-center gap-1">
                          <span>{prod.name}</span>
                          {prod.motif && (
                            <span className="text-slate-500 font-normal text-[11px]">
                              - {prod.motif}
                            </span>
                          )}
                          {prod.color && (
                            <span className="text-slate-400 font-normal text-[11px]">
                              ({prod.color})
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>Harga: Rp {(prod.sellingPrice || prod.wholesalePrice || 0).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          stockCount > 5
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : stockCount > 0
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {stockType === 'PHYSICAL' ? `Stok: ${stockCount}` : `Tersedia: ${stockCount}`} pcs
                      </span>

                      {isSelected && (
                        <Check className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Allow Manual Product Option */}
            {allowManual && (
              <div
                onClick={handleSelectManual}
                className="mt-1 p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-dashed border-slate-200 hover:border-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>✍️ Ketik Manual (Produk Custom)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
