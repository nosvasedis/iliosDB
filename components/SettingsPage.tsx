import React, { useState } from 'react';
import { GlobalSettings } from '../types';
import { Save, TrendingUp, Loader2, Settings as SettingsIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const settingsData = queryClient.getQueryData<GlobalSettings>(['settings']);
  
  // Local state for editing, initialized from query cache
  const [settings, setSettings] = useState<GlobalSettings | null>(settingsData || null);
  
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  if (!settings) {
    return <div className="p-8 text-center text-slate-400">Loading settings...</div>;
  }

  // FETCH LIVE PRICE AND SAVE TO DB
  const fetchLivePrice = async () => {
    setIsLoadingPrice(true);
    try {
      // Fetch from External API
      const response = await fetch('https://data-asg.goldprice.org/dbXRates/EUR');
      if (!response.ok) throw new Error('Error');
      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        const silverPricePerOz = data.items[0].xagPrice;
        const silverPricePerGram = silverPricePerOz / 31.1034768;
        const finalPrice = parseFloat(silverPricePerGram.toFixed(3));
        
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

        showToast(`Η τιμή ενημερώθηκε: ${finalPrice} €/g`, 'success');
      }
    } catch (error) {
      console.error(error);
      showToast("Σφάλμα κατά τη λήψη τιμής.", 'error');
    } finally {
      setIsLoadingPrice(false);
    }
  };
  
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
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
    <div className="max-w-4xl mx-auto space-y-8">
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
                      className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-mono font-bold text-lg"
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
                <p className="text-xs text-slate-400 mt-2 ml-1">Πατήστε το κουμπί για Live ενημέρωση.</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Ποσοστό Απώλειας (%)</label>
                <input 
                  type="number" step="0.1"
                  value={settings.loss_percentage}
                  onChange={(e) => setSettings({...settings, loss_percentage: parseFloat(e.target.value)})}
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold"
                />
                <p className="text-xs text-slate-400 mt-2 ml-1">Πρόσθετη επιβάρυνση βάρους (φύρα).</p>
              </div>
            </div>
          </div>

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
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Ύψος Ετικέτας (mm)</label>
                <input 
                  type="number" step="1"
                  value={settings.barcode_height_mm}
                  onChange={(e) => setSettings({...settings, barcode_height_mm: parseInt(e.target.value)})}
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-mono"
                />
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