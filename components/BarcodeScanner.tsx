import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useZxing } from 'react-zxing';
import { X, Zap, Target, Scan, ShieldCheck, ZoomIn, ZoomOut } from 'lucide-react';

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
    
    const [zoom, setZoom] = useState(1.0);
    const [zoomCapabilities, setZoomCapabilities] = useState<{min: number, max: number, step: number} | null>(null);
    
    // Engine Hints: 
    // 1 (TRY_HARDER): Crucial for SATO/TSC legacy prints (thermal spread/fading).
    // 2 (POSSIBLE_FORMATS): Locked to QR_CODE (11) for max speed.
    const hints = useMemo(() => {
        const map = new Map();
        map.set(1, true); 
        map.set(2, [11]); 
        return map;
    }, []);

    const { ref, torch } = useZxing({
        onDecodeResult(result) {
            const text = result.getText();
            const now = Date.now();
            
            // Precision Debounce Logic (1500ms for snappier consecutive scans if continuous)
            if (text && (text !== lastScan || (now - scanCount > 1500))) {
                setLastScan(text);
                setScanCount(now);
                
                // 1. Tactile Response (Sharp Double-Tap)
                if ('vibrate' in navigator) navigator.vibrate([30, 50, 30]);
                
                // 2. Audible Response (Professional 'Success' Tone)
                try {
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.type = 'sine';
                    // Swipe up frequency for "Success" feeling
                    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(1800, audioCtx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.2);
                } catch (e) {}
                
                onScan(text);
                if (!continuous) onClose();
            }
        },
        paused: false,
        timeBetweenDecodingAttempts: 100, // Aggressive polling for "Instant" feel
        constraints: {
            video: {
                facingMode: 'environment',
                // Jewelry labels require high detail to resolve modules at distance.
                // Ideal 1080p balances processing speed (FPS) and clarity.
                // 4K is too slow for JS decoding on most phones.
                width: { min: 1280, ideal: 1920, max: 2560 },
                height: { min: 720, ideal: 1080, max: 1440 },
                aspectRatio: { ideal: 1.777 }, 
                // Advanced constraints for focus
                // @ts-ignore
                advanced: [{ focusMode: 'continuous' }] 
            }
        },
        // @ts-ignore
        options: { hints }
    });

    // Device Capabilities Initialization (Torch & Zoom)
    useEffect(() => {
        const initCapabilities = async () => {
            try {
                // @ts-ignore
                const stream = ref.current?.srcObject as MediaStream;
                if (stream) {
                    const track = stream.getVideoTracks()[0];
                    const caps = track.getCapabilities() as any;
                    
                    if (caps.torch) setHasTorch(true);
                    
                    if (caps.zoom) {
                        setZoomCapabilities({
                            min: caps.zoom.min,
                            max: caps.zoom.max,
                            step: caps.zoom.step
                        });
                        // Default to slight zoom (1.2x) if available to help with distance scanning
                        // provided it doesn't degrade quality too much.
                        const startZoom = Math.min(caps.zoom.max, 1.2);
                        if (startZoom > caps.zoom.min) {
                            // @ts-ignore
                            track.applyConstraints({ advanced: [{ zoom: startZoom }] });
                            setZoom(startZoom);
                        }
                    }
                }
            } catch (e) {
                console.warn("Camera capabilities access error:", e);
            }
        };
        
        // Small delay to ensure stream is active
        const timer = setTimeout(initCapabilities, 800);
        return () => clearTimeout(timer);
    }, [ref]);

    const toggleTorch = () => {
        try {
            if (torchOn) {
                torch.off();
                setTorchOn(false);
            } else {
                torch.on();
                setTorchOn(true);
            }
        } catch (e) {
            console.warn("Torch failure.");
        }
    };

    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setZoom(val);
        try {
            // @ts-ignore
            const track = ref.current?.srcObject?.getVideoTracks()[0];
            if (track) {
                // @ts-ignore
                track.applyConstraints({ advanced: [{ zoom: val }] });
            }
        } catch (err) {
            console.warn("Zoom failure", err);
        }
    };

    return (
        <div className="fixed inset-0 z-[250] bg-black flex flex-col animate-in fade-in duration-300 overflow-hidden font-sans select-none touch-none">
            {/* GLASS HEADER */}
            <div className="p-6 flex justify-between items-center text-white bg-black/40 backdrop-blur-xl border-b border-white/5 absolute top-0 left-0 right-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="bg-emerald-500/20 p-2.5 rounded-2xl border border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.25)]">
                        <Target className="text-emerald-400 animate-pulse" size={24} />
                    </div>
                    <div>
                        <span className="font-black text-xl block leading-none tracking-tight">Ilios Vision</span>
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            <span className="text-[9px] text-white/60 uppercase font-black tracking-widest block">
                                {zoomCapabilities ? 'Optical Zoom Ready' : 'Scanning...'}
                            </span>
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

            {/* VIEWPORT */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#050505]">
                <video 
                    ref={ref} 
                    className="w-full h-full object-cover scale-[1.0] brightness-110 contrast-110" 
                    playsInline 
                    muted
                />
                
                {/* HUD LAYERS */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    
                    {/* Targeting Reticle - Sized for typical Jewelry Labels */}
                    <div className="w-64 h-64 relative transition-all duration-300 ease-out will-change-transform">
                        {/* Corners */}
                        <div className="absolute top-0 left-0 w-12 h-12 border-t-[4px] border-l-[4px] border-emerald-500 rounded-tl-3xl shadow-[-2px_-2px_15px_rgba(16,185,129,0.4)]"></div>
                        <div className="absolute top-0 right-0 w-12 h-12 border-t-[4px] border-r-[4px] border-emerald-500 rounded-tr-3xl shadow-[2px_-2px_15px_rgba(16,185,129,0.4)]"></div>
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[4px] border-l-[4px] border-emerald-500 rounded-bl-3xl shadow-[-2px_2px_15px_rgba(16,185,129,0.4)]"></div>
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[4px] border-r-[4px] border-emerald-500 rounded-br-3xl shadow-[2px_2px_15px_rgba(16,185,129,0.4)]"></div>
                        
                        {/* Central Crosshair */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-30">
                            <div className="w-8 h-0.5 bg-white"></div>
                            <div className="h-8 w-0.5 bg-white absolute"></div>
                        </div>

                        {/* Scanner Beam */}
                        <div className="absolute inset-x-4 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-[scan_1.5s_ease-in-out_infinite]" />
                    </div>
                    
                    {/* Tips */}
                    <div className="mt-16 px-6 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                        <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                            <Scan size={12} className="text-emerald-400" /> Auto-Focus Active
                        </span>
                    </div>
                </div>

                {/* Ambient Vignette */}
                <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)] pointer-events-none" />
            </div>

            {/* CONTROLS FOOTER */}
            <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 bg-gradient-to-t from-black via-black/80 to-transparent z-50 flex flex-col items-center">
                
                {/* ZOOM SLIDER */}
                {zoomCapabilities && (
                    <div className="w-full max-w-sm flex items-center gap-4 mb-4 animate-in slide-in-from-bottom-4 fade-in">
                        <ZoomOut size={18} className="text-white/50" />
                        <input 
                            type="range" 
                            min={zoomCapabilities.min} 
                            max={Math.min(zoomCapabilities.max, 5)} // Cap at 5x to prevent extreme pixelation
                            step={0.1}
                            value={zoom}
                            onChange={handleZoomChange}
                            className="flex-1 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all"
                        />
                        <ZoomIn size={18} className="text-white/50" />
                    </div>
                )}

                {/* FEEDBACK */}
                {lastScan && (
                    <div className="w-full max-w-md bg-white rounded-3xl p-4 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10 duration-300 ring-4 ring-emerald-500/20">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                            <ShieldCheck size={24}/>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detected</div>
                            <div className="font-mono font-black text-2xl text-slate-900 tracking-tighter truncate">{lastScan}</div>
                        </div>
                        {continuous && <button onClick={() => setLastScan('')} className="p-2 text-slate-300 hover:text-slate-600"><X size={20}/></button>}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes scan {
                    0%, 100% { top: 10%; opacity: 0; }
                    50% { opacity: 1; }
                    0% { top: 10%; }
                    100% { top: 90%; }
                }
            `}</style>
        </div>
    );
}