
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { LogOut, Coins, ShieldCheck, User, Info, Wifi, WifiOff } from 'lucide-react';
import { formatDecimal } from '../../utils/pricingEngine';

export default function MobileSettings() {
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { signOut, profile } = useAuth();
    const isOnline = navigator.onLine;

    const handleLogout = () => {
        localStorage.removeItem('ILIOS_LOCAL_MODE');
        signOut();
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
                    <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 rounded-2xl text-white shadow-lg flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/10 rounded-lg"><Coins size={20} className="text-emerald-400"/></div>
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase">Τιμη Ασημιου</div>
                                <div className="font-mono text-xl font-bold">{formatDecimal(settings.silver_price_gram, 3)} €/g</div>
                            </div>
                        </div>
                        <div className="text-[10px] bg-white/10 px-2 py-1 rounded">Live</div>
                    </div>
                )}

                {/* Status Card */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 flex items-center gap-2"><Info size={16}/> Έκδοση</span>
                        <span className="font-bold text-slate-800">v1.2 Mobile</span>
                    </div>
                    <div className="w-full h-px bg-slate-50"></div>
                    <div className="flex justify-between items-center text-sm">
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
