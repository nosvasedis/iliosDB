import React from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw as ResetIcon, Save, X } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import BarcodeView from '../BarcodeView';
import {
  buildLabelText,
  LabelPriceTier,
  LabelTextOverrides,
} from '../../features/printing/labelText';
import {
  LABEL_TEXT_OVERRIDE_FIELDS,
  LabelPrintFormat,
} from '../../features/printing/labelPrintSettings';

interface LabelPreviewEditModalProps {
  product: Product;
  variant?: ProductVariant;
  size?: string;
  format: LabelPrintFormat;
  showPrice: boolean;
  priceTier: LabelPriceTier;
  width: number;
  height: number;
  overrides: LabelTextOverrides;
  onChangeField: (field: keyof LabelTextOverrides, value: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const LabelPreviewEditModal: React.FC<LabelPreviewEditModalProps> = ({
  product,
  variant,
  size,
  format,
  showPrice,
  priceTier,
  width,
  height,
  overrides,
  onChangeField,
  onReset,
  onClose,
}) => {
  const labelText = buildLabelText({
    product,
    variant,
    format,
    size,
    showPrice,
    priceTier,
    overrides,
  });

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-slate-900">Προεπισκόπηση / Επεξεργασία ετικέτας</h3>
            <p className="mt-0.5 text-xs font-bold text-slate-400">
              Οι αλλαγές ισχύουν μόνο για αυτή την εκτύπωση. Το QR κρατά τον πραγματικό κωδικό {labelText.sourceSku}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-[260px] items-center justify-center bg-slate-100 p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-inner">
              <BarcodeView
                product={product}
                variant={variant}
                width={width}
                height={height}
                format={format}
                size={size}
                showPrice={showPrice}
                priceTier={priceTier}
                labelOverrides={overrides}
              />
            </div>
          </div>

          <div className="space-y-4 border-l border-slate-100 p-5">
            <div className="rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-800">
              Επεξεργάζεσαι την εμφάνιση της ετικέτας, όχι το προϊόν. Άφησε κενό ένα πεδίο για να μη φαίνεται.
            </div>

            {LABEL_TEXT_OVERRIDE_FIELDS.map(([field, label]) => (
              <label key={field} className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                <input
                  type="text"
                  value={labelText[field]}
                  onChange={(event) => onChangeField(field, event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none transition-all focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-500/10"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-100"
          >
            <ResetIcon size={16} />
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800"
          >
            <Save size={16} />
            Αποθήκευση για αυτή την εκτύπωση
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LabelPreviewEditModal;
