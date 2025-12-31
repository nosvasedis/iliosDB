
import React, { useState } from 'react';
import { useZxing } from 'react-zxing';
import { X, Camera, Zap } from 'lucide-react';

interface Props {
    onScan: (result: string) => void;
    onClose: () => void;
    continuous?: boolean;
}

export default function BarcodeScanner({ onScan, onClose, continuous = false }: Props) {
    const [lastScan, setLastScan] = useState<string>('');
    const [scanCount, setScanCount] = useState(0);
    
    const { ref } = useZxing({
        onDecodeResult(result) {
            const text = result.getText();
            // Faster recovery time (800ms) for high-speed scanning
            if (text !== lastScan || (Date.now() - scanCount > 800)) {
                setLastScan(text);
                setScanCount(Date.now());
                
                // Haptic & Audio Feedback
                if ('vibrate' in navigator) navigator.vibrate(40);
                
                try {
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const oscillator = audioCtx.createOscillator();
                    const gainNode = audioCtx.createGain();
                    oscillator.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                    oscillator.type = 'sine';
                    oscillator.frequency.value = 1200; // Slightly sharper pitch
                    gainNode.gain.value = 0.05;
                    oscillator.start();
                    setTimeout(() => oscillator.stop(), 60);
                } catch (e) {
                    console.debug("Audio feedback blocked by browser");
                }
                
                onScan(text);
                if (!continuous) onClose();
            }
        },
        // Optimized Constraints for Small Jewelry Labels
        constraints: {
            video: {
                facingMode: 'environment',
                // Request higher resolution for better bar distinction
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                aspectRatio: { ideal: 1.777 }
            }
        },
        options: {
            // Priority 11 = CODE_128 (Most common for us)
            // Priority 1 = TRY_HARDER (Essential for small/blurry tags)
            hints: new Map<number, any>([
                [2, [11, 1, 4]], // Formats: CODE_128, CODE_39, EAN_13
                [1, true]       // Enable Try Harder
            ])
        }
    });

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
            {/* HEADER */}
            <div className="p-6 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/20 p-2 rounded-full border border-emerald-500/30">
                        <Camera className="text-emerald-400 animate-pulse" size={24} />
                    </div>
                    <div>
                        <span className="font-bold text-lg block leading-none tracking-tight">Ilios Vision</span>
                        <span className="text-[10px] text-white/50 uppercase font-black tracking-widest mt-1 block">Συστημα Σαρωσης v2.1</span>
                    </div>
                </div>
                <button 
                    onClick={onClose} 
                    className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/5"
                >
                    <X size={24} />
                </button>
            </div>

            {/* VIEWPORT */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
                <video ref={ref} className="w-full h-full object-cover opacity-90" />
                
                {/* FOCUS UI */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-72 h-44 border border-white/20 rounded-[2.5rem] relative">
                        {/* Animated Laser Line */}
                        <div className="absolute top-1/2 left-6 right-6 h-0.5 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)] animate-pulse"></div>
                        
                        {/* Corner Accents */}
                        <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-emerald-500 -mt-1 -ml-1 rounded-tl-3xl"></div>
                        <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-emerald-500 -mt-1 -mr-1 rounded-tr-3xl"></div>
                        <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-emerald-500 -mb-1 -ml-1 rounded-bl-3xl"></div>
                        <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-emerald-500 -mb-1 -mr-1 rounded-br-3xl"></div>
                    </div>
                    
                    <div className="mt-10 bg-emerald-500/10 px-6 py-3 rounded-2xl text-emerald-400 text-xs font-black uppercase tracking-[0.2em] backdrop-blur-xl border border-emerald-500/20 shadow-2xl animate-bounce">
                        Στοχευστε το Barcode
                    </div>
                </div>
            </div>

            {/* STATUS BAR (FOR CONTINUOUS MODE) */}
            {lastScan && continuous && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-8 py-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-4 animate-in slide-in-from-bottom-10 border border-slate-100 min-w-[280px]">
                    <div className="bg-emerald-500 p-2 rounded-full shadow-lg shadow-emerald-200">
                        <Zap size={20} className="text-white fill-current"/>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Αναγνωριστηκε</div>
                        <div className="font-mono font-black text-2xl tracking-tighter">{lastScan}</div>
                    </div>
                    <button 
                        onClick={() => setLastScan('')} 
                        className="ml-auto p-2 text-slate-300 hover:text-slate-600 transition-colors"
                    >
                        <X size={20}/>
                    </button>
                </div>
            )}
            
            {/* BOTTOM HELP */}
            <div className="p-8 text-center bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 left-0 right-0">
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                    Κρατηστε τη συσκευη σταθερη για βελτιστη εστιαση
                </p>
            </div>
        </div>
    );
}
