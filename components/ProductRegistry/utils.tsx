import React from 'react';
import { Gem, Activity, Puzzle, Palette, Scroll, Box } from 'lucide-react';

export const getMaterialIcon = (type?: string) => {
    switch (type) {
        case 'Stone': return <Gem size={16} className="text-emerald-500" />;
        case 'Cord': return <Activity size={16} className="text-amber-600" />;
        case 'Component': return <Puzzle size={16} className="text-blue-500" />;
        case 'Enamel': return <Palette size={16} className="text-rose-500" />;
        case 'Leather': return <Scroll size={16} className="text-amber-700" />;
        default: return <Box size={16} className="text-slate-400" />;
    }
};

interface SummaryRowProps {
    label: string;
    value: number;
    sub?: string;
    color: string;
}

export const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, sub, color }) => (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${color}`}></div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-right">
            <div className="font-mono font-bold text-slate-800 text-sm">{value.toFixed(2)}€</div>
            {sub && <div className="text-[10px] text-slate-400 font-medium">{sub}</div>}
        </div>
    </div>
);
