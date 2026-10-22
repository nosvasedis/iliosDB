import React from 'react';
import SkuColorizedText from '../SkuColorizedText';

type Props = React.ComponentProps<typeof SkuColorizedText> & {
    onOpen: (sku: string, suffix?: string) => void;
};

export default function ProductionSkuButton({ onOpen, ...skuProps }: Props) {
    return (
        <button
            type="button"
            aria-label={`Προβολή στοιχείων ${skuProps.sku}${skuProps.suffix || ''}`}
            title="Προβολή στοιχείων SKU"
            className="w-fit rounded text-left hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&_span]:cursor-pointer"
            onClick={event => {
                event.stopPropagation();
                onOpen(skuProps.sku, skuProps.suffix);
            }}
        >
            <SkuColorizedText {...skuProps} />
        </button>
    );
}
