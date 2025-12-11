


import React, { useState } from 'react';
import { GlobalSettings } from '../types';
import { Save, TrendingUp, Loader2, Settings as SettingsIcon, Info, Shield, Key } from 'lucide-react';
import { supabase, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, GEMINI_API_KEY } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';
import { formatDecimal } from '../utils/pricingEngine';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const settingsData = queryClient.getQueryData<GlobalSettings>(['settings']);
  
  // Local state for editing, initialized from query cache
  const [settings, setSettings] = useState<GlobalSettings | null>(settingsData || null);
  
  // Local Config State (Client-side keys)
  const [localGeminiKey, setLocalGeminiKey] = useState(GEMINI_API_KEY);
  
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  if (!settings) {
    return <div className="p-8 text-center text-slate-400">Φόρτωση ρυθμίσεων...</div>;
  }

  // FETCH LIVE PRICE AND SAVE TO DB
  const fetchLivePrice = async () => {
    setIsLoadingPrice(true);
    try {
      // Fetch Real-time price via our Secure Worker Proxy to bypass CORS and hide API keys if any
      const response = await fetch(`${CLOUDFLARE_WORKER_URL}/price/silver`, {
          method: 'GET',
          headers: {
              'Authorization': AUTH_KEY_SECRET
          }
      });
      
      if (!response.ok) throw new Error('Failed to fetch price from worker');
      
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      if (!data.price) throw new Error('Invalid price data received');
      
      const finalPrice = parseFloat(data.price.toFixed(3));
        
      const newSettings = { ...settings, silver_price_gram: finalPrice };
      
      // Persist
      const { error } = await supabase
        .from('global_settings')
        .update({ silver_price_gram: finalPrice })
        .eq('id', 1);

      if (error) throw error;
      
      // Update local and query cache
      setSettings(newSettings);
      queryClient.setQueryData(['settings'], newSettings);

      showToast(`Η τιμή ενημερώθηκε: ${formatDecimal(finalPrice, 3)} €/g (Real-time Market)`, 'success');
      
    } catch (error: any) {
      console.error(error);
      showToast(`Σφάλμα: ${error.message}`, 'error');
    } finally {
      setIsLoadingPrice(false);
    }
  };
  
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
        // 1. Save Global Settings to DB
        const { error } = await supabase
          .from('global_settings')
          .update({ 
              silver_price_gram: settings.silver_price_gram, 
              loss_percentage: settings.loss_percentage,
              barcode_width_mm: settings.barcode_width_mm,
              barcode_height_mm: settings.barcode_height_mm
            })
          .eq('id', 1);

        if (error) throw error;

        // 2. Save Local Keys to LocalStorage
        if (localGeminiKey !== GEMINI_API_KEY) {
            localStorage.setItem('VITE_GEMINI_API_KEY', localGeminiKey);
            // We need to reload to apply the new key to the module constant, 
            // or the user can just refresh. A reload is safer.
            setTimeout(() => window.location.reload(), 1000);
            showToast("Το Gemini Key ενημερώθηκε. Επανεκκίνηση...", 'info');
            return;
        }

        // Update query cache
        queryClient.setQueryData(['settings'], settings);

        showToast("Οι ρυθμίσεις αποθηκεύτηκαν.", 'success');
    } catch(err) {
        showToast("Σφάλμα κατά την αποθήκευση.", 'error');
        console.error(err);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              <div className="p-2 bg-slate-200 text-slate-700 rounded-xl">
                  <SettingsIcon size={24} />
              </div>
              Ρυθμίσεις Συστήματος
          </h1>
          <p className="text-slate-500 mt-2 ml-14">Παράμετροι τιμολόγησης και λειτουργίας.</p>
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
                    <button 
                      onClick={fetchLivePrice} 
                      disabled={isLoadingPrice}
                      title="Λήψη Live Τιμής"
                      className="px-4 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 border border-blue-200 transition-colors"
                    >
                        {isLoadingPrice ? <Loader2 className="animate-spin" size={20} /> : <TrendingUp size={20} />}
                    </button>
                </div>
                <div className="flex items-start gap-2 mt-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>Η τιμή ενημερώνεται σε πραγματικό χρόνο από το χρηματιστήριο μετάλλων μέσω του Ilios Worker.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                    Εκτύπωση Ετικετών
                </h2>
                <div className="space-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Πλάτος Ετικέτας (mm)</label>
                    <input 
                    type="number" step="1"
                    value={settings.barcode_width_mm}
                    onChange={(e) => setSettings({...settings, barcode_width_mm: parseInt(e.target.value)})}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-mono"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Ύψος Ετικέτας (mm)</label>
                    <input 
                    type="number" step="1"
                    value={settings.barcode_height_mm}
                    onChange={(e) => setSettings({...settings, barcode_height_mm: parseInt(e.target.value)})}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-mono"
                    />
                </div>
                </div>
            </div>

            {/* Client Configuration Section */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                    <Shield className="text-emerald-500" size={20}/>
                    Τοπική Ρύθμιση (Browser)
                </h2>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <Key size={14} className="text-slate-400"/> Gemini API Key
                    </label>
                    <input 
                        type="password" 
                        value={localGeminiKey}
                        onChange={(e) => setLocalGeminiKey(e.target.value)}
                        placeholder="Εισάγετε το κλειδί σας (AIzaSy...)"
                        className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none font-mono text-sm"
                    />
                    <p className="text-xs text-slate-400 mt-2 ml-1">
                        Το κλειδί αποθηκεύεται μόνο σε αυτόν τον περιηγητή (LocalStorage).
                    </p>
                </div>
            </div>
          </div>
      </div>
      
      <div className="flex justify-end pt-4 border-t border-slate-200">
        <button 
            onClick={handleSaveSettings} 
            disabled={isSaving}
            className="flex items-center gap-2 text-base bg-slate-900 text-white px-8 py-3 rounded-xl hover:bg-slate-800 font-bold disabled:opacity-50 shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5"
        >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} Αποθήκευση Ρυθμίσεων
        </button>
      </div>

    </div>
  );
}