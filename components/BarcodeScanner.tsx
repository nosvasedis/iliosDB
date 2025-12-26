
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
            // Faster recovery time (1.2s instead of 2.5s)
            if (text !== lastScan || (Date.now() - scanCount > 1200)) {
                setLastScan(text);
                setScanCount(Date.now());
                
                // Haptic & Audio Feedback
                if ('vibrate' in navigator) navigator.vibrate(50);
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.type = 'sine';
                oscillator.frequency.value = 1000;
                gainNode.gain.value = 0.05;
                oscillator.start();
                setTimeout(() => oscillator.stop(), 80);
                
                onScan(text);
                if (!continuous) onClose();
            }
        },
        options: {
            // Enhanced decoding hints for jewelry labels
            // @FIX: Explicitly typed Map<number, any> to resolve 'No overload matches this call' because TypeScript failed to infer the heterogeneous value types (number[] for format 2 and boolean for hint 1).
            hints: new Map<number, any>([
                [2, [11, 1, 4]], // CODE_128, CODE_39, EAN_13
                [1, true] // Try harder
            ])
        }
    });

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
            <div className="p-6 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2 rounded-full">
                        <Camera className="text-amber-500 animate-pulse" size={24} />
                    </div>
                    <div>
                        <span className="font-bold text-lg block leading-none">Ilios Vision</span>
                        <span className="text-xs text-white/60">Scanning Engine v2.0</span>
                    </div>
                </div>
                <button onClick={onClose} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm">
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
                <video ref={ref} className="w-full h-full object-cover opacity-90" />
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-80 h-40 border-2 border-white/30 rounded-3xl relative shadow-[0_0_50px_rgba(255,255,255,0.1)]">
                        <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)] animate-pulse"></div>
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 -mt-1 -ml-1 rounded-tl-xl"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 -mt-1 -mr-1 rounded-tr-xl"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 -mb-1 -ml-1 rounded-bl-xl"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 -mb-1 -mr-1 rounded-br-xl"></div>
                    </div>
                    <div className="mt-8 bg-black/40 px-6 py-3 rounded-full text-white text-xs font-bold uppercase tracking-widest backdrop-blur-md border border-white/10 shadow-xl">
                        Στοχεύστε το Barcode
                    </div>
                </div>
            </div>

            {lastScan && continuous && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600/90 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-10 border border-emerald-400/30">
                    <div className="bg-white/20 p-1.5 rounded-full"><Zap size={16} className="fill-current"/></div>
                    <div>
                        <div className="text-[10px] font-bold uppercase opacity-80 tracking-wider">Αναγνωρίστηκε</div>
                        <div className="font-mono font-black text-xl tracking-widest">{lastScan}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
