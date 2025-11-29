
import React, { useState } from 'react';
import { ShieldCheck, Server, Key, ArrowRight, Zap } from 'lucide-react';
import { saveConfiguration } from '../lib/supabase';
import { APP_LOGO, APP_ICON_ONLY } from '../constants';

export default function SetupScreen() {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [workerKey, setWorkerKey] = useState('2112Aris101!'); // Default worker key
    const [geminiKey, setGeminiKey] = useState('');

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if(url && key) {
            saveConfiguration(url, key, workerKey, geminiKey);
        }
    };

    return (
        <div className="min-h-screen bg-[#060b00] flex items-center justify-center p-4">
            <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl p-8 border border-white/10 relative overflow-hidden">
                <div className="flex flex-col items-center mb-8">
                     <div className="w-16 h-16 bg-[#060b00] rounded-2xl flex items-center justify-center shadow-lg mb-4 border border-slate-700">
                         <img src={APP_ICON_ONLY} alt="Logo" className="w-10 h-10 object-contain"/>
                     </div>
                     <h1 className="text-2xl font-black text-[#060b00]">Ρύθμιση Συστήματος</h1>
                     <p className="text-slate-500 text-sm mt-1">Απαιτείται ρύθμιση σύνδεσης</p>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6 text-sm text-emerald-800 leading-relaxed">
                    <strong>Ασφαλής Λειτουργία:</strong> Επειδή το περιβάλλον δεν υποστηρίζει αρχεία .env, παρακαλώ εισάγετε τα κλειδιά Supabase εδώ. Θα αποθηκευτούν <strong>τοπικά στον browser σας</strong> και όχι στον κώδικα.
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Supabase Project URL</label>
                        <div className="relative">
                            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                            <input 
                                type="text" 
                                required
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                placeholder="https://xyz.supabase.co"
                                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Supabase Anon Key</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                            <input 
                                type="password" 
                                required
                                value={key}
                                onChange={e => setKey(e.target.value)}
                                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..."
                                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1 flex justify-between">
                            <span>Κλειδί API Gemini</span>
                            <span className="text-xs text-amber-500 lowercase font-normal">(προαιρετικό για AI)</span>
                        </label>
                        <div className="relative">
                            <Zap className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" size={18}/>
                            <input 
                                type="password" 
                                value={geminiKey}
                                onChange={e => setGeminiKey(e.target.value)}
                                placeholder="AIzaSy..."
                                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono text-sm"
                            />
                        </div>
                    </div>

                    <button className="w-full bg-[#060b00] text-white py-3.5 rounded-xl font-bold hover:bg-black transition-all mt-4 flex items-center justify-center gap-2 shadow-lg">
                        Αποθήκευση & Εκκίνηση <ArrowRight size={18}/>
                    </button>
                </form>
                
                <div className="mt-6 flex justify-center gap-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    <ShieldCheck size={14} className="text-emerald-500"/> Κρυπτογράφηση Τοπικής Αποθήκευσης
                </div>
            </div>
        </div>
    );
}
