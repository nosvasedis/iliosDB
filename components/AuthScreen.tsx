
import React, { useState } from 'react';
import { supabase, clearConfiguration } from '../lib/supabase';
import { APP_LOGO, APP_ICON_ONLY } from '../constants';
import { Loader2, Mail, Lock, User, ArrowRight, ShieldCheck, AlertCircle, Settings } from 'lucide-react';
import { useUI } from './UIProvider';
import { useIsMobile } from '../hooks/useIsMobile';
import MobileAuthScreen from './mobile/MobileAuthScreen';

export default function AuthScreen() {
  const isMobile = useIsMobile();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const { showToast, confirm } = useUI();

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  if (isMobile) {
      return <MobileAuthScreen />;
  }

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
        // AuthProvider will pick up the session change automatically
      } else {
        // Sign Up
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
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
          title: 'Επαναφορά Ρυθμίσεων',
          message: 'Θέλετε να διαγράψετε τα αποθηκευμένα API Keys και να επιστρέψετε στην αρχική ρύθμιση;',
          isDestructive: true,
          confirmText: 'Επαναφορά'
      });
      if (yes) {
          clearConfiguration();
      }
  };

  return (
    <div className="min-h-screen bg-[#060b00] flex items-center justify-center p-4 relative overflow-hidden">
       {/* Background Effects */}
       <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-amber-500/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px]"></div>
       </div>

       <div className="bg-white/95 backdrop-blur-md w-full max-w-md rounded-3xl shadow-2xl p-8 z-10 border border-white/20 relative">
          
          {/* Config Reset Button (Top Right) */}
          <button 
            onClick={handleResetConfig}
            className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors p-2"
            title="Reset Configuration"
          >
              <Settings size={18} />
          </button>

          <div className="flex flex-col items-center mb-8">
             <div className="w-20 h-20 bg-[#060b00] rounded-2xl flex items-center justify-center shadow-lg mb-4 relative overflow-hidden border border-slate-700">
                 {!logoError ? (
                    <img 
                        src={APP_ICON_ONLY} 
                        alt="Logo" 
                        className="w-12 h-12 object-contain relative z-10" 
                        onError={() => setLogoError(true)}
                    />
                 ) : (
                    <span className="text-amber-500 font-black text-3xl tracking-tighter">IL</span>
                 )}
             </div>
             <h1 className="text-2xl font-black text-slate-900 tracking-tight">Ilios Kosmima ERP</h1>
             <p className="text-slate-500 text-sm mt-1 font-medium">Σύστημα Διαχείρισης Παραγωγής</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
             {!isLogin && (
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Ονοματεπωνυμο</label>
                   <div className="relative">
                       <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                       <input 
                         type="text" 
                         required={!isLogin}
                         value={fullName}
                         onChange={e => setFullName(e.target.value)}
                         className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-800 font-medium"
                         placeholder="π.χ. Γιάννης Παπαδόπουλος"
                       />
                   </div>
                </div>
             )}

             <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-800 font-medium"
                      placeholder="name@ilios.gr"
                    />
                </div>
             </div>

             <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Κωδικος</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input 
                      type="password" 
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-800 font-medium"
                      placeholder="••••••••"
                    />
                </div>
             </div>

             <button 
               type="submit" 
               disabled={isLoading}
               className="w-full bg-[#060b00] text-white py-3.5 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 mt-6 flex items-center justify-center gap-2"
             >
                {isLoading ? <Loader2 className="animate-spin"/> : (isLogin ? 'Είσοδος' : 'Εγγραφή')}
                {!isLoading && <ArrowRight size={18}/>}
             </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
             <button onClick={() => setIsLogin(!isLogin)} className="text-sm font-bold text-slate-500 hover:text-amber-600 transition-colors">
                 {isLogin ? 'Δεν έχετε λογαριασμό; Εγγραφή' : 'Έχετε ήδη λογαριασμό; Είσοδος'}
             </button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck size={14} className="text-emerald-500"/>
              <span>Ασφαλής Σύνδεση • Ιδιωτική Πρόσβαση</span>
          </div>
       </div>
    </div>
  );
}

export function PendingApprovalScreen({ onLogout }: { onLogout: () => void }) {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl text-center border border-slate-100">
                <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertCircle size={40} className="text-amber-500" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Αναμονή Έγκρισης</h2>
                <p className="text-slate-500 mb-8 leading-relaxed">
                    Ο λογαριασμός σας δημιουργήθηκε επιτυχώς, αλλά απαιτείται έγκριση από τον διαχειριστή για να αποκτήσετε πρόσβαση στα δεδομένα.
                </p>
                <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 font-mono mb-8 border border-slate-100">
                    Status: <span className="text-amber-600 font-bold">PENDING_APPROVAL</span>
                </div>
                <button onClick={onLogout} className="text-slate-400 font-bold hover:text-slate-600 transition-colors text-sm">
                    Αποσύνδεση
                </button>
            </div>
        </div>
    );
}
