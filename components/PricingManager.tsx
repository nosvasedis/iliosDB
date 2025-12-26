
import React, { useState } from 'react';
import { Product, GlobalSettings, Material, PriceSnapshot, PriceSnapshotItem } from '../types';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, DollarSign, ArrowRight, TrendingUp, Percent, History, Save, ChevronRight, X, RotateCcw, Eye, Trash2, ArrowUpRight, ArrowDownRight, Anchor, Info, Zap, ShieldAlert, FileText } from 'lucide-react';
import { calculateProductCost, formatCurrency, formatDecimal, roundPrice } from '../utils/pricingEngine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';
import { getPriceRiskAnalysis } from '../lib/gemini';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  materials: Material[];
}

type Mode = 'cost' | 'selling' | 'history' | 'ai-risk';
type MarkupMode = 'adjust' | 'target';

interface ComparisonProduct extends Product {
    prev_draft_price: number;
}

interface SnapshotComparisonItem extends PriceSnapshotItem {
    currentPrice: number;
    diff: number;
}

const SmartReportRenderer = ({ text }: { text: string }) => {
    const parts = text.split(/\[TITLE\]|\[\/TITLE\]/).filter(p => p.trim());
    if (parts.length < 2) return <div className="p-8 bg-slate-50 rounded-[2rem] text-slate-700 whitespace-pre-wrap">{text}</div>;
    const sections: { title: string; content: string[] }[] = [];
    for (let i = 0; i < parts.length; i += 2) {
        if (parts[i] && parts[i+1]) {
            sections.push({ title: parts[i].trim(), content: parts[i+1].trim().split('\n').filter(l => l.trim()) });
        }
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.map((sec, idx) => (
                <div key={idx} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                    <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-4 flex items-center gap-2 border-b pb-2"><ShieldAlert size={14} className="text-rose-500"/> {sec.title}</h4>
                    <ul className="space-y-3">
                        {sec.content.map((line, lidx) => (
                            <li key={lidx} className="flex gap-2 items-start text-sm text-slate-600"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-200 shrink-0" />{line.replace(/^- |^\* /g, '')}</li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

export default function PricingManager({ products, settings, materials }: Props) {
  const [mode, setMode] = useState<Mode>('cost');
  const [markupMode, setMarkupMode] = useState<MarkupMode>('adjust');
  const [markupPercent, setMarkupPercent] = useState<number>(0);
  const [isCalculated, setIsCalculated] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<ComparisonProduct[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<PriceSnapshot | null>(null);
  const [comparisonItems, setComparisonItems] = useState<SnapshotComparisonItem[]>([]);
  const [isLoadingSnapshotItems, setIsLoadingSnapshotItems] = useState(false);
  const [aiRiskReport, setAiRiskReport] = useState<string | null>(null);
  const [isAnalyzingRisk, setIsAnalyzingRisk] = useState(false);

  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();

  const { data: snapshots } = useQuery({ queryKey: ['price_snapshots'], queryFn: api.getPriceSnapshots, enabled: mode === 'history' });

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setIsCalculated(false);
    setPreviewProducts([]);
    setAiRiskReport(null);
  };

  const handleRunRiskAnalysis = async () => {
      setIsAnalyzingRisk(true);
      try {
          const report = await getPriceRiskAnalysis(products, settings.silver_price_gram);
          setAiRiskReport(report);
          showToast("Η ανάλυση κινδύνου ολοκληρώθηκε!", "success");
      } catch (err: any) {
          showToast(err.message, "error");
      } finally { setIsAnalyzingRisk(false); }
  };

  const handleRecalculate = () => {
    let updatedProducts: ComparisonProduct[] = [];
    if (mode === 'cost') {
        updatedProducts = products.map(p => {
            const newCost = calculateProductCost(p, settings, materials, products);
            const oldCost = calculateProductCost(p, settings, materials, products, 0, new Set(), settings.last_calc_silver_price);
            return { ...p, draft_price: newCost.total, prev_draft_price: oldCost.total };
        });
    } else {
        if (markupMode === 'adjust') {
            const multiplier = 1 + (markupPercent / 100);
            updatedProducts = products.map(p => ({ ...p, draft_price: parseFloat((p.selling_price * multiplier).toFixed(2)), prev_draft_price: p.selling_price }));
        } else {
            const marginDecimal = markupPercent / 100;
            updatedProducts = products.map(p => ({ ...p, draft_price: roundPrice(p.active_price / (1 - marginDecimal)), prev_draft_price: p.selling_price }));
        }
    }
    setPreviewProducts(updatedProducts);
    setIsCalculated(true);
  };

  const commitPrices = async () => {
    const yes = await confirm({
        title: mode === 'cost' ? 'Ενημέρωση Κόστους' : 'Ενημέρωση Τιμών Χονδρικής',
        message: mode === 'cost' ? `Θα ενημερωθεί η Τιμή Κόστους. Η τρέχουσα τιμή ασημιού (${settings.silver_price_gram}€/g) θα γίνει η νέα βάση.` : 'Θα αλλάξει η Τιμή Χονδρικής. Είστε σίγουροι;',
        confirmText: 'Ενημέρωση',
    });
    if (!yes) return;
    setIsCommitting(true);
    try {
        const promises = previewProducts.map(p => {
            const updates: any = mode === 'cost' ? { active_price: p.draft_price, draft_price: p.draft_price } : { selling_price: p.draft_price };
            return supabase.from('products').update(updates).eq('sku', p.sku);
        });
        await Promise.all(promises);
        if (mode === 'cost') {
            await supabase.from('global_settings').update({ last_calc_silver_price: settings.silver_price_gram }).eq('id', 1);
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
        }
        queryClient.invalidateQueries({ queryKey: ['products'] });
        setIsCalculated(false);
        showToast("Οι τιμές ενημερώθηκαν επιτυχώς!", 'success');
    } catch(err) { showToast("Σφάλμα κατά την ενημέρωση.", 'error'); } 
    finally { setIsCommitting(false); }
  };

  const viewSnapshotDetails = async (snap: PriceSnapshot) => {
    setIsLoadingSnapshotItems(true);
    setSelectedSnapshot(snap);
    try {
        const items = await api.getPriceSnapshotItems(snap.id);
        setComparisonItems(items.map(item => {
            const p = products.find(prod => prod.sku === item.product_sku);
            const currentPrice = item.variant_suffix ? (p?.variants?.find(v => v.suffix === item.variant_suffix)?.selling_price || 0) : (p?.selling_price || 0);
            return { ...item, currentPrice, diff: currentPrice - item.price };
        }));
    } catch (err) { showToast("Σφάλμα.", "error"); } finally { setIsLoadingSnapshotItems(false); }
  };

  const productsToList = (isCalculated ? previewProducts : products.map(p => ({ ...p, draft_price: mode === 'cost' ? p.active_price : p.selling_price, prev_draft_price: mode === 'cost' ? p.active_price : p.selling_price })))
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));

  return (
    <div className="space-y-8 max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><DollarSign size={24} /></div> Διαχείριση Τιμών
            </h1>
        </div>
        <div className="flex gap-2">
            <button onClick={() => switchMode('ai-risk')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all ${mode === 'ai-risk' ? 'bg-rose-600 text-white shadow-lg' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100'}`}>
                <Zap size={18} className={isAnalyzingRisk ? 'animate-spin' : ''}/> AI Risk Analysis
            </button>
            <button onClick={async () => { setIsSnapshotting(true); await api.createPriceSnapshot(`Backup - ${new Date().toLocaleDateString()}`); queryClient.invalidateQueries({ queryKey: ['price_snapshots'] }); setIsSnapshotting(false); showToast("Backup Completed", "success"); }} disabled={isSnapshotting} className="flex items-center gap-2 bg-white border-2 border-dashed border-slate-300 text-slate-600 px-5 py-3 rounded-2xl hover:border-blue-400 hover:text-blue-600 transition-all font-bold text-sm">
                {isSnapshotting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18}/>} Snapshot
            </button>
        </div>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex w-fit">
          {['cost', 'selling', 'history'].map((m) => (
              <button key={m} onClick={() => switchMode(m as any)} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mode === m ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {m === 'cost' && <RefreshCw size={16}/>} {m === 'selling' && <TrendingUp size={16}/>} {m === 'history' && <History size={16}/>}
                  {m === 'cost' ? 'Κόστος' : m === 'selling' ? 'Markup' : 'Snapshots'}
              </button>
          ))}
      </div>

      {mode === 'ai-risk' && (
          <div className="flex-1 space-y-6 animate-in zoom-in-95">
              <div className="bg-gradient-to-br from-rose-600 to-rose-900 p-10 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                  <div className="relative z-10">
                      <h2 className="text-3xl font-black mb-4 flex items-center gap-3"><Zap size={32} className="text-yellow-400 fill-current"/> Predictive Risk Analysis</h2>
                      <p className="text-rose-50 text-lg opacity-90 max-w-2xl mb-8">Το Ilios AI προσομοιώνει σενάρια απότομης ανόδου της τιμής του ασημιού και αναλύει ποια προϊόντα θα γίνουν ζημιογόνα αν δεν αναπροσαρμοστούν οι τιμές.</p>
                      <button onClick={handleRunRiskAnalysis} disabled={isAnalyzingRisk} className="bg-white text-rose-900 px-8 py-4 rounded-2xl font-black text-lg flex items-center gap-3 hover:bg-rose-50 transition-all shadow-xl">
                          {isAnalyzingRisk ? <Loader2 className="animate-spin" /> : <TrendingUp size={24}/>} {isAnalyzingRisk ? 'Πραγματοποίηση Προσομοίωσης...' : 'Έναρξη Προσομοίωσης'}
                      </button>
                  </div>
              </div>
              {aiRiskReport && (
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-3 mb-8 border-b pb-6"><FileText size={24} className="text-slate-400"/> <h3 className="text-xl font-black">Έκθεση Ανάλυσης Κινδύνου</h3></div>
                      <SmartReportRenderer text={aiRiskReport} />
                  </div>
              )}
          </div>
      )}

      {mode !== 'history' && mode !== 'ai-risk' && (
          <>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start justify-between gap-8 animate-in fade-in">
                <div className="w-full md:w-2/3">
                {mode === 'cost' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Anchor size={12}/> Ιστορικό Baseline</label>
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between"><span className="font-mono text-xl font-bold text-slate-500">{formatDecimal(settings.last_calc_silver_price, 3)} €/g</span></div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-emerald-600 mb-2 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={12}/> Τρέχουσα Τιμή</label>
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between"><span className="font-mono text-2xl font-black text-emerald-800">{formatDecimal(settings.silver_price_gram, 3)} €/g</span><span className="text-[10px] font-black text-emerald-600 bg-white px-2 py-1 rounded border border-slate-100 uppercase animate-pulse">Live</span></div>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-3 leading-relaxed">
                            <h4 className="font-black text-slate-800 uppercase text-[10px] flex items-center gap-2 mb-2"><Info size={14} className="text-blue-500"/> Forensic Pricing</h4>
                            <p>Σύγκριση επίδρασης μεταβολής τιμής ασημιού.</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div>
                            <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                                <button onClick={() => { setMarkupMode('adjust'); setMarkupPercent(0); }} className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-all ${markupMode === 'adjust' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Αναπροσαρμογή</button>
                                <button onClick={() => { setMarkupMode('target'); setMarkupPercent(60); }} className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-all ${markupMode === 'target' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Στόχος Περιθωρίου</button>
                            </div>
                            <div className="relative">
                                <input type="number" value={markupPercent} onChange={(e) => setMarkupPercent(parseFloat(e.target.value) || 0)} className="w-full p-4 border border-amber-200 rounded-2xl bg-white text-slate-900 font-mono text-2xl font-black focus:ring-4 outline-none" placeholder="0"/>
                                <Percent className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            </div>
                        </div>
                    </div>
                )}
                </div>
                <div className="flex-1 flex flex-col items-center justify-center border-l border-slate-100 pl-8">
                {!isCalculated ? (
                    <button onClick={handleRecalculate} className={`px-8 py-4 rounded-xl font-bold flex items-center gap-3 text-white shadow-lg transition-all hover:-translate-y-0.5 ${mode === 'cost' ? 'bg-slate-900 shadow-slate-200' : 'bg-amber-500 shadow-amber-200'}`}>
                        {mode === 'cost' ? <RefreshCw size={20} /> : <TrendingUp size={20} />} Υπολογισμός
                    </button>
                ) : (
                    <div className="flex gap-3">
                        <button onClick={() => { setIsCalculated(false); setPreviewProducts([]); }} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Ακύρωση</button>
                        <button onClick={commitPrices} disabled={isCommitting} className="px-8 py-3 rounded-xl font-bold flex items-center gap-2 bg-emerald-600 text-white shadow-lg">
                            {isCommitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />} Εφαρμογή
                        </button>
                    </div>
                )}
                </div>
            </div>
            <div className="flex-1 overflow-hidden bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 shadow-sm z-10">
                        <tr><th className="p-4 pl-8">SKU</th><th className="p-4 text-right">Παλιά</th><th className="p-4 w-10"></th><th className="p-4 text-right">Νέα</th><th className="p-4 text-right">Διαφορά</th><th className="p-4 pr-8 text-right">Margin</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {productsToList.filter(p => !p.is_component).map(p => {
                        const diff = p.draft_price - p.prev_draft_price;
                        const margin = mode === 'cost' ? (p.selling_price > 0 ? ((p.selling_price - p.draft_price) / p.selling_price * 100) : 0) : (p.draft_price > 0 ? ((p.draft_price - p.active_price) / p.draft_price * 100) : 0);
                        return (
                            <tr key={p.sku} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="p-4 pl-8 font-mono font-bold text-slate-700">{p.sku}</td>
                            <td className="p-4 text-right text-slate-500 font-mono">{formatCurrency(p.prev_draft_price)}</td>
                            <td className="p-4 text-center text-slate-300"><ArrowRight size={14}/></td>
                            <td className="p-4 text-right font-black font-mono text-slate-800">{formatCurrency(p.draft_price)}</td>
                            <td className={`p-4 text-right font-bold ${Math.abs(diff) > 0.001 ? (diff > 0 ? (mode === 'cost' ? 'text-rose-500' : 'text-emerald-500') : (mode === 'cost' ? 'text-emerald-500' : 'text-rose-500')) : 'text-slate-300'}`}>
                                {Math.abs(diff) > 0.001 ? <div className="flex items-center justify-end gap-1">{diff > 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}{formatDecimal(Math.abs(diff), 2)}€</div> : '-'}
                            </td>
                            <td className={`p-4 pr-8 text-right font-black ${margin < 30 ? 'text-rose-500' : 'text-emerald-600'}`}>{formatDecimal(margin, 1)}%</td>
                            </tr>
                        );
                        })}
                    </tbody>
                    </table>
                </div>
            </div>
          </>
      )}

      {mode === 'history' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
              <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {snapshots?.map(snap => (
                          <div key={snap.id} onClick={() => viewSnapshotDetails(snap)} className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedSnapshot?.id === snap.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100'}`}>
                              <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(snap.created_at).toLocaleDateString()}</span></div>
                              <p className="font-bold text-slate-800 text-sm mb-3">{snap.notes}</p>
                          </div>
                      ))}
                  </div>
              </div>
              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  {selectedSnapshot && (
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 shadow-sm">
                                <tr><th className="p-4 pl-8">Κωδικός</th><th className="p-4 text-right">Backup</th><th className="p-4 text-right">Τρέχουσα</th><th className="p-4 text-right pr-8">Διαφορά</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {comparisonItems.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-4 pl-8 font-mono text-slate-700 font-bold">{item.product_sku}{item.variant_suffix || ''}</td>
                                        <td className="p-4 text-right font-bold text-slate-500">{item.price.toFixed(2)}€</td>
                                        <td className="p-4 text-right font-black text-slate-800">{item.currentPrice.toFixed(2)}€</td>
                                        <td className={`p-4 text-right pr-8 font-bold ${Math.abs(item.diff) > 0.01 ? (item.diff > 0 ? 'text-emerald-600' : 'text-rose-500') : 'text-slate-300'}`}>{Math.abs(item.diff) > 0.01 ? Math.abs(item.diff).toFixed(2)+'€' : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}
