import React from 'react';
import { ZoomIn } from 'lucide-react';

interface Props {
    onZoom: () => void;
    /** Extra positioning classes, e.g. `absolute bottom-3 right-3`. */
    className?: string;
    size?: 'sm' | 'md';
    /** Skip the hover reveal, e.g. inside lists without a hover state. */
    alwaysVisible?: boolean;
}

/**
 * Magnifier that appears when hovering a card's photo (always shown on touch screens)
 * and opens the zoom lightbox without triggering the card's own click.
 */
export default function ImageZoomButton({ onZoom, className = '', size = 'md', alwaysVisible = false }: Props) {
    const dimension = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
    const visibility = alwaysVisible
        ? 'opacity-100'
        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';
    return (
        <button
            type="button"
            aria-label="Μεγέθυνση φωτογραφίας"
            title="Μεγέθυνση φωτογραφίας"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onZoom();
            }}
            className={`z-20 inline-flex ${dimension} items-center justify-center rounded-full border border-white/20 bg-[#060b00]/75 text-white shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-110 hover:bg-[#060b00]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${visibility} ${className}`}
        >
            <ZoomIn size={size === 'sm' ? 13 : 16} strokeWidth={2.5} />
        </button>
    );
}
