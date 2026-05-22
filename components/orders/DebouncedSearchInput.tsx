import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

type Props = {
    value: string;
    onDebouncedChange: (value: string) => void;
    debounceMs?: number;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    iconSize?: number;
};

/**
 * Search field with local state so parent list/filter logic does not re-run on every keystroke.
 */
export default function DebouncedSearchInput({
    value,
    onDebouncedChange,
    debounceMs = 220,
    placeholder,
    className = 'relative',
    inputClassName,
    iconSize = 18,
}: Props) {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        const handle = window.setTimeout(() => onDebouncedChange(localValue), debounceMs);
        return () => window.clearTimeout(handle);
    }, [localValue, debounceMs, onDebouncedChange]);

    return (
        <div className={className}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={iconSize} />
            <input
                type="text"
                placeholder={placeholder}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                className={inputClassName}
            />
        </div>
    );
}
