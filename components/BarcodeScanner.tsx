import React, { useState, useMemo, useEffect } from 'react';
import { useZxing } from 'react-zxing';
import { X, Zap, Target, Scan, ShieldCheck } from 'lucide-react';

interface Props {
    onScan: (result: string) => void;
    onClose: () => void;
    continuous?: boolean;
}

export default function BarcodeScanner({ onScan, onClose, continuous = false }: Props) {
    const [lastScan, setLastScan] = useState<string>('');
    const [scanCount, setScanCount] = useState(0);
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    
    // Engine Hints: Locked to QR_CODE (Format 11) for maximum processing efficiency.
    // This ignores all 1D barcode math, making the frame-rate significantly higher.
    const hints = useMemo(() => {
        const map = new Map();
        map.set(1, true); // TRY_HARDER: Deep analysis for tiny/damaged modules
        map.set(2, [11]); // QR_CODE ONLY
        return map;
    }, []);

    const { ref, torch } = useZxing({
        onDecodeResult(result) {
            const text = result.getText();
            const now = Date.now();
            
            // Precision Debounce Logic
            // Prevents double-scans of the same item within 1 second.
            if (text !== lastScan || (now - scanCount > 1000)) {
                setLastScan(text);
                setScanCount(now);
                
                // 1. Tactile Response (45ms Vibration)
                if ('vibrate' in navigator) navigator.vibrate(45);
                
                // 2. Audible Response (High-Frequency Precision Beep)
                try {
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1400, audioCtx.currentTime); // Sharp, professional tone
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
        constraints: {
            video: {
                facingMode: 'environment',
                // Jewelry labels require high detail to resolve modules at distance.
                // Requesting 1080p+ for best sensor results.
                width: { min: 1280, ideal: 1920, max: 3840 },
                height: { min: 720, ideal: 1080, max: 2160 },
                aspectRatio: { ideal: 1.7777777778 },
                // @ts-ignore - Specific browser vendor hints for macro focus
                advanced: [
                    { focusMode: 'continuous' },
                    { zoom: 1.0 }
                ]
            }
        },
        // @ts-ignore
        options: { hints }
    });

    // Detect Flashlight/Torch availability
    useEffect(() => {
        const checkTorch = async () => {
            try {
                // @ts-ignore
                const stream = ref.current?.srcObject as MediaStream;
                if (stream) {
                    const track = stream.getVideoTracks()[0];
                    const caps = track.getCapabilities();
                    // @ts-ignore
                    setHasTorch(!!caps.torch);
                }
            } catch (e) {}
        };
        const timer = setTimeout(checkTorch, 1000);
        return () => clearTimeout(timer);
    }, [ref]);

    const toggleTorch = () => {
        try {
            if (torch.isOn()) {
                torch.off();
                setTorchOn(false);
            } else {
                torch.on();
                setTorchOn(true);
            }
        } catch (e) {
            console.warn("Torch control failure.");
        }
    };

    return (
        <div className="fixed inset-0 z-[250] bg-black flex flex-col animate-in fade-in duration-300 overflow-hidden font-sans select-none">
            {/* CYBER-PUNK GLASS HEADER */}
            <div className="p-6 flex justify-between items-center text-white bg-black/50 backdrop-blur-2xl border-b border-white/5 absolute top-0 left-0 right-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="bg-emerald-500/20 p-2.5 rounded-2xl border border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.25)]">
                        <Target className="text-emerald-400 animate-pulse" size={24} />
                    </div>
                    <div>
                        <span className="font-black text-xl block leading-none tracking-tight">Ilios Vision 2D</span>
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            <span className="text-[9px] text-white/40 uppercase font-black tracking-widest block">Neural Scan Active</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    {hasTorch && (
                        <button 
                            onClick={toggleTorch}
                            className={`p-3 rounded-2xl border transition-all duration-300 ${torchOn ? 'bg-amber-500 border-amber-400 text-white shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-white/10 border-white/10 text-white/60 hover:bg-white/20'}`}
                        >
                            <Zap size={22} className={torchOn ? 'fill-current' : ''} />
                        </button>
                    )}
                    <button 
                        onClick={onClose} 
                        className="p-3 bg-white/10 rounded-2xl hover:bg-red-500/20 hover:text-red-400 transition-all border border-white/10 group"
                    >
                        <X size={22} className="group-hover:rotate-90 transition-transform duration-300" />
                    </button>
                </div>
            </div>

            {/* HIGH-RES SENSOR VIEWPORT */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#050505]">
                <video ref={ref} className="w-full h-full object-cover scale-[1.05] brightness-110 contrast-110" />
                
                {/* HUD INTERFACE */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    
                    {/* Focus Area */}
                    <div className="w-72 h-72 relative">
                        {/* Precision Corners */}
                        <div className="absolute top-0 left-0 w-16 h-16 border-t-[4px] border-l-[4px] border-emerald-500 rounded-tl-[3rem] shadow-[-5px_-5px_20px_rgba(16,185,129,0.3)]"></div>
                        <div className="absolute top-0 right-0 w-16 h-16 border-t-[4px] border-r-[4px] border-emerald-500 rounded-tr-[3rem] shadow-[5px_-5px_20px_rgba(16,185,129,0.3)]"></div>
                        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-[4px] border-l-[4px] border-emerald-500 rounded-bl-[3rem] shadow-[-5px_5px_20px_rgba(16,185,129,0.3)]"></div>
                        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-[4px] border-r-[4px] border-emerald-500 rounded-br-[3rem] shadow-[5px_5px_20px_rgba(16,185,129,0.3)]"></div>
                        
                        {/* Micro-Targeting Center */}
                        <div className="absolute inset-20 border border-white/5 rounded-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-ping" />
                        </div>

                        {/* High-Velocity Scan Line */}
                        <div className="absolute inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_30px_rgba(52,211,153,0.9)] animate-[scan_2s_linear_infinite]" />
                    </div>
                    
                    <div className="mt-12 px-8 py-3 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
                        <span className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.5em] flex items-center gap-3">
                            <Scan size={14} className="animate-pulse" /> Align QR Module
                        </span>
                    </div>
                </div>

                {/* Ambient Depth Vignette */}
                <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.9)] pointer-events-none" />
            </div>

            {/* REAL-TIME FEEDBACK PANEL */}
            {lastScan && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[92%] max-w-md bg-white rounded-[2.5rem] p-5 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.6)] flex items-center gap-5 animate-in slide-in-from-bottom-24 duration-500 border border-emerald-100 ring-8 ring-black/30">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0">
                        <ShieldCheck className="text-white drop-shadow-md" size={32}/>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Product Decoded</div>
                        <div className="font-mono font-black text-3xl text-slate-900 tracking-tighter truncate uppercase">{lastScan}</div>
                    </div>
                    {continuous && (
                        <button 
                            onClick={() => setLastScan('')} 
                            className="p-3 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all"
                        >
                            <X size={24}/>
                        </button>
                    )}
                </div>
            )}
            
            {/* OPTICAL TIP */}
            <div className="p-10 text-center bg-gradient-to-t from-black to-transparent absolute bottom-0 left-0 right-0">
                <p className="text-white/20 text-[9px] font-bold uppercase tracking-[0.3em] max-w-xs mx-auto leading-relaxed">
                    Omni-directional logic enabled.<br/>Hold steady for 0.1s to confirm focus.
                </p>
            </div>

            <style>{`
                @keyframes scan {
                    0% { top: 5%; opacity: 0; }
                    15% { opacity: 1; }
                    85% { opacity: 1; }
                    100% { top: 95%; opacity: 0; }
                }
            `}</style>
        </div>
    );
}