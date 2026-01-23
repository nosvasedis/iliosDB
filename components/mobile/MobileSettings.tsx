
import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase, GEMINI_API_KEY, AUTH_KEY_SECRET, CLOUDFLARE_WORKER_URL } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { LogOut, Coins, ShieldCheck, User, Wifi, WifiOff, Upload, Save, Tag, ShoppingBag, Key, RefreshCw, FileText, Download, Loader2, Database } from 'lucide-react';
import { formatDecimal } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import { downloadFile, flattenForCSV, convertToCSV } from '../../utils/exportUtils';

export default function MobileSettings() {
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { signOut, profile } = useAuth();
    const { showToast, confirm } = useUI();
    const queryClient = useQueryClient();
    const isOnline = navigator.onLine;
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Local state for edits
    const [localSettings, setLocalSettings] = useState<any>(null);
    const [geminiKey, setGeminiKey] = useState(GEMINI_API_KEY);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingPrice, setIsLoadingPrice] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Initialize local state when data loads
    React.useEffect(() => {
        if (settings) setLocalSettings(settings);
    }, [settings]);

    const handleLogout = () => {
        localStorage.removeItem('ILIOS_LOCAL_MODE');
        signOut();
    };

    const handleLocalUpdate = (field: string, value: any) => {
        setLocalSettings((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSaveAll = async () => {
        if (!localSettings) return;
        setIsSaving(true);
        try {
            await supabase.from('global_settings').update({ 
                silver_price_gram: localSettings.silver_price_gram,
                barcode_width_mm: localSettings.barcode_width_mm,
                barcode_height_mm: localSettings.barcode_height_mm,
                retail_barcode_width_mm: localSettings.retail_barcode_width_mm,
                retail_barcode_height_mm: localSettings.retail_barcode_height_mm
            }).eq('id', 1);
            
            if (geminiKey !== GEMINI_API_KEY) {
                localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
                setTimeout(() => window.location.reload(), 1000);
            } else {
                queryClient.invalidateQueries({ queryKey: ['settings'] });
                showToast("Οι ρυθμίσεις αποθηκεύτηκαν.", "success");
            }
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const fetchLivePrice = async () => {
        setIsLoadingPrice(true);
        try {
            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/price/silver`, {
                method: 'GET',
                headers: { 'Authorization': AUTH_KEY_SECRET }
            });
            if (!response.ok) throw new Error('Failed to fetch price');
            const data = await response.json();
            const finalPrice = parseFloat(data.price.toFixed(3));
            handleLocalUpdate('silver_price_gram', finalPrice);
            showToast(`Τιμή: ${formatDecimal(finalPrice, 3)} €/g`, 'success');
        } catch (error: any) {
            showToast(`Σφάλμα: ${error.message}`, 'error');
        } finally {
            setIsLoadingPrice(false);
        }
    };

    const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const confirmed = await confirm({ title: 'Επαναφορά', message: 'Αυτό θα αντικαταστήσει ΟΛΑ τα δεδομένα. Συνέχεια;', isDestructive: true, confirmText: 'Επαναφορά' });
        if (!confirmed) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                await api.restoreFullSystem(data);
                showToast("Επιτυχής επαναφορά! Ανανέωση...", "success");
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                showToast("Μη έγκυρο αρχείο.", "error");
            }
        };
        reader.readAsText(file);
    };

    const handleJsonBackup = async () => {
        setIsExporting(true);
        try {
            const data = await api.getFullSystemExport();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadFile(JSON.stringify(data, null, 2), `ilios_erp_mobile_backup_${timestamp}.json`, 'application/json');
            showToast("Backup λήφθηκε.", "success");
        } catch (err) {
            showToast("Σφάλμα backup.", "error");
        } finally {
            setIsExporting(false);
        }
    };

    const handleCsvExport = async () => {
        setIsExporting(true);
        try {
            const data = await api.getFullSystemExport();
            const timestamp = new Date().toISOString().split('T')[0];
            
            const tablesToExport = [
                { key: 'products', name: 'Products' },
                { key: 'product_variants', name: 'Product_Variants' },
                { key: 'product_stock', name: 'Product_Stock' },
                { key: 'orders', name: 'Orders' },
                { key: 'production_batches', name: 'Production_Batches' },
                { key: 'offers', name: 'Offers' },
                { key: 'customers', name: 'Customers' },
                { key: 'suppliers', name: 'Suppliers' },
                { key: 'supplier_orders', name: 'Supplier_Orders' },
                { key: 'materials', name: 'Materials' },
                { key: 'molds', name: 'Molds' },
                { key: 'collections', name: 'Collections' },
                { key: 'stock_movements', name: 'Stock_Movements' }
            ];

            for (const table of tablesToExport) {
                const tableData = data[table.key] || [];
                if (tableData.length > 0) {
                    const flattened = flattenForCSV(tableData);
                    const csv = convertToCSV(flattened);
                    downloadFile(csv, `ilios_${table.name.toLowerCase()}_${timestamp}.csv`, 'text/csv');
                    await new Promise(r => setTimeout(r, 200));
                }
            }
            showToast("CSV λήφθηκαν.", "success");
        } catch (err) {
            showToast("Σφάλμα CSV.", "error");
        } finally {
            setIsExporting(false);
        }
    };

    if (!localSettings) return <div className="p-8 text-center text-slate-400">Φόρτωση...</div>;

    return (
        <div className="p-4 h-full bg-slate-50 overflow-y-auto pb-32">
            <h1 className="text-2xl font-black text-slate-900 mb-6">Ρυθμίσεις</h1>

            <div className="space-y-4">
                {/* Profile */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><User size={24}/></div>
                    <div><div className="font-bold text-slate-900">{profile?.full_name || 'Χρήστης'}</div><div className="text-xs text-slate-500">{profile?.email}</div></div>
                </div>

                {/* Silver Price */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 rounded-2xl text-white shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2"><Coins size={20} className="text-emerald-400"/><span className="font-bold text-sm">Τιμή Ασημιού (€/g)</span></div>
                        <button onClick={fetchLivePrice} disabled={isLoadingPrice} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">{isLoadingPrice ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}</button>
                    </div>
                    <input type="number" step="0.01" value={localSettings.silver_price_gram} onChange={(e) => handleLocalUpdate('silver_price_gram', parseFloat(e.target.value))} className="bg-white/10 border border-white/20 rounded-xl p-2 text-xl font-mono font-bold w-full outline-none focus:bg-white/20 transition-colors"/>
                </div>

                {/* API Key */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><Key size={14}/> Gemini API Key</label>
                    <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-mono"/>
                </div>

                {/* Label Settings */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><Tag size={14}/> Διαστάσεις (mm)</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block">Χονδρική (W x H)</label>
                            <div className="flex gap-2">
                                <input type="number" value={localSettings.barcode_width_mm} onChange={(e) => handleLocalUpdate('barcode_width_mm', parseInt(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-center outline-none"/>
                                <input type="number" value={localSettings.barcode_height_mm} onChange={(e) => handleLocalUpdate('barcode_height_mm', parseInt(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-center outline-none"/>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-emerald-600 uppercase block flex items-center gap-1"><ShoppingBag size={10}/> Λιανική</label>
                            <div className="flex gap-2">
                                <input type="number" value={localSettings.retail_barcode_width_mm} onChange={(e) => handleLocalUpdate('retail_barcode_width_mm', parseInt(e.target.value))} className="w-full p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-sm font-bold text-emerald-800 text-center outline-none"/>
                                <input type="number" value={localSettings.retail_barcode_height_mm} onChange={(e) => handleLocalUpdate('retail_barcode_height_mm', parseInt(e.target.value))} className="w-full p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-sm font-bold text-emerald-800 text-center outline-none"/>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Backup & System */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><Database size={14}/> Backup & Δεδομένα</h3>
                    <button onClick={handleJsonBackup} disabled={isExporting} className="w-full flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors">{isExporting ? <Loader2 size={18} className="animate-spin"/> : <Download size={18}/>} Full Backup (JSON)</button>
                    <button onClick={handleCsvExport} disabled={isExporting} className="w-full flex items-center gap-3 p-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-colors">{isExporting ? <Loader2 size={18} className="animate-spin"/> : <FileText size={18}/>} Export CSV (All Tables)</button>
                    
                    <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleRestore}/>
                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 p-3 bg-slate-50 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors border border-slate-200 mt-2"><Upload size={18}/> Επαναφορά από Backup</button>

                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-50 mt-2">
                        <span className="text-slate-500 flex items-center gap-2">{isOnline ? <Wifi size={16} className="text-emerald-500"/> : <WifiOff size={16} className="text-red-500"/>} Κατάσταση</span>
                        <span className={`font-bold ${isOnline ? 'text-emerald-600' : 'text-red-500'}`}>{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>

                <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors mt-4"><LogOut size={20}/> Αποσύνδεση</button>
                <div className="text-center text-[10px] text-slate-300 mt-4 flex items-center justify-center gap-1"><ShieldCheck size={12}/> Secure Connection • Ilios ERP</div>
            </div>

            {/* Sticky Save Button */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 z-50">
                <button onClick={handleSaveAll} disabled={isSaving} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50">
                    {isSaving ? <Loader2 size={20} className="animate-spin"/> : <Save size={20}/>} {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση Αλλαγών'}
                </button>
            </div>
        </div>
    );
}
