
import React, { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { LogOut, Coins, ShieldCheck, User, Info, Wifi, WifiOff, Upload, Save } from 'lucide-react';
import { formatDecimal } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';

export default function MobileSettings() {
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { signOut, profile } = useAuth();
    const { showToast } = useUI();
    const queryClient = useQueryClient();
    const isOnline = navigator.onLine;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleLogout = () => {
        localStorage.removeItem('ILIOS_LOCAL_MODE');
        signOut();
    };

    const handleUpdatePrice = async (price: number) => {
        if (!settings) return;
        try {
            await supabase.from('global_settings').update({ silver_price_gram: price }).eq('id', 1);
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            showToast("Η τιμή ασημιού ενημερώθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
        }
    };

    const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
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

    return (
        <div className="p-4 h-full bg-slate-50">
            <h1 className="text-2xl font-black text-slate-900 mb-6">Ρυθμίσεις</h1>

            <div className="space-y-4">
                {/* Profile Card */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                        <User size={24}/>
                    </div>
                    <div>
                        <div className="font-bold text-slate-900">{profile?.full_name || 'Χρήστης'}</div>
                        <div className="text-xs text-slate-500">{profile?.email}</div>
                    </div>
                </div>

                {/* Silver Price Card */}
                {settings && (
                    <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 rounded-2xl text-white shadow-lg">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Coins size={20} className="text-emerald-400"/>
                                <span className="font-bold text-sm">Τιμή Ασημιού (€/g)</span>
                            </div>
                            <div className="text-[10px] bg-white/10 px-2 py-1 rounded">Live</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                step="0.01" 
                                defaultValue={settings.silver_price_gram}
                                onBlur={(e) => handleUpdatePrice(parseFloat(e.target.value))}
                                className="bg-white/10 border border-white/20 rounded-xl p-2 text-xl font-mono font-bold w-full outline-none focus:bg-white/20 transition-colors"
                            />
                        </div>
                    </div>
                )}

                {/* System Actions */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase">Σύστημα</h3>
                    
                    <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleRestore}/>
                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-100 transition-colors">
                        <Upload size={18}/> Επαναφορά από Backup
                    </button>

                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-50">
                        <span className="text-slate-500 flex items-center gap-2">
                            {isOnline ? <Wifi size={16} className="text-emerald-500"/> : <WifiOff size={16} className="text-red-500"/>} 
                            Κατάσταση
                        </span>
                        <span className={`font-bold ${isOnline ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>

                {/* Logout */}
                <button 
                    onClick={handleLogout}
                    className="w-full bg-red-50 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors mt-8"
                >
                    <LogOut size={20}/> Αποσύνδεση
                </button>
                
                <div className="text-center text-[10px] text-slate-300 mt-4 flex items-center justify-center gap-1">
                    <ShieldCheck size={12}/> Secure Connection • Ilios ERP
                </div>
            </div>
        </div>
    );
}
