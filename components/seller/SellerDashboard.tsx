import React from 'react';
import { useAuth } from '../AuthContext';
import { ShoppingCart, Plus, BookOpen, FolderKanban, Search, ChevronRight } from 'lucide-react';

interface Props {
    onNavigate: (page: string) => void;
    onCreateOrder: () => void;
}

const QuickAction = ({ icon, label, onClick, color, description }: { icon: React.ReactNode; label: string; onClick: () => void; color: string; description: string }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-6 rounded-3xl transition-all active:scale-95 border group overflow-hidden relative ${color}`}
    >
        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity scale-150 transform rotate-12">
            {icon}
        </div>
        <div className="p-4 bg-white/40 rounded-2xl mb-4 shadow-sm backdrop-blur-md relative z-10">
            {icon}
        </div>
        <h3 className="font-black text-slate-800 text-lg mb-1 relative z-10">{label}</h3>
        <p className="text-xs text-slate-500 font-medium text-center relative z-10">{description}</p>
    </button>
);

// Context-aware greeting
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Καλημέρα';
    if (hour < 18) return 'Καλησπέρα';
    return 'Καληνύχτα';
}

export default function SellerDashboard({ onNavigate, onCreateOrder }: Props) {
    const { profile } = useAuth();

    return (
        <div className="p-5 space-y-6 pb-28 landscape:pb-8 landscape:max-w-4xl landscape:mx-auto">

            {/* ── Quick Catalog Search ─────────────────────────────────────── */}
            <button
                onClick={() => onNavigate('catalog')}
                className="w-full flex items-center gap-3.5 bg-gradient-to-r from-violet-600 to-violet-500 text-white px-5 py-4 rounded-3xl shadow-lg active:scale-[0.97] transition-all"
            >
                <div className="p-2.5 bg-white/20 rounded-xl shrink-0">
                    <Search size={20} />
                </div>
                <div className="text-left flex-1 min-w-0">
                    <div className="font-black text-base leading-tight">Αναζήτηση στον Κατάλογο</div>
                    <div className="text-xs text-white/70 font-medium mt-0.5">Δειγματολόγιο &amp; Τιμές</div>
                </div>
                <ChevronRight size={20} className="text-white/60 shrink-0" />
            </button>

            {/* ── Hero Greeting ─────────────────────────────────────────────── */}
            <div className="relative rounded-3xl overflow-hidden shadow-lg"
                style={{ background: 'linear-gradient(135deg, #060b00 0%, #1a2400 60%, #2d3a00 100%)' }}>
                {/* Decorative circle */}
                <div className="absolute -right-8 -top-8 w-40 h-40 bg-amber-400/10 rounded-full" />
                <div className="absolute -right-4 top-4 w-24 h-24 bg-amber-400/10 rounded-full" />

                <div className="relative z-10 p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-amber-400 text-xs font-black uppercase tracking-widest mb-1">Πλασιέ</p>
                            <h1 className="text-2xl font-black text-white leading-tight">{getGreeting()},</h1>
                            <p className="text-white/60 font-medium text-sm mt-0.5">{profile?.full_name || 'Πλασιέ'}</p>
                        </div>
                    </div>

                    <button
                        onClick={onCreateOrder}
                        className="w-full mt-6 bg-amber-400 text-[#060b00] py-4 rounded-2xl text-base font-black flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(251,191,36,0.25)] active:scale-95 transition-all hover:bg-amber-300"
                    >
                        <Plus size={22} /> Νέα Παραγγελία
                    </button>
                </div>
            </div>

            {/* ── Quick Actions ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
                <QuickAction
                    icon={<FolderKanban size={32} className="text-blue-600" />}
                    label="Συλλογές"
                    description="Προβολή και συλλογές πελατών"
                    onClick={() => onNavigate('collections')}
                    color="bg-blue-50/50 border-blue-100/50 hover:bg-blue-50 hover:shadow-md"
                />
                <QuickAction
                    icon={<BookOpen size={32} className="text-violet-600" />}
                    label="Δειγματολόγιο"
                    description="Πλήρης κατάλογος διαθέσιμων κωδικών"
                    onClick={() => onNavigate('catalog')}
                    color="bg-violet-50/50 border-violet-100/50 hover:bg-violet-50 hover:shadow-md"
                />
                <QuickAction
                    icon={<ShoppingCart size={32} className="text-emerald-600" />}
                    label="Παραγγελίες"
                    description="Ιστορικό παραγγελιών πελατών"
                    onClick={() => onNavigate('orders')}
                    color="bg-emerald-50/50 border-emerald-100/50 hover:bg-emerald-50 hover:shadow-md"
                />
            </div>
        </div>
    );
}
