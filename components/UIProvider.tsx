import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

interface UIContextType {
  showToast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within UIProvider');
  return context;
};

export const UIProvider = ({ children }: { children?: ReactNode }) => {
  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Confirm Dialog State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    options: { message: '' },
    resolve: null,
  });

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        isOpen: true,
        options,
        resolve,
      });
    });
  }, []);

  const handleConfirm = (result: boolean) => {
    if (confirmState.resolve) {
      confirmState.resolve(result);
    }
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <UIContext.Provider value={{ showToast, confirm }}>
      {children}
      
      {/* Toast Container - Added print:hidden to prevent printing */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border border-white/20 backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-300 min-w-[300px]
              ${toast.type === 'success' ? 'bg-emerald-600 text-white' : ''}
              ${toast.type === 'error' ? 'bg-red-600 text-white' : ''}
              ${toast.type === 'warning' ? 'bg-amber-500 text-white' : ''}
              ${toast.type === 'info' ? 'bg-slate-800 text-white' : ''}
            `}
          >
            {toast.type === 'success' && <CheckCircle size={20} />}
            {toast.type === 'error' && <AlertOctagon size={20} />}
            {toast.type === 'warning' && <AlertTriangle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="ml-auto opacity-70 hover:opacity-100 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Custom Confirm Modal - Added print:hidden */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className={`flex items-center gap-3 mb-4 ${confirmState.options.isDestructive ? 'text-red-600' : 'text-slate-800'}`}>
              <div className={`p-3 rounded-full ${confirmState.options.isDestructive ? 'bg-red-100' : 'bg-slate-100'}`}>
                {confirmState.options.isDestructive ? <AlertTriangle size={24} /> : <Info size={24} />}
              </div>
              <h3 className="text-lg font-bold">{confirmState.options.title || 'Επιβεβαίωση'}</h3>
            </div>
            
            <p className="text-slate-600 mb-6 leading-relaxed">
              {confirmState.options.message}
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleConfirm(false)}
                className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors"
              >
                {confirmState.options.cancelText || 'Ακύρωση'}
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className={`
                  px-5 py-2.5 rounded-xl text-white font-medium shadow-lg transition-transform active:scale-95 flex items-center gap-2
                  ${confirmState.options.isDestructive 
                    ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-red-200 hover:from-red-600 hover:to-red-700' 
                    : 'bg-gradient-to-r from-slate-800 to-slate-900 shadow-slate-300 hover:from-slate-700 hover:to-slate-800'}
                `}
              >
                {confirmState.options.confirmText || 'Εντάξει'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
};