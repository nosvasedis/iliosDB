
import React, { useState, useRef } from 'react';
import { ShieldCheck, Server, Key, ArrowRight, HardDrive, Upload, Loader2 } from 'lucide-react';
import { saveConfiguration, api } from '../../lib/supabase';
import { APP_ICON_ONLY } from '../../constants';
import { useUI } from '../UIProvider';

export default function MobileSetupScreen() {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [isRestoring, setIsRestoring] = useState(false);
    const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
    const [logoError, setLogoError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useUI();

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if(url && key) {
            saveConfiguration(url, key, '2112Aris101!', '');
        }
    };

    const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const backupData = JSON.parse(event.target?.result as string);
                setIsRestoring(true);
                showToast("Φόρτωση...", "info");
                await api.restoreFullSystem(backupData);
                showToast("Επιτυχία!", "success");
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                showToast("Μη έγκυρο αρχείο.", "error");
            } finally {
                setIsRestoring(false);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col p-6">
            <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
                <div className="flex flex-col items-center mb-10">
                     <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-4 p-4 overflow-hidden">
                         {!logoError ? (
                             <img 
                                src={APP_ICON_ONLY} 
                                alt="Logo" 
                                className="w-full h-full object-contain"
                                onError={() => setLogoError(true)}
                             />
                         ) : (
                             <span className="text-amber-500 font-black text-3xl tracking-tighter">IL</span>
                         )}
                     </div>
                     <h1 className="text-2xl font-black text-slate-900">Ρύθμιση Ilios</h1>
                     <p className="text-slate-500 text-sm mt-1 font-medium">Επιλέξτε τρόπο λειτουργίας</p>
                </div>

                <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex mb-6">
                    <button onClick={() => setMode('cloud')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${mode === 'cloud' ? 'bg-[#060b00] text-white shadow-md' : 'text-slate-500'}`}>Cloud</button>
                    <button onClick={() => setMode('local')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${mode === 'local' ? 'bg-[#060b00] text-white shadow-md' : 'text-slate-500'}`}>Local</button>
                </div>

                {mode === 'cloud' ? (
                    <form onSubmit={handleSave} className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Project URL</label>
                                <div className="relative">
                                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type="text" required value={url} onChange={e => setUrl(e.target.value)}
                                        className="w-full pl-10 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm font-bold"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Anon Key</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type="password" required value={key} onChange={e => setKey(e.target.value)}
                                        className="w-full pl-10 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm font-bold"
                                    />
                                </div>
                            </div>
                        </div>
                        <button className="w-full bg-[#060b00] text-white py-4 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                            Σύνδεση <ArrowRight size={20}/>
                        </button>
                    </form>
                ) : (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-left-4">
                        <div className="text-center mb-2">
                            <HardDrive size={32} className="text-slate-300 mx-auto mb-2"/>
                            <p className="text-xs text-slate-500 font-medium">Λειτουργία χωρίς ίντερνετ. Τα δεδομένα αποθηκεύονται στη συσκευή.</p>
                        </div>
                        
                        <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleRestoreBackup}/>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full bg-slate-100 text-slate-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                            {isRestoring ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20}/>}
                            Φόρτωση Backup
                        </button>
                        
                        <button 
                            onClick={() => { localStorage.setItem('ILIOS_LOCAL_MODE', 'true'); window.location.reload(); }}
                            className="w-full border-2 border-slate-100 text-slate-400 py-3 rounded-2xl font-bold text-xs active:bg-slate-50"
                        >
                            Είσοδος χωρίς δεδομένα
                        </button>
                    </div>
                )}
            </div>
            
            <div className="mt-auto text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2 opacity-50">
                <ShieldCheck size={12}/> Mobile Secure
            </div>
        </div>
    );
}
