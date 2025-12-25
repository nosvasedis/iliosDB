
import React, { useState, useRef } from 'react';
import { ShieldCheck, Server, Key, ArrowRight, Zap, Database, Upload, HardDrive, FileJson, Loader2 } from 'lucide-react';
import { saveConfiguration, api } from '../lib/supabase';
import { APP_LOGO, APP_ICON_ONLY } from '../constants';
import { useUI } from './UIProvider';

export default function SetupScreen() {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [workerKey, setWorkerKey] = useState('2112Aris101!'); 
    const [geminiKey, setGeminiKey] = useState('');
    const [isRestoring, setIsRestoring] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useUI();

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if(url && key) {
            saveConfiguration(url, key, workerKey, geminiKey);
        }
    };

    const handleRunLocally = () => {
        localStorage.setItem('ILIOS_LOCAL_MODE', 'true');
        window.location.reload();
    };

    const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const backupData = JSON.parse(event.target?.result as string);
                setIsRestoring(true);
                showToast("Φόρτωση τοπικών δεδομένων...", "info");
                
                // Restore to local IndexedDB
                await api.restoreFullSystem(backupData);
                
                showToast("Επιτυχής επαναφορά! Το ERP θα ξεκινήσει τοπικά.", "success");
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                showToast("Το αρχείο δεν είναι έγκυρο αντίγραφο Ilios ERP.", "error");
            } finally {
                setIsRestoring(false);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="min-h-screen bg-[#060b00] flex items-center justify-center p-4 py-12">
            <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl p-8 border border-white/10 relative overflow-hidden flex flex-col gap-8">
                <div className="flex flex-col items-center">
                     <div className="w-16 h-16 bg-[#060b00] rounded-2xl flex items-center justify-center shadow-lg mb-4 border border-slate-700">
                         <img src={APP_ICON_ONLY} alt="Logo" className="w-10 h-10 object-contain"/>
                     </div>
                     <h1 className="text-2xl font-black text-[#060b00]">Εκκίνηση Ilios ERP</h1>
                     <p className="text-slate-500 text-sm mt-1 text-center">Επιλέξτε τρόπο λειτουργίας για τη βάση δεδομένων σας.</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {/* Option 1: Supabase */}
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                        <div className="flex items-center gap-2 text-slate-800 font-bold mb-4 uppercase text-xs tracking-widest">
                            <Server size={16} className="text-emerald-500" /> Σύνδεση Cloud (Supabase)
                        </div>
                        <form onSubmit={handleSave} className="space-y-3">
                            <div className="relative">
                                <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    type="text" required value={url} onChange={e => setUrl(e.target.value)}
                                    placeholder="Supabase Project URL"
                                    className="w-full pl-10 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                                />
                            </div>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    type="password" required value={key} onChange={e => setKey(e.target.value)}
                                    placeholder="Supabase Anon Key"
                                    className="w-full pl-10 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                                />
                            </div>
                            <button className="w-full bg-[#060b00] text-white py-3 rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2 text-sm">
                                Σύνδεση & Έναρξη <ArrowRight size={16}/>
                            </button>
                        </form>
                    </div>

                    {/* Option 2: Local Standalone */}
                    <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex flex-col">
                        <div className="flex items-center gap-2 text-amber-800 font-bold mb-4 uppercase text-xs tracking-widest">
                            <HardDrive size={16} /> Τοπική Λειτουργία (Standalone)
                        </div>
                        <p className="text-xs text-amber-700 leading-relaxed mb-4">
                            Λειτουργία χωρίς cloud. Τα δεδομένα αποθηκεύονται <strong>μόνο</strong> στον browser σας. Ιδανικό για πλήρη ιδιωτικότητα ή δοκιμές.
                        </p>
                        
                        <div className="flex flex-col gap-2">
                            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleRestoreBackup}/>
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full bg-white border border-amber-200 text-amber-800 py-3 rounded-xl font-bold hover:bg-amber-100 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                {isRestoring ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16}/>}
                                Φόρτωση από Backup (JSON)
                            </button>
                            
                            <button 
                                onClick={handleRunLocally}
                                className="w-full text-amber-600 font-bold text-xs py-2 hover:underline transition-all"
                            >
                                Συνέχεια χωρίς δεδομένα (Κενή Βάση)
                            </button>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-center gap-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    <ShieldCheck size={14} className="text-emerald-500"/> Προστασία Δεδομένων • Ilios ERP v1.0
                </div>
            </div>
        </div>
    );
}