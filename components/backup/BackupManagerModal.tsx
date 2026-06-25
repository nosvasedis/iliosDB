
import React, { useEffect, useMemo, useState } from 'react';
import {
    X, FileJson, FileText, Upload, ChevronDown, ChevronRight,
    Database, AlertTriangle, Info,
} from 'lucide-react';
import {
    BACKUP_CATEGORIES,
    BACKUP_PRESETS,
    BACKUP_TABLE_REGISTRY,
    BackupExportOptions,
    BackupRestoreOptions,
    ValidationResult,
    getDefaultExportOptions,
    getDefaultRestoreOptions,
    resolveExportTables,
    resolveTableDependencies,
    validateBackup,
} from '../../lib/backupConfig';
import { api } from '../../lib/supabase';

export type BackupManagerMode = 'export' | 'restore';

interface BackupManagerModalProps {
    isOpen: boolean;
    mode: BackupManagerMode;
    onClose: () => void;
    restoreData?: unknown;
    onRunExport: (options: BackupExportOptions, format: 'json' | 'csv') => void;
    onRunRestore: (data: unknown, options: BackupRestoreOptions) => void;
    onPickRestoreFile?: () => void;
}

function ToggleRow({
    label,
    description,
    checked,
    onChange,
    disabled,
    warning,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    warning?: string;
}) {
    return (
        <label className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${checked ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
                type="checkbox"
                className="mt-1 rounded border-slate-300"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-700">{label}</span>
                {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
                {warning && checked && <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle size={12} /> {warning}</p>}
            </div>
        </label>
    );
}

export default function BackupManagerModal({
    isOpen,
    mode,
    onClose,
    restoreData,
    onRunExport,
    onRunRestore,
    onPickRestoreFile,
}: BackupManagerModalProps) {
    const [exportOptions, setExportOptions] = useState<BackupExportOptions>(getDefaultExportOptions());
    const [restoreOptions, setRestoreOptions] = useState<BackupRestoreOptions>(getDefaultRestoreOptions());
    const [selectedPresetId, setSelectedPresetId] = useState('full');
    const [tableStats, setTableStats] = useState<Record<string, number>>({});
    const [loadingStats, setLoadingStats] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(BACKUP_CATEGORIES.map((c) => c.id)));
    const [validation, setValidation] = useState<ValidationResult | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        if (mode === 'export') {
            setExportOptions(getDefaultExportOptions());
            setSelectedPresetId('full');
        }
    }, [isOpen, mode]);

    useEffect(() => {
        if (!isOpen || mode !== 'export') return;
        setLoadingStats(true);
        api.getBackupTableStats()
            .then(setTableStats)
            .catch(() => setTableStats({}))
            .finally(() => setLoadingStats(false));
    }, [isOpen, mode]);

    useEffect(() => {
        if (!isOpen || mode !== 'restore' || !restoreData) {
            setValidation(null);
            return;
        }
        const result = validateBackup(restoreData);
        setValidation(result);
        const defaultTables = result.exportOptions?.tables?.length
            ? result.exportOptions.tables
            : result.availableTables;
        setRestoreOptions({
            ...getDefaultRestoreOptions(defaultTables),
            restoreConfig: result.hasConfig,
            includeSyncQueue: result.hasSyncQueue,
            includeLocalExtras: result.hasExtras || true,
            includeImages: result.imageCount > 0,
        });
    }, [isOpen, mode, restoreData]);

    const resolvedExportTables = useMemo(
        () => resolveExportTables(exportOptions),
        [exportOptions],
    );

    const exportSummary = useMemo(() => {
        const rowCount = resolvedExportTables.reduce((sum, t) => sum + (tableStats[t] ?? 0), 0);
        const parts = [
            `${resolvedExportTables.length} πίνακες`,
            loadingStats ? '~… εγγραφές' : `~${rowCount} εγγραφές`,
            exportOptions.includeImages ? 'εικόνες ναι' : 'εικόνες όχι',
        ];
        return parts.join(' • ');
    }, [resolvedExportTables, tableStats, loadingStats, exportOptions.includeImages]);

    const applyPreset = (presetId: string) => {
        const preset = BACKUP_PRESETS.find((p) => p.id === presetId);
        if (!preset) return;
        setSelectedPresetId(presetId);
        setExportOptions({ ...preset.options });
    };

    const toggleExportTable = (table: string, checked: boolean) => {
        setSelectedPresetId('custom');
        setExportOptions((prev) => {
            const next = checked
                ? [...prev.tables, table]
                : prev.tables.filter((t) => t !== table);
            return { ...prev, tables: [...new Set(next)] };
        });
    };

    const toggleCategoryTables = (categoryId: string, checked: boolean) => {
        setSelectedPresetId('custom');
        const categoryTables = BACKUP_TABLE_REGISTRY.filter((e) => e.category === categoryId).map((e) => e.table);
        setExportOptions((prev) => {
            let next = [...prev.tables];
            if (checked) {
                next = [...next, ...categoryTables];
            } else {
                next = next.filter((t) => !categoryTables.includes(t));
            }
            return { ...prev, tables: [...new Set(next)] };
        });
    };

    const toggleRestoreTable = (table: string, checked: boolean) => {
        setRestoreOptions((prev) => {
            const next = checked
                ? [...prev.tables, table]
                : prev.tables.filter((t) => t !== table);
            return { ...prev, tables: resolveTableDependencies([...new Set(next)]) };
        });
    };

    const isRestorePartial = useMemo(() => {
        if (!validation) return false;
        return restoreOptions.tables.length < validation.availableTables.length;
    }, [validation, restoreOptions.tables]);

    const handleExportJson = () => {
        onRunExport(exportOptions, 'json');
    };

    const handleExportCsv = () => {
        onRunExport(exportOptions, 'csv');
    };

    const handleRestore = () => {
        if (!restoreData || !validation?.valid) return;
        onRunRestore(restoreData, restoreOptions);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Database size={20} className="text-blue-500" />
                            {mode === 'export' ? 'Εξαγωγή & Backup' : 'Επαναφορά Backup'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                            {mode === 'export'
                                ? 'Επιλέξτε τι θέλετε να συμπεριληφθεί στο αντίγραφο ασφαλείας'
                                : 'Επιλέξτε τι θέλετε να επαναφέρετε από το αρχείο'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {mode === 'export' && (
                        <>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Πρότυπο</label>
                                <select
                                    value={selectedPresetId}
                                    onChange={(e) => applyPreset(e.target.value)}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-300"
                                >
                                    {BACKUP_PRESETS.map((p) => (
                                        <option key={p.id} value={p.id}>{p.label}</option>
                                    ))}
                                    <option value="custom">Προσαρμοσμένο</option>
                                </select>
                                {BACKUP_PRESETS.find((p) => p.id === selectedPresetId)?.description && (
                                    <p className="text-xs text-slate-500 mt-2">{BACKUP_PRESETS.find((p) => p.id === selectedPresetId)?.description}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Επιλογές περιεχομένου</label>
                                <ToggleRow
                                    label="Εικόνες προϊόντων"
                                    description="Λήψη εικόνων από cloud storage (αυξάνει το μέγεθος)"
                                    checked={exportOptions.includeImages}
                                    onChange={(v) => setExportOptions((p) => ({ ...p, includeImages: v }))}
                                />
                                <ToggleRow
                                    label="Ρυθμίσεις σύνδεσης"
                                    description="URL Supabase, τοπική λειτουργία κ.λπ."
                                    checked={exportOptions.includeConfig}
                                    onChange={(v) => setExportOptions((p) => ({ ...p, includeConfig: v, includeConfigSecrets: v ? p.includeConfigSecrets : false }))}
                                />
                                <ToggleRow
                                    label="API Keys (ευαίσθητα)"
                                    description="Supabase anon key, Worker auth, Gemini API"
                                    checked={exportOptions.includeConfigSecrets}
                                    disabled={!exportOptions.includeConfig}
                                    warning="Τα API keys είναι ευαίσθητα — μοιραστείτε το backup με προσοχή"
                                    onChange={(v) => setExportOptions((p) => ({ ...p, includeConfigSecrets: v }))}
                                />
                                <ToggleRow
                                    label="Ουρά offline συγχρονισμού"
                                    checked={exportOptions.includeSyncQueue}
                                    onChange={(v) => setExportOptions((p) => ({ ...p, includeSyncQueue: v }))}
                                />
                                <ToggleRow
                                    label="Τοπικά extras"
                                    description="Χρώματα ετικετών, ιστορικό βελτιστοποίησης εικόνων"
                                    checked={exportOptions.includeLocalExtras}
                                    onChange={(v) => setExportOptions((p) => ({ ...p, includeLocalExtras: v }))}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Πίνακες δεδομένων</label>
                                <div className="space-y-2">
                                    {BACKUP_CATEGORIES.map((cat) => {
                                        const entries = BACKUP_TABLE_REGISTRY.filter((e) => e.category === cat.id);
                                        const allSelected = entries.every((e) => exportOptions.tables.includes(e.table));
                                        const someSelected = entries.some((e) => exportOptions.tables.includes(e.table));
                                        const expanded = expandedCategories.has(cat.id);
                                        return (
                                            <div key={cat.id} className="border border-slate-100 rounded-xl overflow-hidden">
                                                <div className="flex items-center gap-2 p-3 bg-slate-50">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedCategories((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(cat.id)) next.delete(cat.id);
                                                            else next.add(cat.id);
                                                            return next;
                                                        })}
                                                        className="text-slate-400"
                                                    >
                                                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    </button>
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300"
                                                        checked={allSelected}
                                                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                                                        onChange={(e) => toggleCategoryTables(cat.id, e.target.checked)}
                                                    />
                                                    <span className="text-sm font-bold text-slate-700 flex-1">{cat.label}</span>
                                                    <span className="text-xs text-slate-400">{entries.filter((e) => exportOptions.tables.includes(e.table)).length}/{entries.length}</span>
                                                </div>
                                                {expanded && (
                                                    <div className="p-2 space-y-1 border-t border-slate-100">
                                                        {entries.map((entry) => (
                                                            <label key={entry.table} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="rounded border-slate-300"
                                                                    checked={exportOptions.tables.includes(entry.table)}
                                                                    onChange={(e) => toggleExportTable(entry.table, e.target.checked)}
                                                                />
                                                                <span className="text-sm text-slate-600 flex-1">{entry.label}</span>
                                                                <span className="text-xs text-slate-400 font-mono">{tableStats[entry.table] ?? '—'}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-800 font-medium">
                                {exportSummary}
                            </div>

                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 flex gap-2">
                                <Info size={14} className="shrink-0 mt-0.5" />
                                <span>Οι λογαριασμοί Supabase Auth δεν μπορούν να εξαχθούν από τον browser. Τα προφίλ (profiles) μπορούν να συμπεριληφθούν, αλλά οι κωδικοί πρέπει να δημιουργηθούν ξανά.</span>
                            </div>
                        </>
                    )}

                    {mode === 'restore' && (
                        <>
                            {!restoreData && (
                                <div className="text-center py-8">
                                    <Upload size={40} className="mx-auto text-slate-300 mb-4" />
                                    <p className="text-sm text-slate-500 mb-4">Επιλέξτε αρχείο backup (.json)</p>
                                    <button
                                        onClick={onPickRestoreFile}
                                        className="px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 text-sm"
                                    >
                                        Επιλογή Αρχείου
                                    </button>
                                </div>
                            )}

                            {restoreData && validation && (
                                <>
                                    {!validation.valid && (
                                        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
                                            {validation.errors.join(' ')}
                                        </div>
                                    )}

                                    {validation.valid && (
                                        <>
                                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                                                <div className="text-sm font-bold text-slate-800">
                                                    {validation.createdAt
                                                        ? new Date(validation.createdAt).toLocaleString('el-GR')
                                                        : 'Άγνωστη ημερομηνία'}
                                                </div>
                                                <div className="text-sm text-slate-600">{validation.summary}</div>
                                                {validation.warnings.length > 0 && (
                                                    <div className="text-xs text-amber-700 space-y-1 pt-2 border-t border-slate-200">
                                                        {validation.warnings.map((w, i) => (
                                                            <div key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {isRestorePartial && (
                                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                                                    Θα αντικατασταθούν μόνο οι επιλεγμένοι πίνακες. Τα υπόλοιπα δεδομένα παραμένουν αμετάβλητα.
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Επιλογές επαναφοράς</label>
                                                <ToggleRow
                                                    label="Εικόνες προϊόντων"
                                                    checked={restoreOptions.includeImages}
                                                    disabled={validation.imageCount === 0}
                                                    onChange={(v) => setRestoreOptions((p) => ({ ...p, includeImages: v }))}
                                                />
                                                <ToggleRow
                                                    label="Ρυθμίσεις σύνδεσης"
                                                    checked={restoreOptions.restoreConfig}
                                                    disabled={!validation.hasConfig}
                                                    warning="Θα αντικαταστήσει τις τρέχουσες ρυθμίσεις σύνδεσης"
                                                    onChange={(v) => setRestoreOptions((p) => ({ ...p, restoreConfig: v }))}
                                                />
                                                <ToggleRow
                                                    label="Ουρά offline συγχρονισμού"
                                                    checked={restoreOptions.includeSyncQueue}
                                                    disabled={!validation.hasSyncQueue}
                                                    onChange={(v) => setRestoreOptions((p) => ({ ...p, includeSyncQueue: v }))}
                                                />
                                                <ToggleRow
                                                    label="Τοπικά extras"
                                                    checked={restoreOptions.includeLocalExtras}
                                                    disabled={!validation.hasExtras}
                                                    onChange={(v) => setRestoreOptions((p) => ({ ...p, includeLocalExtras: v }))}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Πίνακες προς επαναφορά</label>
                                                <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
                                                    {validation.availableTables.map((table) => {
                                                        const entry = BACKUP_TABLE_REGISTRY.find((e) => e.table === table);
                                                        const count = validation.tableCounts[table] ?? 0;
                                                        return (
                                                            <label key={table} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="rounded border-slate-300"
                                                                    checked={restoreOptions.tables.includes(table)}
                                                                    onChange={(e) => toggleRestoreTable(table, e.target.checked)}
                                                                />
                                                                <span className="text-sm text-slate-600 flex-1">{entry?.label ?? table}</span>
                                                                <span className="text-xs text-slate-400">{count}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="p-6 pt-4 border-t border-slate-100 shrink-0 flex flex-wrap gap-3">
                    <button onClick={onClose} className="px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-2xl">
                        Ακύρωση
                    </button>
                    {mode === 'export' && (
                        <>
                            <button
                                onClick={handleExportCsv}
                                disabled={resolvedExportTables.length === 0}
                                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 disabled:opacity-50 text-sm"
                            >
                                <FileText size={16} /> Λήψη CSV
                            </button>
                            <button
                                onClick={handleExportJson}
                                disabled={resolvedExportTables.length === 0}
                                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 disabled:opacity-50 text-sm"
                            >
                                <FileJson size={16} /> Λήψη JSON
                            </button>
                        </>
                    )}
                    {mode === 'restore' && restoreData && validation?.valid && (
                        <button
                            onClick={handleRestore}
                            disabled={restoreOptions.tables.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 disabled:opacity-50 text-sm"
                        >
                            <Upload size={16} /> Επαναφορά
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
