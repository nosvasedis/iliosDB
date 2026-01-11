
import React, { useState, useMemo } from 'react';
import { useZxing } from 'react-zxing';
import { X, Camera, Zap, Target } from 'lucide-react';

interface Props {
    onScan: (result: string) => void;
    onClose: () => void;
    continuous?: boolean;
}

export default function BarcodeScanner({ onScan, onClose, continuous = false }: Props) {
    const [lastScan, setLastScan] = useState<string>('');
    const [scanCount, setScanCount] = useState(0);
    
    // We explicitly define the hints for the ZXing engine to be "aggressive"
    // Hint 1: TRY_HARDER (deep analysis of low contrast images)
    // Hint 2: POSSIBLE_FORMATS [CODE_128] (removes overhead of other formats)
    const hints = useMemo(() => {
        const map = new Map();
        map.set(1, true); // TRY_HARDER = true
        map.set(2, [1]);  // POSSIBLE_FORMATS = [BarcodeFormat.CODE_128]
        return map;
    }, []);

    const { ref } = useZxing({
        onDecodeResult(result) {
            const text = result.getText();
            
            // Debounce to prevent multiple triggers for the same barcode
            const now = Date.now();
            if (text !== lastScan || (now - scanCount > 800)) {
                setLastScan(text);
                setScanCount(now);
                
                // Haptic Feedback
                if ('vibrate' in navigator) navigator.vibrate(40);
                
                // Professional Audio Feedback
                try {
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
                    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.1);
                } catch (e) {}
                
                onScan(text);
                if (!continuous) onClose();
            }
        },
        paused: false,
        // Aggressive video constraints for high-detail captures
        constraints: {
            video: {
                facingMode: 'environment',
                // Forcing high resolution ensures the sensor can see individual barcode lines
                width: { min: 1280, ideal: 1920 },
                height: { min: 720, ideal: 1080 },
                aspectRatio: { ideal: 1.7777777778 },
                // @ts-ignore
                advanced: [
                    { focusMode: 'continuous' },
                    { whiteBalanceMode: 'continuous' },
                    { exposureMode: 'continuous' }
                ]
            }
        },
        // Apply the optimized hints
        // @ts-ignore - react-zxing accepts hints in its options but types are sometimes strict
        options: {
            hints: hints
        }
    });

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
            {/* ENHANCED HEADER */}
            <div className="p-6 flex justify-between items-center text-white bg-gradient-to-b from-black/90 to-transparent absolute top-0 left-0 right-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                        <Target className="text-emerald-400 animate-pulse" size={24} />
                    </div>
                    <div>
                        <span className="font-black text-lg block leading-none tracking-tight">Ilios Ultra-Scan</span>
                        <span className="text-[9px] text-white/40 uppercase font-black tracking-widest mt-1.5 block">High-Frequency 1D Engine • v3.0</span>
                    </div>
                </div>
                <button 
                    onClick={onClose} 
                    className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all border border-white/5"
                >
                    <X size={24} />
                </button>
            </div>

            {/* VIEWPORT WITH PRECISION UI */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
                <video ref={ref} className="w-full h-full object-cover opacity-90 scale-[1.02]" />
                
                {/* SCANNING OVERLAY */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    {/* Narrow viewfinder optimized for long narrow labels */}
                    <div className="w-80 h-32 border-2 border-white/10 rounded-3xl relative overflow-hidden">
                        {/* The "Precision Laser" - moving scan line helps users stay aligned */}
                        <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                        
                        {/* Static focus line */}
                        <div className="absolute top-1/2 left-4 right-4 h-px bg-white/20"></div>

                        {/* Corner Brackets */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl"></div>
                    </div>
                    
                    <div className="mt-8 px-6 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 backdrop-blur-md">
                        <span className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                            Ευθυγραμμιστε το Barcode στο πλαισιο
                        </span>
                    </div>
                </div>
            </div>

            {/* QUICK FEEDBACK DRAWER */}
            {lastScan && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-white rounded-3xl p-5 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10 border border-emerald-100 ring-4 ring-emerald-500/10">
                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0">
                        <Zap className="text-white fill-current" size={24}/>
                    </div>
                    <div className="min-w-0">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Τελευταία Σάρωση</div>
                        <div className="font-mono font-black text-2xl text-slate-800 tracking-tighter truncate">{lastScan}</div>
                    </div>
                    {continuous && (
                        <button 
                            onClick={() => setLastScan('')} 
                            className="ml-auto p-2 text-slate-300 hover:text-slate-600"
                        >
                            <X size={20}/>
                        </button>
                    )}
                </div>
            )}
            
            {/* DISTANCE ADVICE */}
            <div className="p-10 text-center bg-gradient-to-t from-black/90 to-transparent absolute bottom-0 left-0 right-0">
                <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest max-w-xs mx-auto">
                    Αν ο εκτυπωτής βγάζει "κολλημένες" γραμμές, δοκιμάστε να απομακρύνετε ελαφρώς τη συσκευή.
                </p>
            </div>

            <style>{`
                @keyframes scan {
                    0%, 100% { top: 10%; opacity: 0.5; }
                    50% { top: 90%; opacity: 1; }
                }
            `}</style>
        </div>
    );
}
