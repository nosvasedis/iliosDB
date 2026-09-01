import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Printer } from 'lucide-react';
import { GlobalSettings, Product, ProductVariant } from '../../types';
import BarcodeView from '../BarcodeView';
import SkuColorizedText from '../SkuColorizedText';
import LabelPrintSettingsPanel from '../printing/LabelPrintSettingsPanel';
import LabelPreviewEditModal from '../printing/LabelPreviewEditModal';
import { LabelTextOverrides, PrintLabelItem } from '../../features/printing';
import {
  buildRegistryBarcodePrintItems,
  hasLabelTextOverrides,
  LABEL_PRINT_STORAGE_KEYS,
  LabelPrintFormat,
  readLabelPrintSettings,
  registryBarcodeItemKey,
} from '../../features/printing/labelPrintSettings';
import { LabelPriceTier } from '../../features/printing/labelText';

interface BarcodeGalleryProps {
  product: Product;
  variants: ProductVariant[];
  onPrint: (items: PrintLabelItem[]) => void;
  settings: GlobalSettings;
}

const persistLabelSetting = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preview and tests can run without browser storage.
  }
};

const BarcodeGallery = React.memo(({ product, variants, onPrint, settings }: BarcodeGalleryProps) => {
  const initialSettings = useMemo(() => readLabelPrintSettings(), []);
  const [format, setFormat] = useState<LabelPrintFormat>(initialSettings.format);
  const [showPrice, setShowPrice] = useState(initialSettings.showPrice);
  const [priceTier, setPriceTier] = useState<LabelPriceTier>(initialSettings.priceTier);
  const [labelOverrideDrafts, setLabelOverrideDrafts] = useState<Record<string, LabelTextOverrides>>({});
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);

  useEffect(() => { persistLabelSetting(LABEL_PRINT_STORAGE_KEYS.format, format); }, [format]);
  useEffect(() => { persistLabelSetting(LABEL_PRINT_STORAGE_KEYS.showPrice, String(showPrice)); }, [showPrice]);
  useEffect(() => { persistLabelSetting(LABEL_PRINT_STORAGE_KEYS.priceTier, priceTier); }, [priceTier]);

  const previewWidth = format === 'retail'
    ? (settings.retail_barcode_width_mm || 72)
    : settings.barcode_width_mm;
  const previewHeight = format === 'retail'
    ? (settings.retail_barcode_height_mm || 10)
    : settings.barcode_height_mm;

  const items = variants.length > 0
    ? variants.map(variant => ({ variant, key: registryBarcodeItemKey(variant) }))
    : [{ variant: undefined as ProductVariant | undefined, key: registryBarcodeItemKey() }];

  const handlePrint = (variantKey?: string) => {
    onPrint(buildRegistryBarcodePrintItems({
      product,
      variants,
      format,
      showPrice,
      priceTier,
      labelOverrides: labelOverrideDrafts,
      variantKey,
    }));
  };

  const editingItem = editingLabelKey
    ? items.find(item => item.key === editingLabelKey)
    : undefined;
  const editingOverrides = editingLabelKey ? labelOverrideDrafts[editingLabelKey] || {} : {};

  const updateEditingLabelOverride = (field: keyof LabelTextOverrides, value: string) => {
    if (!editingLabelKey) return;
    setLabelOverrideDrafts(prev => ({
      ...prev,
      [editingLabelKey]: {
        ...(prev[editingLabelKey] || {}),
        [field]: value,
      },
    }));
  };

  const resetEditingLabelOverride = () => {
    if (!editingLabelKey) return;
    setLabelOverrideDrafts(prev => {
      const next = { ...prev };
      delete next[editingLabelKey];
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <LabelPrintSettingsPanel
            layout="inline"
            format={format}
            showPrice={showPrice}
            priceTier={priceTier}
            onFormatChange={setFormat}
            onShowPriceChange={setShowPrice}
            onPriceTierChange={setPriceTier}
          />
          <button
            type="button"
            onClick={() => handlePrint()}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md"
          >
            <Printer size={16} /> Εκτύπωση Όλων (1x)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ variant, key }) => {
          const edited = hasLabelTextOverrides(labelOverrideDrafts[key]);

          return (
            <div key={key} className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
              <div className="custom-scrollbar relative flex min-h-[140px] w-full items-center justify-center overflow-x-auto rounded-xl border border-slate-100 bg-white p-2 shadow-inner">
                <div className={`${format === 'retail' ? 'origin-center scale-125 p-4' : ''} transition-transform`}>
                  <BarcodeView
                    product={product}
                    variant={variant}
                    width={previewWidth}
                    height={previewHeight}
                    format={format}
                    showPrice={showPrice}
                    priceTier={priceTier}
                    labelOverrides={labelOverrideDrafts[key]}
                  />
                </div>
              </div>

              <div className="w-full text-center">
                <div className="text-lg font-bold">
                  <SkuColorizedText sku={product.sku} suffix={variant?.suffix || ''} gender={product.gender} />
                </div>
                <div className="text-xs text-slate-500">{variant ? variant.description : product.category}</div>
              </div>

              <div className="mt-auto flex w-full items-center gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingLabelKey(key)}
                  title="Προεπισκόπηση / επεξεργασία ετικέτας"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${edited ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700'}`}
                >
                  <Eye size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handlePrint(key)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98]"
                >
                  <Printer size={14} /> Εκτύπωση
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editingItem && (
        <LabelPreviewEditModal
          product={product}
          variant={editingItem.variant}
          format={format}
          showPrice={showPrice}
          priceTier={priceTier}
          width={previewWidth}
          height={previewHeight}
          overrides={editingOverrides}
          onChangeField={updateEditingLabelOverride}
          onReset={resetEditingLabelOverride}
          onClose={() => setEditingLabelKey(null)}
        />
      )}
    </div>
  );
});

BarcodeGallery.displayName = 'BarcodeGallery';

export default BarcodeGallery;
