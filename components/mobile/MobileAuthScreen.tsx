
import React, { useState } from 'react';
import { supabase, clearConfiguration } from '../../lib/supabase';
import { APP_ICON_ONLY } from '../../constants';
import { Loader2, Mail, Lock, User, ArrowRight, ShieldCheck, Settings } from 'lucide-react';
import { useUI } from '../UIProvider';

export default function MobileAuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast, confirm } = useUI();

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        showToast("Ο λογαριασμός δημιουργήθηκε! Αναμένετε έγκριση.", "success");
      }
    } catch (error: any) {
      showToast(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetConfig = async () => {
    const yes = await confirm({
        title: 'Επαναφορά',
        message: 'Επαναφορά ρυθμίσεων σύνδεσης;',
        isDestructive: true,
        confirmText: 'Ναι'
    });
    if (yes) {
        clearConfiguration();
    }
  };

  return (
    <div className="min-h-screen bg-[#060b00] flex flex-col justify-between p-6 relative">
       {/* Reset Config Button */}
       <button 
           onClick={handleResetConfig} 
           className="absolute top-6 right-6 text-white/30 hover:text-white transition-colors"
           title="Settings"
       >
           <Settings size={20} />
       </button>

       <div className="flex-1 flex flex-col justify-center">
          <div className="flex flex-col items-center mb-10">
             <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center shadow-2xl mb-6 border border-white/10 p-4">
                <img src={APP_ICON_ONLY} alt="Logo" className="w-full h-full object-contain drop-shadow-md" />
             </div>
             <h1 className="text-3xl font-black text-white tracking-tight text-center">Ilios ERP</h1>
             <p className="text-slate-400 text-sm mt-2 font-medium">Mobile Production Suite</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
             {!isLogin && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-1 focus-within:bg-white/10 focus-within:border-white/30 transition-all">
                   <div className="relative flex items-center">
                       <User className="text-slate-400 ml-4" size={20}/>
                       <input 
                         type="text" 
                         required={!isLogin}
                         value={fullName}
                         onChange={e => setFullName(e.target.value)}
                         className="w-full pl-4 p-4 bg-transparent outline-none text-white font-bold placeholder-slate-500"
                         placeholder="Ονοματεπώνυμο"
                       />
                   </div>
                </div>
             )}

             <div className="bg-white/5 border border-white/10 rounded-2xl p-1 focus-within:bg-white/10 focus-within:border-white/30 transition-all">
                <div className="relative flex items-center">
                    <Mail className="text-slate-400 ml-4" size={20}/>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-4 p-4 bg-transparent outline-none text-white font-bold placeholder-slate-500"
                      placeholder="Email"
                    />
                </div>
             </div>

             <div className="bg-white/5 border border-white/10 rounded-2xl p-1 focus-within:bg-white/10 focus-within:border-white/30 transition-all">
                <div className="relative flex items-center">
                    <Lock className="text-slate-400 ml-4" size={20}/>
                    <input 
                      type="password" 
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-4 p-4 bg-transparent outline-none text-white font-bold placeholder-slate-500"
                      placeholder="Κωδικός"
                    />
                </div>
             </div>

             <button 
               type="submit" 
               disabled={isLoading}
               className="w-full bg-white text-[#060b00] py-5 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all shadow-xl active:scale-95 mt-4 flex items-center justify-center gap-3"
             >
                {isLoading ? <Loader2 className="animate-spin"/> : (isLogin ? 'Είσοδος' : 'Δημιουργία')}
                {!isLoading && <ArrowRight size={20}/>}
             </button>
          </form>

          <div className="mt-8 text-center">
             <button onClick={() => setIsLogin(!isLogin)} className="text-sm font-bold text-slate-400 active:text-white transition-colors py-2 px-4">
                 {isLogin ? 'Νέος Χρήστης; Εγγραφή' : 'Έχω λογαριασμό. Είσοδος'}
             </button>
          </div>
       </div>

       <div className="mt-auto pt-6 flex items-center justify-center gap-2 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
          <ShieldCheck size={12}/> Secure Mobile Access
       </div>
    </div>
  );
}
