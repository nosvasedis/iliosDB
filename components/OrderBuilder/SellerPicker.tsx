import React, { useState, useMemo, useRef, useEffect } from 'react';
import { UserCheck, X, Percent, ChevronDown } from 'lucide-react';
import { useSellers } from '../../hooks/api/useSellers';
import { UserProfile } from '../../types';

interface SellerPickerProps {
  selectedSellerId: string | undefined;
  selectedSellerName: string | undefined;
  commissionPercent: number | undefined;
  onSellerChange: (sellerId: string | undefined, sellerName: string | undefined, defaultCommission: number | undefined) => void;
  onCommissionChange: (percent: number | undefined) => void;
  /** Compact layout for mobile */
  compact?: boolean;
}

export const SellerPicker: React.FC<SellerPickerProps> = ({
  selectedSellerId,
  selectedSellerName,
  commissionPercent,
  onSellerChange,
  onCommissionChange,
  compact,
}) => {
  const { data: sellers } = useSellers();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSellers = useMemo(() =>
    (sellers || []).filter(s => s.is_approved),
    [sellers]
  );

  const filteredSellers = useMemo(() => {
    if (!search) return activeSellers;
    const lower = search.toLowerCase();
    return activeSellers.filter(s =>
      s.full_name.toLowerCase().includes(lower) ||
      s.email.toLowerCase().includes(lower)
    );
  }, [activeSellers, search]);

  const selectedSeller = useMemo(() =>
    activeSellers.find(s => s.id === selectedSellerId),
    [activeSellers, selectedSellerId]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSelect = (seller: UserProfile) => {
    onSellerChange(seller.id, seller.full_name, seller.commission_percent ?? undefined);
    onCommissionChange(seller.commission_percent ?? undefined);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSellerChange(undefined, undefined, undefined);
    onCommissionChange(undefined);
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase block">Πλασιέ (προαιρετικά)</label>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${selectedSellerId ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck size={16} className={selectedSellerId ? 'text-sky-500' : 'text-slate-400'} />
              <span className={`text-sm font-bold truncate ${selectedSellerId ? 'text-sky-700' : 'text-slate-400'}`}>
                {selectedSellerName || 'Επιλέξτε πλασιέ...'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {selectedSellerId && (
                <button type="button" onClick={handleClear} className="p-1 text-slate-400 hover:text-red-500">
                  <X size={14} />
                </button>
              )}
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-52">
              {activeSellers.length > 3 && (
                <div className="p-2 border-b border-slate-100">
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Αναζήτηση..."
                    className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none"
                    autoFocus
                  />
                </div>
              )}
              <div className="max-h-40 overflow-y-auto">
                {filteredSellers.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className={`w-full text-left p-3 hover:bg-sky-50 border-b border-slate-50 last:border-0 transition-colors ${s.id === selectedSellerId ? 'bg-sky-50' : ''}`}
                  >
                    <div className="text-sm font-bold text-slate-800">{s.full_name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400">{s.email}</span>
                      {s.commission_percent != null && (
                        <span className="text-[10px] font-bold text-emerald-600">{s.commission_percent}%</span>
                      )}
                    </div>
                  </button>
                ))}
                {filteredSellers.length === 0 && (
                  <div className="p-3 text-sm text-slate-400 text-center">Δεν βρέθηκαν πλασιέ</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Commission % input — only shown when seller is selected */}
        {selectedSellerId && (
          <div className="flex items-center gap-2">
            <Percent size={14} className="text-emerald-500 shrink-0" />
            <input
              value={commissionPercent != null ? commissionPercent : ''}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9.,]/g, '');
                onCommissionChange(val ? Number(val.replace(',', '.')) : undefined);
              }}
              className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Προμήθεια %"
              inputMode="decimal"
            />
          </div>
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="space-y-3">
      <h4 className="font-bold text-slate-800 flex items-center gap-2 uppercase text-xs tracking-wider">
        <UserCheck size={14} /> Πλασιέ
      </h4>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${selectedSellerId ? 'border-sky-300 bg-sky-50/50 ring-2 ring-sky-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${selectedSellerId ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
              {selectedSellerName ? selectedSellerName.charAt(0).toUpperCase() : '?'}
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-bold truncate ${selectedSellerId ? 'text-sky-700' : 'text-slate-400'}`}>
                {selectedSellerName || 'Χωρίς πλασιέ'}
              </div>
              {selectedSeller?.email && (
                <div className="text-[10px] text-slate-400 truncate">{selectedSeller.email}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedSellerId && (
              <button type="button" onClick={handleClear} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                <X size={14} />
              </button>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden">
            {activeSellers.length > 3 && (
              <div className="p-2 border-b border-slate-100">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Αναζήτηση πλασιέ..."
                  className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500/20"
                  autoFocus
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {filteredSellers.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className={`w-full text-left p-3 hover:bg-sky-50 border-b border-slate-50 last:border-0 transition-colors ${s.id === selectedSellerId ? 'bg-sky-50' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-sky-50 text-sky-600 rounded-lg flex items-center justify-center font-bold text-sm">
                      {s.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-800 truncate">{s.full_name}</div>
                      <div className="text-[10px] text-slate-400">{s.email}</div>
                    </div>
                    {s.commission_percent != null && (
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {s.commission_percent}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {filteredSellers.length === 0 && (
                <div className="p-4 text-sm text-slate-400 text-center">Δεν βρέθηκαν ενεργοί πλασιέ</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Commission % */}
      {selectedSellerId && (
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Προμήθεια (%)</label>
          <div className="relative">
            <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
            <input
              value={commissionPercent != null ? commissionPercent : ''}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9.,]/g, '');
                onCommissionChange(val ? Number(val.replace(',', '.')) : undefined);
              }}
              className="w-full p-2.5 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="π.χ. 5"
              inputMode="decimal"
            />
          </div>
        </div>
      )}
    </div>
  );
};
