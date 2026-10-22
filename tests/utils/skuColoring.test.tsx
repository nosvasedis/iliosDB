import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SkuColorizedText from '../../components/SkuColorizedText';
import StoneCodeText from '../../components/StoneCodeText';
import { Gender } from '../../types';
import {
    getSkuFinishBadgeSurface,
    getSkuFinishCardTheme,
    getSkuFinishTextColor,
    getSkuStoneTextColor
} from '../../utils/skuColoring';

describe('SKU variant badge colors', () => {
    it('colors MUL letters separately without shifting colors onto a legacy prefix or metal finish', () => {
        const html = renderToStaticMarkup(
            <SkuColorizedText sku="DA100" suffix="SDMUL" gender={Gender.Women} masterClassName="text-slate-700" />
        );
        expect(html).toContain('class="text-slate-700">S</span>');
        expect(html).toContain('class="text-orange-500">D</span>');
        expect(html).toContain('style="color:#dc2626">M</span>');
        expect(html).toContain('style="color:#16a34a">U</span>');
        expect(html).toContain('style="color:#2563eb">L</span>');
    });

    it('uses print-safe letter colors for standalone MUL badges and leaves other codes intact', () => {
        expect(renderToStaticMarkup(<StoneCodeText code="MUL" />)).toBe(
            '<span style="color:#dc2626">M</span><span style="color:#16a34a">U</span><span style="color:#2563eb">L</span>'
        );
        expect(renderToStaticMarkup(<StoneCodeText code="CI" />)).toBe('CI');
        expect(renderToStaticMarkup(<StoneCodeText code="COMG" />)).toBe('COMG');
    });

    it('uses a subdued surface derived from the metal finish', () => {
        expect(getSkuFinishBadgeSurface('X')).toBe('bg-amber-50 border-amber-200');
        expect(getSkuFinishBadgeSurface('D')).toBe('bg-orange-50 border-orange-200');
        expect(getSkuFinishBadgeSurface('H')).toBe('bg-cyan-50 border-cyan-200');
        expect(getSkuFinishBadgeSurface('P')).toBe('bg-slate-50 border-slate-200');
        expect(getSkuFinishBadgeSurface('')).toBe('bg-slate-50 border-slate-200');
        expect(getSkuFinishBadgeSurface('UNKNOWN')).toBe('bg-slate-50 border-slate-200');
    });

    it('extends the same restrained finish palette across the variant selector card', () => {
        expect(getSkuFinishCardTheme('X')).toMatchObject({
            panel: expect.stringContaining('bg-amber-50'),
            control: expect.stringContaining('text-amber-700'),
            accent: expect.stringContaining('bg-amber-400')
        });
        expect(getSkuFinishCardTheme('D').panel).toContain('bg-orange-50');
        expect(getSkuFinishCardTheme('H').panel).toContain('bg-cyan-50');
        expect(getSkuFinishCardTheme('P').panel).toContain('bg-slate-50');
        expect(getSkuFinishCardTheme('UNKNOWN')).toBe(getSkuFinishCardTheme(''));
    });

    it('keeps metal and stone text colors independent', () => {
        expect(getSkuFinishTextColor('D')).toBe('text-orange-500');
        expect(getSkuStoneTextColor('LE')).toBe('text-slate-400');

        const html = renderToStaticMarkup(
            <SkuColorizedText sku="" suffix="DLE" gender={Gender.Men} />
        );

        expect(html).toContain('class="text-orange-500">D</span>');
        expect(html).toContain('class="text-slate-400">L</span>');
        expect(html).toContain('class="text-slate-400">E</span>');
    });

    it('preserves and neutrally colors a legacy prefix before the finish', () => {
        const html = renderToStaticMarkup(
            <SkuColorizedText
                sku=""
                suffix="SDLE"
                gender={Gender.Men}
                masterClassName="text-slate-700"
            />
        );

        expect(html).toContain('class="text-slate-700">S</span>');
        expect(html).toContain('class="text-orange-500">D</span>');
        expect(html).toContain('class="text-slate-400">L</span>');
        expect(html).toContain('class="text-slate-400">E</span>');
    });
});
