import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, X, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
    imageUrl: string;
    sku: string;
    onClose: () => void;
}

export default function ProductImageZoom({ imageUrl, sku, onClose }: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [zoom, setZoom] = useState(1);
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);

    return createPortal(
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            className="fixed inset-0 m-auto w-[94vw] h-[90dvh] max-w-5xl max-h-none p-0 rounded-2xl bg-slate-950 text-white shadow-2xl backdrop:bg-black/80"
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onClick={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="flex flex-col h-full">
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 border-b border-white/10">
                    <h3 id={titleId} className="font-black font-mono">Φωτογραφία {sku}</h3>
                    <div className="flex items-center gap-2">
                        <button type="button" aria-label="Σμίκρυνση" disabled={zoom === 1 || imageFailed} onClick={() => setZoom(value => Math.max(1, value - 0.5))} className="p-2 rounded-lg hover:bg-white/20 disabled:opacity-30">
                            <ZoomOut size={20} />
                        </button>
                        <button type="button" aria-label="Επαναφορά ζουμ" onClick={() => setZoom(1)} className="min-w-16 p-2 rounded-lg text-sm font-bold hover:bg-white/20">
                            {Math.round(zoom * 100)}%
                        </button>
                        <button type="button" aria-label="Μεγέθυνση" disabled={zoom === 3 || imageFailed} onClick={() => setZoom(value => Math.min(3, value + 0.5))} className="p-2 rounded-lg hover:bg-white/20 disabled:opacity-30">
                            <ZoomIn size={20} />
                        </button>
                        <button type="button" aria-label="Κλείσιμο φωτογραφίας" onClick={onClose} className="p-2 rounded-lg hover:bg-white/20">
                            <X size={22} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                    {imageFailed ? (
                        <div className="flex flex-col items-center justify-center gap-3 h-full text-slate-400">
                            <ImageIcon size={48} />
                            <p>Δεν ήταν δυνατή η φόρτωση της φωτογραφίας.</p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            aria-label={zoom === 1 ? 'Ζουμ στη φωτογραφία' : 'Επαναφορά φωτογραφίας'}
                            onClick={() => setZoom(value => value === 1 ? 2 : 1)}
                            className={`block p-3 ${zoom === 1 ? 'cursor-zoom-in' : 'cursor-zoom-out'}`}
                            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                        >
                            <img src={imageUrl} alt={sku} draggable={false} onError={() => setImageFailed(true)} className="w-full h-full object-contain select-none" />
                        </button>
                    )}
                </div>
            </div>
        </dialog>,
        document.body
    );
}
