import React from 'react';
import { ShoppingBag, Tag } from 'lucide-react';
import { LabelPriceTier } from '../../features/printing/labelText';
import { LabelPrintFormat } from '../../features/printing/labelPrintSettings';

interface LabelPrintSettingsPanelProps {
  format: LabelPrintFormat;
  showPrice: boolean;
  priceTier: LabelPriceTier;
  onFormatChange: (format: LabelPrintFormat) => void;
  onShowPriceChange: (showPrice: boolean) => void;
  onPriceTierChange: (priceTier: LabelPriceTier) => void;
  layout?: 'stack' | 'inline' | 'toolbar';
}

const segmented = 'flex gap-2 bg-slate-50 p-1 rounded-xl';
const segmentButton = (active: boolean, activeClass = 'bg-white text-slate-900 shadow-sm') =>
  `flex-1 py-2 rounded-lg text-xs font-bold transition-all ${active ? activeClass : 'text-slate-500 hover:text-slate-700'}`;
const fieldLabel = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2';

const LabelPrintSettingsPanel: React.FC<LabelPrintSettingsPanelProps> = ({
  format,
  showPrice,
  priceTier,
  onFormatChange,
  onShowPriceChange,
  onPriceTierChange,
  layout = 'stack',
}) => {
  const formatToggle = (
    <div className={segmented}>
      <button
        type="button"
        onClick={() => onFormatChange('standard')}
        className={`${segmentButton(format === 'standard')} flex items-center justify-center gap-2 py-2.5`}
      >
        <Tag size={14} /> Χονδρική
      </button>
      <button
        type="button"
        onClick={() => onFormatChange('retail')}
        className={`${segmentButton(format === 'retail', 'bg-white text-emerald-700 shadow-sm')} flex items-center justify-center gap-2 py-2.5`}
      >
        <ShoppingBag size={14} /> Λιανική
      </button>
    </div>
  );

  const showPriceToggle = (
    <div>
      <label className={fieldLabel}>Εμφάνιση τιμής</label>
      <div className={segmented}>
        <button
          type="button"
          onClick={() => onShowPriceChange(true)}
          className={segmentButton(showPrice)}
        >
          Ναι
        </button>
        <button
          type="button"
          onClick={() => onShowPriceChange(false)}
          className={segmentButton(!showPrice)}
        >
          Όχι
        </button>
      </div>
    </div>
  );

  const priceTierToggle = (
    <div className={!showPrice ? 'opacity-40 pointer-events-none' : ''}>
      <label className={fieldLabel}>Τιμή ετικέτας</label>
      <div className={segmented}>
        <button
          type="button"
          onClick={() => onPriceTierChange('wholesale')}
          className={`${segmentButton(priceTier === 'wholesale')} flex items-center justify-center gap-1`}
        >
          <Tag size={12} /> Χονδρική
        </button>
        <button
          type="button"
          onClick={() => onPriceTierChange('retail')}
          className={`${segmentButton(priceTier === 'retail', 'bg-white text-emerald-700 shadow-sm')} flex items-center justify-center gap-1`}
        >
          <ShoppingBag size={12} /> Λιανική ×3
        </button>
      </div>
    </div>
  );

  if (layout === 'toolbar') {
    const bar = 'flex gap-0.5 rounded-lg bg-slate-100 p-0.5';
    const item = (active: boolean, activeClass = 'bg-white text-slate-900 shadow-sm') =>
      `flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-all ${active ? activeClass : 'text-slate-500 hover:text-slate-700'}`;
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className={bar}>
          <button type="button" onClick={() => onFormatChange('standard')} className={item(format === 'standard')}>
            <Tag size={12} /> Χονδρική
          </button>
          <button type="button" onClick={() => onFormatChange('retail')} className={item(format === 'retail', 'bg-white text-emerald-700 shadow-sm')}>
            <ShoppingBag size={12} /> Λιανική
          </button>
        </div>
        <div className={bar}>
          <button type="button" onClick={() => onShowPriceChange(true)} className={item(showPrice)}>
            Με τιμή
          </button>
          <button type="button" onClick={() => onShowPriceChange(false)} className={item(!showPrice)}>
            Χωρίς
          </button>
        </div>
        <div className={`${bar} ${showPrice ? '' : 'pointer-events-none opacity-40'}`}>
          <button type="button" onClick={() => onPriceTierChange('wholesale')} className={item(priceTier === 'wholesale')}>
            <Tag size={12} /> Χονδρική
          </button>
          <button type="button" onClick={() => onPriceTierChange('retail')} className={item(priceTier === 'retail', 'bg-white text-emerald-700 shadow-sm')}>
            <ShoppingBag size={12} /> Λιανική ×3
          </button>
        </div>
      </div>
    );
  }

  if (layout === 'inline') {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className={fieldLabel}>Μορφή ετικέτας</label>
          {formatToggle}
        </div>
        <div className="min-w-[140px] flex-1">{showPriceToggle}</div>
        <div className="min-w-[200px] flex-1">{priceTierToggle}</div>
      </div>
    );
  }

  return (
    <div>
      {formatToggle}
      <div className="mt-4 space-y-3">
        {showPriceToggle}
        {priceTierToggle}
      </div>
    </div>
  );
};

export default LabelPrintSettingsPanel;
