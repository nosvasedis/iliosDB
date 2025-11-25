import React, { useState } from 'react';
import { GlobalSettings } from '../types';
import { Save, TrendingUp, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  settings: GlobalSettings;
  setSettings: React.Dispatch<React.SetStateAction<GlobalSettings>>;
}

export default function SettingsPage({ settings, setSettings }: Props) {
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
        setSettings(newSettings);
        
        // Persist
        const { error } = await supabase
          .from('global_settings')
          .upsert({ id: 1, silver_price_gram: finalPrice, loss_percentage: settings.loss_percentage });

        if (error) throw error;
        alert(`Η τιμή ενημερώθηκε και αποθηκεύτηκε: ${finalPrice} €/g`);
      }
    } catch (error) {
      console.error(error);
      alert("Σφάλμα κατά τη λήψη ή αποθήκευση της τιμής.");
    } finally {
      setIsLoadingPrice(false);
    }
  };
  
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
        const { error } = await supabase
          .from('global_settings')
          .upsert({ id: 1, silver_price_gram: settings.silver_price_gram, loss_percentage: settings.loss_percentage });

        if (error) throw error;
        alert("Οι ρυθμίσεις αποθηκεύτηκαν.");
    } catch(err) {
        alert("Σφάλμα κατά την αποθήκευση.");
        console.error(err);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">Ρυθμίσεις Συστήματος</h1>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-700">Γενικές Παράμετροι</h2>
            <button 
                onClick={handleSaveSettings} 
                disabled={isSaving}
                className="flex items-center gap-1 text-sm bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50"
            >
                {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Αποθήκευση
            </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Τιμή Ασημιού (€/g)</label>
            <div className="flex gap-2 relative">
                <input 
                  type="number" step="0.01"
                  value={settings.silver_price_gram}
                  onChange={(e) => setSettings({...settings, silver_price_gram: parseFloat(e.target.value)})}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none font-mono font-bold"
                />
                <button 
                  onClick={fetchLivePrice} 
                  disabled={isLoadingPrice}
                  title="Λήψη Live Τιμής"
                  className="p-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 border border-blue-200"
                >
                    {isLoadingPrice ? <Loader2 className="animate-spin" size={20} /> : <TrendingUp size={20} />}
                </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Πατήστε το κουμπί για Live ενημέρωση & αποθήκευση.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Ποσοστό Απώλειας (%)</label>
            <input 
              type="number" step="0.1"
              value={settings.loss_percentage}
              onChange={(e) => setSettings({...settings, loss_percentage: parseFloat(e.target.value)})}
              className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">Πρόσθετη επιβάρυνση βάρους λόγω χασίματος (φύρας).</p>
          </div>
        </div>
      </div>
    </div>
  );
}