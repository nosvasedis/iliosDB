import React from 'react';
import { getSkuStoneLetterStyle } from '../utils/skuColoring';

const MULTICOLOR_CODE = (
    <>
        {'MUL'.split('').map((letter, index) => (
            <span key={letter} style={getSkuStoneLetterStyle('MUL', index)}>{letter}</span>
        ))}
    </>
);

/** Render extra letter spans only for the multicolor stone code. */
export default function StoneCodeText({ code }: { code: string }) {
    return code === 'MUL' ? MULTICOLOR_CODE : <>{code}</>;
}
