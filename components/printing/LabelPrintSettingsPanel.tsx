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
    const selectClass = 'rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-40';
    return (
      <div className="flex flex-1 flex-nowrap items-center gap-3 whitespace-nowrap">
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500" title="Διαστάσεις και διάταξη της ετικέτας">
          <Tag size={14} /> Μορφή
          <select aria-label="Μορφή ετικέτας" value={format} onChange={e => onFormatChange(e.target.value as LabelPrintFormat)} className={selectClass}>
            <option value="standard">Χονδρική</option>
            <option value="retail">Λιανική</option>
          </select>
        </label>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 border-l border-slate-200 pl-3 text-xs font-medium text-slate-600" title="Εμφάνιση τιμής στην εκτυπωμένη ετικέτα">
          <input type="checkbox" checked={showPrice} onChange={e => onShowPriceChange(e.target.checked)} className="h-4 w-4 rounded accent-sky-600" />
          Με τιμή
        </label>
        <select aria-label="Τιμή ετικέτας" title="Τιμή ετικέτας: χονδρική ή λιανική ×3" disabled={!showPrice} value={priceTier} onChange={e => onPriceTierChange(e.target.value as LabelPriceTier)} className={selectClass}>
          <option value="wholesale">Χονδρική</option>
          <option value="retail">Λιανική ×3</option>
        </select>
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
