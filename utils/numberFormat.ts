const decimalFormatters = new Map<number, Intl.NumberFormat>();
const numberFormatter = new Intl.NumberFormat('el-GR', {
    useGrouping: true,
    maximumFractionDigits: 6,
});

const finiteNumber = (value: number | null | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Greek grouping and decimals for quantities, counts and other displayed figures. */
export const formatNumber = (value: number | null | undefined): string =>
    numberFormatter.format(finiteNumber(value));

/** Greek grouping and decimals, preserving the requested fixed precision. */
export const formatDecimal = (value: number | null | undefined, precision = 2): string => {
    let formatter = decimalFormatters.get(precision);
    if (!formatter) {
        formatter = new Intl.NumberFormat('el-GR', {
            useGrouping: true,
            minimumFractionDigits: precision,
            maximumFractionDigits: precision,
        });
        decimalFormatters.set(precision, formatter);
    }
    return formatter.format(finiteNumber(value));
};

export const formatCurrency = (value: number | null | undefined): string =>
    `${formatDecimal(value, 2)}\u00a0€`;
