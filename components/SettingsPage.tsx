
import React, { useState, useRef } from 'react';
import { GlobalSettings, Product } from '../types';
import { Save, TrendingUp, Loader2, Settings as SettingsIcon, Info, Shield, Key, Download, FileJson, FileText, Database, ShieldAlert, RefreshCw, Trash2, HardDrive, Upload, AlertCircle, Tag, ImageOff, CheckCircle, Activity } from 'lucide-react';
import { supabase, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, GEMINI_API_KEY, api } from '../lib/supabase';
import { offlineDb } from '../lib/offlineDb';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';
import { formatDecimal } from '../utils/pricingEngine';
import { convertToCSV, downloadFile, flattenForCSV } from '../utils/exportUtils';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const settingsData = queryClient.getQueryData<GlobalSettings>(['settings']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [settings, setSettings] = useState<GlobalSettings | null>(settingsData || null);
  const [localGeminiKey, setLocalGeminiKey] = useState(GEMINI_API_KEY);
  
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isMaintenanceAction, setIsMaintenanceAction] = useState(false);

  // Image Audit State
  const [isAuditingImages, setIsAuditingImages] = useState(false);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 0 });
  const [brokenImages, setBrokenImages] = useState<{ sku: string, url: string }[]>([]);
  
  if (!settings) {
    return <div className="p-8 text-center text-slate-400">Φόρτωση ρυθμίσεων...</div>;
  }

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
      const newSettings = { ...settings, silver_price_gram: finalPrice };
      await supabase.from('global_settings').update({ silver_price_gram: finalPrice }).eq('id', 1);
      setSettings(newSettings);
      queryClient.setQueryData(['settings'], newSettings);
      showToast(`Η τιμή ενημερώθηκε: ${formatDecimal(finalPrice, 3)} €/g`, 'success');
    } catch (error: any) {
      showToast(`Σφάλμα: ${error.message}`, 'error');
    } finally {
      setIsLoadingPrice(false);
    }
  };
  
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
        await supabase.from('global_settings').update({ 
            silver_price_gram: settings.silver_price_gram, 
            loss_percentage: settings.loss_percentage,
            barcode_width_mm: settings.barcode_width_mm,
            barcode_height_mm: settings.barcode_height_mm,
            retail_barcode_width_mm: settings.retail_barcode_width_mm,
            retail_barcode_height_mm: settings.retail_barcode_height_mm
        }).eq('id', 1);

        if (localGeminiKey !== GEMINI_API_KEY) {
            localStorage.setItem('VITE_GEMINI_API_KEY', localGeminiKey);
            setTimeout(() => window.location.reload(), 1000);
            return;
        }
        queryClient.setQueryData(['settings'], settings);
        showToast("Οι ρυθμίσεις αποθηκεύτηκαν.", 'success');
    } catch(err) {
        showToast("Σφάλμα κατά την αποθήκευση.", 'error');
    } finally {
        setIsSaving(false);
    }
  };

  const handleJsonBackup = async () => {
      setIsExporting(true);
      try {
          const data = await api.getFullSystemExport();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          downloadFile(JSON.stringify(data, null, 2), `ilios_erp_full_backup_${timestamp}.json`, 'application/json');
          showToast("Το πλήρες αντίγραφο JSON λήφθηκε.", "success");
      } catch (err) {
          showToast("Σφάλμα κατά την εξαγωγή.", "error");
      } finally {
          setIsExporting(false);
      }
  };

  const handleCsvExport = async () => {
      setIsExporting(true);
      try {
          const data = await api.getFullSystemExport();
          const timestamp = new Date().toISOString().split('T')[0];
          const tablesToExport = [{ key: 'products', name: 'Products' }, { key: 'orders', name: 'Orders' }, { key: 'customers', name: 'Customers' }, { key: 'materials', name: 'Materials' }, { key: 'suppliers', name: 'Suppliers' }];
          for (const table of tablesToExport) {
              const tableData = data[table.key] || [];
              if (tableData.length > 0) {
                  const flattened = flattenForCSV(tableData);
                  const csv = convertToCSV(flattened);
                  downloadFile(csv, `ilios_${table.name.toLowerCase()}_${timestamp}.csv`, 'text/csv');
                  await new Promise(r => setTimeout(r, 300));
              }
          }
          showToast("Τα αρχεία CSV λήφθηκαν. Έτοιμα για Excel/Access!", "success");
      } catch (err) {
          showToast("Σφάλμα κατά την εξαγωγή CSV.", "error");
      } finally {
          setIsExporting(false);
      }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const backupData = JSON.parse(event.target?.result as string);
              
              const confirmed = await confirm({
                  title: 'ΠΡΟΣΟΧΗ: ΠΛΗΡΗΣ ΕΠΑΝΑΦΟΡΑ',
                  message: 'Αυτή η ενέργεια θα ΔΙΑΓΡΑΨΕΙ ΟΛΑ τα τρέχοντα δεδομένα της βάσης και θα τα αντικαταστήσει με αυτά του αρχείου. Είστε σίγουροι ότι θέλετε να προχωρήσετε;',
                  isDestructive: true,
                  confirmText: 'ΝΑΙ, ΕΠΑΝΑΦΟΡΑ'
              });

              if (confirmed) {
                  setIsMaintenanceAction(true);
                  showToast("Γίνεται επαναφορά... Παρακαλώ μην κλείσετε τον browser.", "info");
                  await api.restoreFullSystem(backupData);
                  showToast("Η επαναφορά ολοκληρώθηκε! Το ERP θα ανανεωθεί.", "success");
                  setTimeout(() => window.location.reload(), 2000);
              }
          } catch (err) {
              showToast("Το αρχείο δεν είναι έγκυρο αντίγραφο Ilios ERP.", "error");
          } finally {
              setIsMaintenanceAction(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  const handleForceSync = async () => {
      setIsMaintenanceAction(true);
      try {
          const count = await api.syncOfflineData();
          if (count > 0) {
              showToast(`Συγχρονίστηκαν ${count} εκκρεμείς αλλαγές!`, "success");
              queryClient.invalidateQueries();
          } else {
              showToast("Δεν υπάρχουν εκκρεμείς αλλαγές προς συγχρονισμό.", "info");
          }
      } catch (err) {
          showToast("Σφάλμα συγχρονισμού.", "error");
      } finally {
          setIsMaintenanceAction(false);
      }
  };

  const handleWipeCache = async () => {
      const yes = await confirm({
          title: 'Εκκαθάριση Τοπικής Μνήμης',
          message: 'Αυτό θα διαγράψει ΟΛΑ τα τοπικά δεδομένα του browser (Cache & Sync Queue). Θα πρέπει να είστε online για να ξαναφορτώσετε το ERP. Είστε σίγουροι;',
          isDestructive: true,
          confirmText: 'Διαγραφή Cache'
      });
      if (yes) {
          setIsMaintenanceAction(true);
          try {
              await offlineDb.clearAll();
              showToast("Η τοπική μνήμη εκκαθαρίστηκε. Γίνεται ανανέωση...", "success");
              setTimeout(() => window.location.reload(), 1500);
          } catch (err) {
              showToast("Σφάλμα εκκαθάρισης.", "error");
              setIsMaintenanceAction(false);
          }
      }
  };

  const handleRunImageAudit = async () => {
      if (isAuditingImages) return;
      setIsAuditingImages(true);
      setBrokenImages([]);
      
      try {
          const products = await api.getProducts();
          const productsWithImages = products.filter(p => p.image_url);
          
          setAuditProgress({ current: 0, total: productsWithImages.length });
          
          const broken: { sku: string, url: string }[] = [];
          
          // Batch process to avoid browser lockup
          const BATCH_SIZE = 10;
          
          for (let i = 0; i < productsWithImages.length; i += BATCH_SIZE) {
              const batch = productsWithImages.slice(i, i + BATCH_SIZE);
              
              await Promise.all(batch.map(async (p) => {
                  if (!p.image_url) return;
                  try {
                      // HEAD request to check existence without downloading
                      // Note: We use the direct worker URL if possible to avoid some CORS issues on redirects
                      const response = await fetch(p.image_url, { method: 'HEAD', mode: 'cors' });
                      if (!response.ok) {
                          broken.push({ sku: p.sku, url: p.image_url });
                      }
                  } catch (e) {
                      // Network error usually means CORS blocked or DNS fail (broken link)
                      broken.push({ sku: p.sku, url: p.image_url });
                  }
              }));
              
              setAuditProgress(prev => ({ ...prev, current: Math.min(prev.current + BATCH_SIZE, productsWithImages.length) }));
              // Small delay to breathe
              await new Promise(r => setTimeout(r, 50));
          }
          
          setBrokenImages(broken);
          if (broken.length === 0) {
              showToast("Όλες οι εικόνες είναι εντάξει!", "success");
          } else {
              showToast(`Βρέθηκαν ${broken.length} προβληματικές εικόνες.`, "warning");
          }
          
      } catch (err) {
          showToast("Σφάλμα κατά τον έλεγχο.", "error");
      } finally {
          setIsAuditingImages(false);
      }
  };

  const handleFixBrokenImage = async (sku: string) => {
      // Remove image_url from DB for this SKU
      try {
          await api.saveProduct({ sku, image_url: null });
          setBrokenImages(prev => prev.filter(p => p.sku !== sku));
          showToast(`Ο σύνδεσμος αφαιρέθηκε για το ${sku}.`, "success");
      } catch (e) {
          showToast("Σφάλμα διόρθωσης.", "error");
      }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-center">
          <div>
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                  <div className="p-2 bg-slate-200 text-slate-700 rounded-xl">
                      <SettingsIcon size={24} />
                  </div>
                  Ρυθμίσεις Συστήματος
              </h1>
              <p className="text-slate-500 mt-2 ml-14">Παράμετροι τιμολόγησης και διαχείριση δεδομένων.</p>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                <TrendingUp className="text-amber-500" size={20}/>
                Οικονομικά Στοιχεία
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Τιμή Ασημιού (€/g)</label>
                <div className="flex gap-2 relative">
                    <input 
                      type="number" step="0.01"
                      value={settings.silver_price_gram}
                      onChange={(e) => setSettings({...settings, silver_price_gram: parseFloat(e.target.value)})}
                      className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-mono font-bold text-lg"
                    />
                    <button onClick={fetchLivePrice} disabled={isLoadingPrice} className="px-4 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 border border-blue-200 transition-colors">
                        {isLoadingPrice ? <Loader2 className="animate-spin" size={20} /> : <TrendingUp size={20} />}
                    </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                <Database className="text-blue-500" size={20}/>
                Αντίγραφα Ασφαλείας & Εξαγωγή
            </h2>
            <div className="space-y-4">
                <button onClick={handleJsonBackup} disabled={isExporting} className="w-full flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50 transition-all group">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:scale-110 transition-transform"><FileJson size={20}/></div>
                        <div className="text-left"><span className="block font-bold text-slate-700">Full System Backup</span><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">JSON Format • All Tables</span></div>
                    </div>
                    {isExporting ? <Loader2 size={18} className="animate-spin text-blue-500"/> : <Download size={18} className="text-slate-300 group-hover:text-blue-500"/>}
                </button>

                <button onClick={handleCsvExport} disabled={isExporting} className="w-full flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50 transition-all group">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg group-hover:scale-110 transition-transform"><FileText size={20}/></div>
                        <div className="text-left"><span className="block font-bold text-slate-700">Excel / Access Export</span><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CSV Bundle • Flattened Data</span></div>
                    </div>
                    {isExporting ? <Loader2 size={18} className="animate-spin text-emerald-500"/> : <Download size={18} className="text-slate-300 group-hover:text-emerald-500"/>}
                </button>
            </div>
          </div>
      </div>
      
      {/* DIAGNOSTICS & IMAGE AUDIT */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
              <Activity className="text-red-500" size={20}/>
              Διαγνωστικά Συστήματος
          </h2>

          <div className="space-y-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                      <div>
                          <h3 className="font-bold text-slate-700 text-sm">Έλεγχος Ακεραιότητας Εικόνων (Cloudflare R2)</h3>
                          <p className="text-xs text-slate-500">Ελέγχει αν οι φωτογραφίες των προϊόντων υπάρχουν πραγματικά στον server.</p>
                      </div>
                      <button 
                        onClick={handleRunImageAudit} 
                        disabled={isAuditingImages}
                        className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black transition-colors flex items-center gap-2 shadow-md"
                      >
                          {isAuditingImages ? <Loader2 size={14} className="animate-spin"/> : <ShieldAlert size={14}/>}
                          {isAuditingImages ? 'Έλεγχος...' : 'Εκκίνηση Ελέγχου'}
                      </button>
                  </div>
                  
                  {isAuditingImages && (
                      <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
                          <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${(auditProgress.current / auditProgress.total) * 100}%` }}></div>
                      </div>
                  )}

                  {brokenImages.length > 0 && (
                      <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
                          <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-3">
                              <ImageOff size={16}/> Βρέθηκαν {brokenImages.length} σπασμένοι σύνδεσμοι
                          </div>
                          <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                              {brokenImages.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-red-100 shadow-sm text-xs">
                                      <span className="font-mono font-bold text-slate-700">{item.sku}</span>
                                      <button 
                                        onClick={() => handleFixBrokenImage(item.sku)}
                                        className="text-red-500 hover:text-red-700 font-bold underline px-2"
                                      >
                                          Καθαρισμός
                                      </button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
                  
                  {!isAuditingImages && brokenImages.length === 0 && auditProgress.total > 0 && (
                      <div className="mt-4 flex items-center gap-2 text-emerald-600 font-bold text-sm bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                          <CheckCircle size={16}/> Ο έλεγχος ολοκληρώθηκε. Όλες οι εικόνες είναι εντάξει.
                      </div>
                  )}
              </div>
          </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                    <Tag className="text-purple-500" size={20}/>
                    Διαστάσεις Ετικετών (mm)
                </h2>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Χονδρική (Standard)</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Width</label>
                                <input type="number" value={settings.barcode_width_mm} onChange={(e) => setSettings({...settings, barcode_width_mm: parseInt(e.target.value)})} className="w-full p-2 border rounded-lg font-mono text-sm"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Height</label>
                                <input type="number" value={settings.barcode_height_mm} onChange={(e) => setSettings({...settings, barcode_height_mm: parseInt(e.target.value)})} className="w-full p-2 border rounded-lg font-mono text-sm"/>
                            </div>
                        </div>
                    </div>
                    <div className="col-span-2 border-t border-slate-100 pt-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Λιανική (Retail)</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Width</label>
                                <input type="number" value={settings.retail_barcode_width_mm || 40} onChange={(e) => setSettings({...settings, retail_barcode_width_mm: parseInt(e.target.value)})} className="w-full p-2 border rounded-lg font-mono text-sm"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Height</label>
                                <input type="number" value={settings.retail_barcode_height_mm || 20} onChange={(e) => setSettings({...settings, retail_barcode_height_mm: parseInt(e.target.value)})} className="w-full p-2 border rounded-lg font-mono text-sm"/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                    <Shield className="text-emerald-500" size={20}/>
                    Τοπική Ρύθμιση & Συντήρηση
                </h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <Key size={14} className="text-slate-400"/> Gemini API Key
                        </label>
                        <input type="password" value={localGeminiKey} onChange={(e) => setLocalGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 font-mono text-sm"/>
                    </div>
                    
                    <button onClick={handleForceSync} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-bold text-slate-700 text-sm mt-4">
                        <RefreshCw size={16} className={isMaintenanceAction ? 'animate-spin' : ''}/> Συγχρονισμός Εκκρεμοτήτων
                    </button>
                    
                    <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleRestoreBackup}/>
                    <button onClick={() => fileInputRef.current?.click()} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors font-bold text-blue-700 text-sm">
                        <Upload size={16}/> Επαναφορά από Backup
                    </button>

                    <button onClick={handleWipeCache} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors font-bold text-rose-600 text-sm">
                        <Trash2 size={16}/> Εκκαθάριση Cache (Hard Reset)
                    </button>
                </div>
            </div>
      </div>
      
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-4xl px-8 pointer-events-none">
        <div className="flex justify-end pointer-events-auto">
            <button onClick={handleSaveSettings} disabled={isSaving} className="flex items-center gap-2 text-base bg-slate-900 text-white px-10 py-4 rounded-2xl hover:bg-black font-bold disabled:opacity-50 shadow-2xl transition-all hover:-translate-y-1 active:scale-95">
                {isSaving ? <Loader2 className="animate-spin" size={22} /> : <Save size={22} />} 
                Αποθήκευση Όλων των Ρυθμίσεων
            </button>
        </div>
      </div>
    </div>
  );
}
