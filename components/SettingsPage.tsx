import { useRestartDraft } from '../hooks/useRestartBlocker';
import { APP_BUILD_ID, requestAppRestart } from '../lib/appUpdates';
import { formatNumber } from '../utils/numberFormat';
import PricingRulesSettings from './PricingRulesSettings';

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { GlobalSettings, Product } from '../types';
import { Save, TrendingUp, Loader2, Settings as SettingsIcon, Key, Download, Database, RefreshCw, Trash2, HardDrive, Upload, Tag, AlertTriangle, Clock, Image as ImageIcon, X, Search, Play, CheckSquare, Coins, MonitorSmartphone, Wrench, ChevronRight, Eye, EyeOff, WifiOff, Cloud, Server, Unplug, Printer, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, GEMINI_API_KEY, api, getLocalImageStoragePreference, setLocalImageStoragePreference, getConnectionSummary, clearConfiguration } from '../lib/supabase';
import { offlineDb } from '../lib/offlineDb';
import AuditLogsModal from './AuditLogsModal';
import BackupProgressModal from './BackupProgressModal';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';
import { formatDecimal } from '../utils/pricingEngine';
import { downloadBlob } from '../utils/exportUtils';
import { BackupExportOptions, BackupProgress, BackupRestoreOptions } from '../lib/backupConfig';
import BackupManagerModal, { BackupExportKind } from './backup/BackupManagerModal';
import { buildCanonicalMigration } from '../lib/migrationExport';
import { createMigrationBundle, createRecoveryBundle, encryptBackupPackage, isEncryptedBackupPackage, readBackupBytes } from '../lib/backupPackage';
import DesktopPageHeader from './DesktopPageHeader';
import { useSettings } from '../hooks/api/useSettings';
import { compressImage } from '../utils/imageHelpers';
import IliosLoader from './ui/IliosLoader';
import { BELOW_TAB_CONTAINER, belowTabButton } from './ui/designTokens';
import { DEFAULT_PRICING_RULES, validatePricingRules } from '../utils/pricingRules';
import { LABEL_PRINT_STORAGE_KEYS, LabelPrintSettings, readLabelPrintSettings } from '../features/printing';

const IMAGE_OPTIMIZATION_BATCH_SIZE = 100;
const IMAGE_OPTIMIZATION_SKIPPED_KEY = 'ilios:image-optimization-skipped:v1';
const IMAGE_OPTIMIZATION_HISTORY_KEY = 'ilios:image-optimization-history:v1';
const IMAGE_OPTIMIZATION_MIN_BYTES = 450 * 1024;
const IMAGE_OPTIMIZATION_MAX_EDGE = 1100;
const SETTINGS_TAB_KEY = 'ilios:settings-tab:v1';
const waitForBrowserIdle = () => new Promise(resolve => window.setTimeout(resolve, 150));

type ImageOptimizationHistoryEntry = {
    id: string;
    date: string;
    mode: string;
    checked: number;
    optimized: number;
    skipped: number;
    failed: number;
    savedMb: string;
};

type SettingsTab = 'pricing' | 'labels' | 'device' | 'data' | 'maintenance';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
    { id: 'pricing', label: 'Τιμολόγηση', icon: Coins },
    { id: 'labels', label: 'Ετικέτες', icon: Tag },
    { id: 'device', label: 'Συσκευή & Σύνδεση', icon: MonitorSmartphone },
    { id: 'data', label: 'Δεδομένα & Backup', icon: Database },
    { id: 'maintenance', label: 'Συντήρηση', icon: Wrench },
];

/** Preferences that live on this device only (not in global_settings). */
type DevicePrefs = { localImages: boolean; labels: LabelPrintSettings };

const readDevicePrefs = (): DevicePrefs => ({ localImages: getLocalImageStoragePreference(), labels: readLabelPrintSettings() });

const writeDevicePrefs = (prefs: DevicePrefs) => {
    setLocalImageStoragePreference(prefs.localImages);
    localStorage.setItem(LABEL_PRINT_STORAGE_KEYS.format, prefs.labels.format);
    localStorage.setItem(LABEL_PRINT_STORAGE_KEYS.showPrice, String(prefs.labels.showPrice));
    localStorage.setItem(LABEL_PRINT_STORAGE_KEYS.priceTier, prefs.labels.priceTier);
    localStorage.setItem(LABEL_PRINT_STORAGE_KEYS.codifiedPrice, String(prefs.labels.codifiedPrice));
};

const readStoredTab = (): SettingsTab => {
    try {
        const stored = localStorage.getItem(SETTINGS_TAB_KEY);
        return SETTINGS_TABS.some(tab => tab.id === stored) ? stored as SettingsTab : 'pricing';
    } catch {
        return 'pricing';
    }
};

const isPositive = (value: number) => Number.isFinite(value) && value > 0;
const numberInputValue = (value: number) => (Number.isFinite(value) ? value : '');
const parseNumberInput = (raw: string) => (raw === '' ? NaN : Number(raw));

// ──────────────────────────────────────────────
//  Building blocks
// ──────────────────────────────────────────────

type Tone = 'amber' | 'purple' | 'emerald' | 'blue' | 'indigo' | 'rose' | 'slate';

const TONE_TILE: Record<Tone, string> = {
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    rose: 'bg-rose-100 text-rose-700',
    slate: 'bg-slate-100 text-slate-700',
};

function SettingsCard({ icon: Icon, tone, title, description, actions, children, className = '' }: {
    icon: LucideIcon; tone: Tone; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
    return (
        <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/70 p-5 md:px-6">
                <div className="flex items-start gap-3">
                    <div className={`rounded-2xl p-3 ${TONE_TILE[tone]}`}><Icon size={20} /></div>
                    <div>
                        <h2 className="text-base font-bold text-slate-800">{title}</h2>
                        {description ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p> : null}
                    </div>
                </div>
                {actions}
            </div>
            <div className="p-5 md:p-6">{children}</div>
        </section>
    );
}

function NumberField({ label, value, unit, onChange, step = '0.01', min = 0, invalid, hint }: {
    label: string; value: number; unit: string; onChange: (value: number) => void; step?: string; min?: number; invalid?: boolean; hint?: string;
}) {
    return (
        <label className="block text-xs font-semibold text-slate-600">
            {label}
            <span className={`mt-2 flex items-center gap-2 rounded-xl border bg-white px-3 transition focus-within:ring-2 ${invalid ? 'border-red-300 focus-within:border-red-400 focus-within:ring-red-100' : 'border-slate-200 focus-within:border-amber-400 focus-within:ring-amber-100'}`}>
                <input
                    type="number" min={min} step={step}
                    value={numberInputValue(value)}
                    onChange={event => onChange(parseNumberInput(event.target.value))}
                    aria-invalid={invalid || undefined}
                    className="min-w-0 w-full bg-transparent py-3 font-mono text-base font-semibold text-slate-900 outline-none"
                />
                <span className="shrink-0 text-xs font-medium text-slate-400">{unit}</span>
            </span>
            {hint ? <span className="mt-1.5 block text-[11px] font-medium text-slate-400">{hint}</span> : null}
        </label>
    );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange, disabled }: {
    icon?: LucideIcon; title: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
    return (
        <label className={`flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition ${disabled ? 'opacity-50' : 'cursor-pointer hover:border-slate-300'}`}>
            <span className="flex min-w-0 items-start gap-3">
                {Icon ? <Icon size={18} className="mt-0.5 shrink-0 text-slate-400" /> : null}
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">{title}</span>
                    {description ? <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span> : null}
                </span>
            </span>
            <span className="relative inline-flex shrink-0">
                <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
                <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300 peer-focus-visible:ring-offset-2" />
                <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
        </label>
    );
}

function Segmented<T extends string>({ label, value, options, onChange, disabled }: {
    label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean;
}) {
    return (
        <div className={disabled ? 'opacity-50' : ''}>
            <p className="text-xs font-semibold text-slate-600">{label}</p>
            <div role="radiogroup" aria-label={label} className="mt-2 inline-flex w-full rounded-xl border border-slate-200/60 bg-slate-100 p-1">
                {options.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={value === option.value}
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-all duration-200 ${value === option.value ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ActionTile({ icon: Icon, tone, title, description, onClick, disabled, busy, trailing }: {
    icon: LucideIcon; tone: Tone; title: string; description: string; onClick: () => void; disabled?: boolean; busy?: boolean; trailing?: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105 ${TONE_TILE[tone]}`}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-800">{title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
            </span>
            {trailing}
            <ChevronRight size={18} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
        </button>
    );
}

function InfoRow({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-medium text-slate-500">{label}</span>
            <span className={`flex min-w-0 items-center gap-1.5 truncate text-sm font-bold ${ok === false ? 'text-amber-700' : 'text-slate-800'}`}>
                {ok === true ? <CheckCircle2 size={15} className="shrink-0 text-emerald-500" /> : ok === false ? <AlertCircle size={15} className="shrink-0 text-amber-500" /> : null}
                <span className="truncate">{value}</span>
            </span>
        </div>
    );
}

/** Scaled outline of a label so width/height edits are easy to sanity-check. */
function LabelPreview({ width, height, tone }: { width: number; height: number; tone: 'purple' | 'amber' }) {
    const valid = isPositive(width) && isPositive(height);
    const scale = valid ? Math.min(220 / width, 96 / height) : 0;
    return (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[radial-gradient(rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:12px_12px]">
            {valid ? (
                <div
                    className={`flex items-center justify-center rounded-md border-2 bg-white font-mono text-[10px] font-bold shadow-sm ${tone === 'purple' ? 'border-purple-300 text-purple-700' : 'border-amber-300 text-amber-700'}`}
                    style={{ width: Math.max(24, width * scale), height: Math.max(14, height * scale) }}
                >
                    {formatDecimal(width, 1)} × {formatDecimal(height, 1)}
                </div>
            ) : (
                <span className="text-xs font-semibold text-red-500">Μη έγκυρες διαστάσεις</span>
            )}
        </div>
    );
}

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: settingsData, isLoading: loadingSettings } = useSettings();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const connection = useMemo(() => getConnectionSummary(), []);

    const [activeTab, setActiveTabState] = useState<SettingsTab>(readStoredTab);
    const setActiveTab = (tab: SettingsTab) => {
        setActiveTabState(tab);
        try { localStorage.setItem(SETTINGS_TAB_KEY, tab); } catch { /* per-device convenience only */ }
    };

    const [settings, setSettings] = useState<GlobalSettings | null>(null);
    const [localGeminiKey, setLocalGeminiKey] = useState(GEMINI_API_KEY);
    const [savedGeminiKey, setSavedGeminiKey] = useState(GEMINI_API_KEY);
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [devicePrefs, setDevicePrefs] = useState<DevicePrefs>(readDevicePrefs);
    const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
    const [pendingSyncCount, setPendingSyncCount] = useState<number | null>(null);

    useEffect(() => {
        if (settingsData && !settingsRestart.dirty) {
            settingsRestart.markSaved({ settings: settingsData, key: localGeminiKey, device: devicePrefs });
            setSettings(settingsData);
        }
    }, [settingsData]);

    const refreshPendingSyncCount = useCallback(async () => {
        try {
            setPendingSyncCount(await offlineDb.getQueueCount());
        } catch {
            setPendingSyncCount(null);
        }
    }, []);

    useEffect(() => {
        void refreshPendingSyncCount();
        const update = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, [refreshPendingSyncCount]);

    const [isLoadingPrice, setIsLoadingPrice] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isMaintenanceAction, setIsMaintenanceAction] = useState(false);
    const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
    const [isImageOptimizationOpen, setIsImageOptimizationOpen] = useState(false);
    const [imageOptimizationFilter, setImageOptimizationFilter] = useState('');
    const [imageOptimizationPreview, setImageOptimizationPreview] = useState<Product[]>([]);
    const [selectedImageUrls, setSelectedImageUrls] = useState<Set<string>>(new Set());
    const [forceSelectedOptimization, setForceSelectedOptimization] = useState(false);
    const [imageOptimizationHistory, setImageOptimizationHistory] = useState<ImageOptimizationHistoryEntry[]>(() => {
        try {
            const stored = localStorage.getItem(IMAGE_OPTIMIZATION_HISTORY_KEY);
            const parsed = stored ? JSON.parse(stored) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });

    // Backup progress modal state
    const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);
    const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
    const [backupModalTitle, setBackupModalTitle] = useState('');
    const [backupComplete, setBackupComplete] = useState(false);
    const [backupSummary, setBackupSummary] = useState('');
    const [backupErrors, setBackupErrors] = useState<Array<{ table: string; message: string }>>([]);
    const [isBackupManagerOpen, setIsBackupManagerOpen] = useState(false);
    const [backupManagerMode, setBackupManagerMode] = useState<'export' | 'restore'>('export');
    const [pendingRestoreData, setPendingRestoreData] = useState<unknown>(null);
    const [pendingEncryptedBackup, setPendingEncryptedBackup] = useState<Uint8Array | null>(null);
    const settingsRestart = useRestartDraft('Ρυθμίσεις', { settings: settings, key: localGeminiKey, device: devicePrefs }, { enabled: !!settings, busy: isSaving || isMaintenanceAction || isExporting });

    const filteredImageOptimizationPreview = useMemo(() => {
        const filter = imageOptimizationFilter.trim().toUpperCase();
        const filtered = filter
            ? imageOptimizationPreview.filter(product => product.sku.toUpperCase().includes(filter))
            : imageOptimizationPreview;
        return filtered.slice(0, 200);
    }, [imageOptimizationFilter, imageOptimizationPreview]);

    if (loadingSettings || !settings) {
        return <IliosLoader variant="section" detail="Ρυθμίσεις" />;
    }

    const pricingError = validatePricingRules({ ...DEFAULT_PRICING_RULES, ...settings.pricing_rules });
    const silverError = isPositive(settings.silver_price_gram) ? null : 'Η τιμή ασημιού πρέπει να είναι μεγαλύτερη του 0.';
    const labelsError = [settings.barcode_width_mm, settings.barcode_height_mm, settings.retail_barcode_width_mm, settings.retail_barcode_height_mm].every(isPositive)
        ? null
        : 'Οι διαστάσεις ετικετών πρέπει να είναι μεγαλύτερες του 0.';
    const tabErrors: Partial<Record<SettingsTab, string | null>> = { pricing: silverError || pricingError, labels: labelsError };
    const isDirty = settingsRestart.dirty;

    const updateSettings = (patch: Partial<GlobalSettings>) => setSettings({ ...settings, ...patch });
    const updateLabelPrefs = (patch: Partial<LabelPrintSettings>) => setDevicePrefs(prev => ({ ...prev, labels: { ...prev.labels, ...patch } }));

    const silverBase = settings.last_calc_silver_price;
    const silverDelta = isPositive(settings.silver_price_gram) && isPositive(silverBase)
        ? (settings.silver_price_gram - silverBase) / silverBase
        : null;

    const fetchLivePrice = async () => {
        setIsLoadingPrice(true);
        try {
            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/price/silver`, {
                method: 'GET',
                headers: { 'Authorization': AUTH_KEY_SECRET }
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch price');
            }

            const finalPrice = parseFloat(data.price.toFixed(3));
            // Persist only the price on top of the stored settings, so unsaved edits elsewhere on the page stay a draft.
            const stored = { ...(settingsData ?? settings), silver_price_gram: finalPrice };
            await api.updateSettings(stored);

            setSettings(prev => prev ? { ...prev, silver_price_gram: finalPrice } : prev);
            settingsRestart.markSaved((saved: { settings: GlobalSettings }) => ({ ...saved, settings: { ...saved.settings, silver_price_gram: finalPrice } }));
            queryClient.setQueryData(['settings'], stored);
            showToast(`Η τιμή ενημερώθηκε: ${formatDecimal(finalPrice, 3)} €/g`, 'success');
        } catch (error: any) {
            showToast(`Σφάλμα: ${error.message}`, 'error');
        } finally {
            setIsLoadingPrice(false);
        }
    };

    const handleSaveSettings = async () => {
        const invalidTab = SETTINGS_TABS.find(tab => tabErrors[tab.id]);
        if (invalidTab) {
            setActiveTab(invalidTab.id);
            showToast(tabErrors[invalidTab.id]!, 'error');
            return;
        }
        setIsSaving(true);
        try {
            // Κεντρική αποθήκευση για τοπικά και απομακρυσμένα δεδομένα.
            await api.updateSettings(settings);
            writeDevicePrefs(devicePrefs);

            const keyChanged = localGeminiKey !== savedGeminiKey;
            if (keyChanged) {
                localStorage.setItem('VITE_GEMINI_API_KEY', localGeminiKey);
                setSavedGeminiKey(localGeminiKey);
            }
            settingsRestart.markSaved();
            await queryClient.invalidateQueries({ queryKey: ['settings'] });

            if (keyChanged) {
                requestAppRestart('Οι αλλαγές αποθηκεύτηκαν. Επανεκκινήστε όταν είστε έτοιμοι.');
                return;
            }
            showToast("Οι ρυθμίσεις αποθηκεύτηκαν.", 'success');
        } catch (err: any) {
            showToast(err?.message ? `Σφάλμα κατά την αποθήκευση: ${err.message}` : "Σφάλμα κατά την αποθήκευση.", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscardChanges = () => {
        const restored = { settings: settingsData ?? settings, key: savedGeminiKey, device: readDevicePrefs() };
        setSettings(restored.settings);
        setLocalGeminiKey(restored.key);
        setDevicePrefs(restored.device);
        settingsRestart.markSaved(restored);
    };

    const handleResetConnection = async () => {
        const yes = await confirm({
            title: 'Αλλαγή σύνδεσης βάσης',
            message: 'Θα διαγραφούν από αυτή τη συσκευή τα στοιχεία σύνδεσης (βάση, κλειδί εικόνων, κλειδί Gemini) και μετά την επανεκκίνηση θα εμφανιστεί η οθόνη αρχικής ρύθμισης. Τα δεδομένα στη βάση δεν επηρεάζονται.',
            isDestructive: true,
            confirmText: 'Αλλαγή σύνδεσης'
        });
        if (yes) clearConfiguration();
    };

    const runExport = async (options: BackupExportOptions, format: BackupExportKind, password?: string) => {
        setIsBackupManagerOpen(false);
        setIsExporting(true);
        setBackupProgress(null);
        setBackupComplete(false);
        setBackupSummary('');
        setBackupErrors([]);
        setBackupModalTitle(format === 'recovery' ? 'Δημιουργία Recovery Backup' : 'Εξαγωγή για ERP');
        setIsBackupModalOpen(true);
        try {
            const effectiveOptions = format === 'recovery' ? options : {
                ...options,
                includeImages: false,
                includeConfig: false,
                includeConfigSecrets: false,
                includeSyncQueue: false,
                includeLocalExtras: false,
            };
            const data = await api.getSystemExport(effectiveOptions, (p) => setBackupProgress(p));
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const failedTables = Object.entries(data._manifest?.tables ?? {})
                .filter(([, entry]) => entry.status === 'failed')
                .map(([table, entry]) => ({ table, message: entry.error ?? 'Αποτυχία εξαγωγής' }));
            if (failedTables.length) {
                setBackupErrors(failedTables);
                throw new Error('Η εξαγωγή σταμάτησε επειδή απέτυχαν πίνακες δεδομένων.');
            }

            if (format === 'recovery') {
                if (!data._manifest?.complete) {
                    const imageErrors = data._meta.failed_images.map((image) => ({ table: '_images', message: image }));
                    setBackupErrors(imageErrors);
                    throw new Error('Το πλήρες backup δεν δημιουργήθηκε επειδή απέτυχαν εικόνες.');
                }
                let packageBytes = await createRecoveryBundle(data);
                if (password) packageBytes = await encryptBackupPackage(packageBytes, password);
                const blob = new Blob([packageBytes.buffer.slice(
                    packageBytes.byteOffset,
                    packageBytes.byteOffset + packageBytes.byteLength,
                ) as ArrayBuffer], { type: 'application/octet-stream' });
                downloadBlob(blob, `ilios_erp_backup_${timestamp}.iliosbackup`);
                const meta = data._meta;
                let summary = `${formatNumber(meta.total_tables)} πίνακες, ${formatNumber(Object.values(meta.table_counts).reduce((a, b) => a + b, 0))} εγγραφές, ${formatNumber(meta.image_count)} εικόνες`;
                if (password) summary += ' · κρυπτογραφημένο';
                setBackupSummary(summary);
            } else {
                const migration = buildCanonicalMigration(data.tables);
                const bundle = createMigrationBundle(migration, { includePrisma: format === 'prisma' });
                downloadBlob(
                    new Blob([bundle.buffer.slice(bundle.byteOffset, bundle.byteOffset + bundle.byteLength) as ArrayBuffer], { type: 'application/zip' }),
                    `ilios_${format}_export_${timestamp}.zip`,
                );
                setBackupSummary(format === 'prisma'
                    ? 'Το πακέτο PRISMA Win δημιουργήθηκε με οδηγό αντιστοίχισης.'
                    : 'Το καθολικό πακέτο μεταφοράς ERP δημιουργήθηκε.');
            }
            setBackupComplete(true);
        } catch (error: any) {
            setBackupSummary(error?.message || (format === 'recovery' ? 'Σφάλμα κατά τη δημιουργία backup.' : 'Σφάλμα κατά την εξαγωγή ERP.'));
            setBackupComplete(true);
        } finally {
            setIsExporting(false);
        }
    };

    const runRestore = async (backupData: unknown, options: BackupRestoreOptions) => {
        setIsBackupManagerOpen(false);
        const isPartial = options.tables.length < Object.keys((backupData as any)?.tables ?? backupData ?? {}).length;

        const confirmed = await confirm({
            title: isPartial ? 'ΕΠΙΛΟΓΙΚΗ ΕΠΑΝΑΦΟΡΑ' : 'ΠΡΟΣΟΧΗ: ΕΠΑΝΑΦΟΡΑ BACKUP',
            message: isPartial
                ? `Θα αντικατασταθούν ${formatNumber(options.tables.length)} πίνακες. Τα υπόλοιπα δεδομένα παραμένουν.\n\nΣυνέχεια;`
                : `Αυτή η ενέργεια θα αντικαταστήσει τα δεδομένα των επιλεγμένων πινάκων.${options.restoreConfig ? '\n\nΘα αντικατασταθούν και οι ρυθμίσεις σύνδεσης.' : ''}\n\nΕίστε σίγουροι;`,
            isDestructive: true,
            confirmText: 'ΝΑΙ, ΕΠΑΝΑΦΟΡΑ',
        });
        if (!confirmed) return;

        setBackupProgress(null);
        setBackupComplete(false);
        setBackupSummary('');
        setBackupErrors([]);
        setBackupModalTitle('Επαναφορά Backup');
        setIsBackupModalOpen(true);
        setIsMaintenanceAction(true);

        try {
            if ((options.mode ?? 'merge') !== 'merge') {
                setBackupModalTitle('Safety snapshot πριν την επαναφορά');
                const safety = await api.getFullSystemExport((progress) => setBackupProgress(progress));
                if (!safety._manifest?.complete) {
                    throw new Error('Η καταστροφική επαναφορά ακυρώθηκε: δεν δημιουργήθηκε πλήρες safety snapshot.');
                }
                const safetyBytes = await createRecoveryBundle(safety);
                downloadBlob(
                    new Blob([safetyBytes.buffer.slice(safetyBytes.byteOffset, safetyBytes.byteOffset + safetyBytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
                    `ilios_pre_restore_${new Date().toISOString().replace(/[:.]/g, '-')}.iliosbackup`,
                );
                setBackupModalTitle('Επαναφορά Backup');
                setBackupProgress(null);
            }
            const result = await api.restoreSystem(backupData as any, {
                ...options,
                onProgress: (p) => setBackupProgress(p),
            });

            if (result.errors.length > 0) {
                setBackupErrors(result.errors);
                const imgNote = result.imageFailures.length > 0 ? ` (${formatNumber(result.imageFailures.length)} εικόνες απέτυχαν)` : '';
                setBackupSummary(`Η επαναφορά ολοκληρώθηκε με ${formatNumber(result.errors.length)} προειδοποιήσεις${imgNote}.`);
            } else {
                const resetCount = result.auth?.passwordResetRequired.length ?? 0;
                setBackupSummary(resetCount > 0
                    ? `Η επαναφορά ολοκληρώθηκε. ${formatNumber(resetCount)} χρήστες πρέπει να ορίσουν νέο κωδικό μέσω του email επαναφοράς.`
                    : 'Η επαναφορά ολοκληρώθηκε επιτυχώς! Το ERP θα ανανεωθεί.');
                requestAppRestart('Οι αλλαγές αποθηκεύτηκαν. Επανεκκινήστε όταν είστε έτοιμοι.');
            }
            setBackupComplete(true);
        } catch (error: any) {
            setBackupSummary(error?.message || 'Σφάλμα κατά την επαναφορά.');
            setBackupComplete(true);
        } finally {
            setIsMaintenanceAction(false);
            setPendingRestoreData(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRestoreFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (isEncryptedBackupPackage(bytes)) {
                setPendingRestoreData(null);
                setPendingEncryptedBackup(bytes);
                setBackupManagerMode('restore');
                setIsBackupManagerOpen(true);
                return;
            }
            const backupData = await readBackupBytes(bytes);
            setPendingRestoreData(backupData);
            setBackupManagerMode('restore');
            setIsBackupManagerOpen(true);
        } catch {
            showToast('Το αρχείο ή ο κωδικός backup δεν είναι έγκυρος.', 'error');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleForceSync = async () => {
        setIsMaintenanceAction(true);
        try {
            const result = await api.syncOfflineData();
            if (result.wasQueueEmpty) {
                showToast("Δεν υπάρχουν εκκρεμείς αλλαγές προς συγχρονισμό.", "info");
            } else if (result.syncedCount > 0 && result.remainingCount === 0) {
                showToast(`Συγχρονίστηκαν ${formatNumber(result.syncedCount)} εκκρεμείς αλλαγές!`, "success");
                queryClient.invalidateQueries();
            } else if (result.syncedCount > 0 && result.remainingCount > 0) {
                showToast(`Συγχρονίστηκαν ${formatNumber(result.syncedCount)} αλλαγές, αλλά ${formatNumber(result.remainingCount)} παραμένουν εκκρεμείς.`, "info");
                queryClient.invalidateQueries();
            } else if (result.remainingCount > 0) {
                showToast(`Ο συγχρονισμός δεν ολοκληρώθηκε. Παραμένουν ${formatNumber(result.remainingCount)} εκκρεμείς αλλαγές.`, "error");
            } else if (result.failedCount > 0) {
                showToast("Ο συγχρονισμός ολοκληρώθηκε με απορρίψεις αλλαγών. Ελέγξτε τα μηνύματα σφάλματος.", "error");
                queryClient.invalidateQueries();
            }
        } catch (err) {
            showToast("Σφάλμα συγχρονισμού.", "error");
        } finally {
            setIsMaintenanceAction(false);
            void refreshPendingSyncCount();
        }
    };

    const handleClearSyncQueue = async () => {
        const yes = await confirm({
            title: 'Εκκαθάριση Ουράς Συγχρονισμού',
            message: 'Αυτό θα διαγράψει ΟΛΕΣ τις εκκρεμείς αλλαγές που δεν έχουν ανέβει στην απομακρυσμένη αποθήκευση. Χρησιμοποιήστε το μόνο αν ο συγχρονισμός έχει κολλήσει μόνιμα.',
            isDestructive: true,
            confirmText: 'Εκκαθάριση'
        });
        if (yes) {
            setIsMaintenanceAction(true);
            try {
                await offlineDb.clearSyncQueue();
                await refreshPendingSyncCount();
                showToast("Η ουρά εκκαθαρίστηκε. Ο συγχρονισμός θα σταματήσει.", "success");
                requestAppRestart('Οι αλλαγές αποθηκεύτηκαν. Επανεκκινήστε όταν είστε έτοιμοι.');
            } catch (err) {
                showToast("Σφάλμα εκκαθάρισης.", "error");
                setIsMaintenanceAction(false);
            }
        }
    };

    const handleWipeCache = async () => {
        const yes = await confirm({
            title: 'Εκκαθάριση Τοπικής Μνήμης',
            message: 'Αυτό θα διαγράψει ΟΛΑ τα τοπικά δεδομένα του browser (Cache & Sync Queue). Θα πρέπει να είστε online για να ξαναφορτώσετε το ERP. Είστε σίγουροι;',
            isDestructive: true,
            confirmText: 'Διαγραφή Cache'
        });
        if (yes) {
            setIsMaintenanceAction(true);
            try {
                await offlineDb.clearAll();
                showToast("Η τοπική μνήμη εκκαθαρίστηκε. Γίνεται ανανέωση...", "success");
                requestAppRestart('Οι αλλαγές αποθηκεύτηκαν. Επανεκκινήστε όταν είστε έτοιμοι.');
            } catch (err) {
                showToast("Σφάλμα εκκαθάρισης.", "error");
                setIsMaintenanceAction(false);
            }
        }
    };

    const deleteCloudImageBestEffort = async (imageUrl: string | null | undefined) => {
        if (!imageUrl || imageUrl.startsWith('data:')) return;
        try {
            const url = new URL(imageUrl);
            const fileName = decodeURIComponent(url.pathname.slice(1));
            if (!fileName) return;
            await fetch(`${CLOUDFLARE_WORKER_URL}/${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
                headers: { 'Authorization': AUTH_KEY_SECRET },
            });
        } catch (error) {
            console.warn('Η εκκαθάριση της παλιάς εικόνας παραλείφθηκε:', error);
        }
    };

    const uploadOptimizedCloudImage = async (blob: Blob, sku: string): Promise<string> => {
        if (!navigator.onLine) throw new Error('Η βελτιστοποίηση εικόνων απαιτεί σύνδεση στο διαδίκτυο.');

        const safeSku = sku
            .replace(/[^a-zA-Z0-9-\u0370-\u03FF]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        const fileName = `${safeSku.toUpperCase()}_${Date.now()}_OPT.jpg`;
        const uploadUrl = `${CLOUDFLARE_WORKER_URL}/${encodeURIComponent(fileName)}`;
        const response = await fetch(uploadUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'image/jpeg', 'Authorization': AUTH_KEY_SECRET },
            body: blob,
        });

        if (!response.ok) throw new Error(`Η μεταφόρτωση εικόνας απέτυχε: ${formatNumber(response.status)}`);
        return uploadUrl;
    };

    const updateProductImageOnly = async (sku: string, imageUrl: string) => {
        const { error } = await supabase
            .from('products')
            .update({ image_url: imageUrl })
            .eq('sku', sku);
        if (error) throw error;
    };

    const getImageDimensions = (blob: Blob): Promise<{ width: number; height: number }> => {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve({
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                });
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Δεν ήταν δυνατή η ανάγνωση των διαστάσεων της εικόνας.'));
            };

            img.src = objectUrl;
        });
    };

    const imageNeedsOptimization = async (blob: Blob): Promise<boolean> => {
        if (blob.size >= IMAGE_OPTIMIZATION_MIN_BYTES) return true;

        const dimensions = await getImageDimensions(blob);
        return Math.max(dimensions.width, dimensions.height) > IMAGE_OPTIMIZATION_MAX_EDGE;
    };

    const getSkippedOptimizationUrls = (): Set<string> => {
        try {
            const stored = localStorage.getItem(IMAGE_OPTIMIZATION_SKIPPED_KEY);
            const urls = stored ? JSON.parse(stored) : [];
            return new Set(Array.isArray(urls) ? urls : []);
        } catch {
            return new Set();
        }
    };

    const saveSkippedOptimizationUrls = (urls: Set<string>) => {
        try {
            localStorage.setItem(
                IMAGE_OPTIMIZATION_SKIPPED_KEY,
                JSON.stringify(Array.from(urls).slice(-5000))
            );
        } catch (error) {
            console.warn('Δεν αποθηκεύτηκε η λίστα εικόνων που παραλείφθηκαν:', error);
        }
    };

    const saveImageOptimizationHistory = (entry: ImageOptimizationHistoryEntry) => {
        const next = [entry, ...imageOptimizationHistory].slice(0, 20);
        setImageOptimizationHistory(next);
        try {
            localStorage.setItem(IMAGE_OPTIMIZATION_HISTORY_KEY, JSON.stringify(next));
        } catch (error) {
            console.warn('Δεν αποθηκεύτηκε το ιστορικό βελτιστοποίησης εικόνων:', error);
        }
    };

    const getRemoteProductImages = (
        products: Product[],
        skippedUrls: Set<string>,
        options: { includeSkipped?: boolean; includeOptimized?: boolean } = {}
    ) => {
        return products.filter((product: Product) => {
            const imageUrl = product.image_url || '';
            return Boolean(imageUrl)
                && !imageUrl.startsWith('data:')
                && imageUrl.startsWith(CLOUDFLARE_WORKER_URL)
                && (options.includeOptimized || !decodeURIComponent(imageUrl).includes('_OPT.'))
                && (options.includeSkipped || !skippedUrls.has(imageUrl));
        });
    };

    const loadImageOptimizationPreview = async () => {
        setIsMaintenanceAction(true);
        try {
            const products = await api.getProducts();
            const skippedUrls = getSkippedOptimizationUrls();
            const candidates = getRemoteProductImages(products, skippedUrls, {
                includeSkipped: true,
                includeOptimized: true,
            });
            setImageOptimizationPreview(candidates);
            setSelectedImageUrls(new Set());
            showToast(`Φορτώθηκαν ${formatNumber(candidates.length)} εικόνες. Το φίλτρο SKU δουλεύει πλέον άμεσα.`, 'success');
        } catch (error) {
            console.error(error);
            showToast('Δεν φορτώθηκε η λίστα εικόνων.', 'error');
        } finally {
            setIsMaintenanceAction(false);
        }
    };

    const openImageOptimizationModal = () => {
        setIsImageOptimizationOpen(true);
        if (imageOptimizationPreview.length === 0) {
            window.setTimeout(() => {
                void loadImageOptimizationPreview();
            }, 0);
        }
    };

    const toggleSelectedImageUrl = (imageUrl: string) => {
        setSelectedImageUrls(prev => {
            const next = new Set(prev);
            if (next.has(imageUrl)) next.delete(imageUrl);
            else next.add(imageUrl);
            return next;
        });
    };

    const handleOptimizeProductImages = async (scope: 'smart' | 'selected' = 'smart') => {
        const selectedUrls = new Set(selectedImageUrls);
        const isSelectedScope = scope === 'selected';
        if (isSelectedScope && selectedUrls.size === 0) {
            showToast('Επιλέξτε πρώτα εικόνες από τη λίστα.', 'info');
            return;
        }

        const yes = await confirm({
            title: 'Βελτιστοποίηση εικόνων προϊόντων',
            message: isSelectedScope
                ? `Θα βελτιστοποιηθούν οι ${formatNumber(selectedUrls.size)} επιλεγμένες εικόνες${forceSelectedOptimization ? ', ακόμη κι αν δεν ξεπερνούν τα αυτόματα όρια' : ' με βάση τα αυτόματα όρια'}. Κρατήστε αυτό το παράθυρο ανοιχτό μέχρι να ολοκληρωθεί.`
                : `Θα ελεγχθεί όλη η βιβλιοθήκη εικόνων προϊόντων σε παρτίδες των ${formatNumber(IMAGE_OPTIMIZATION_BATCH_SIZE)}, χωρίς να χρειάζεται να πατήσετε ξανά το κουμπί. Θα αλλαχθούν μόνο όσες είναι πραγματικά βαριές ή πολύ μεγάλες σε διαστάσεις. Κρατήστε αυτό το παράθυρο ανοιχτό μέχρι να ολοκληρωθεί.`,
            confirmText: 'Βελτιστοποίηση'
        });
        if (!yes) return;

        setIsMaintenanceAction(true);
        let optimized = 0;
        let skipped = 0;
        let failed = 0;
        let savedBytes = 0;

        try {
            const skippedUrls = getSkippedOptimizationUrls();
            const products = await api.getProducts();
            const allTargets = isSelectedScope
                ? products.filter((product: Product) => product.image_url && selectedUrls.has(product.image_url))
                : getRemoteProductImages(products, skippedUrls);
            const minKb = Math.round(IMAGE_OPTIMIZATION_MIN_BYTES / 1024);

            if (allTargets.length === 0) {
                showToast('Δεν βρέθηκαν εικόνες προϊόντων στην απομακρυσμένη αποθήκευση για βελτιστοποίηση.', 'info');
                return;
            }

            showToast(`Ξεκίνησε ο έλεγχος ${formatNumber(allTargets.length)} εικόνων. Θα αλλαχθούν μόνο όσες είναι πάνω από ${formatNumber(minKb)}KB ή ${formatNumber(IMAGE_OPTIMIZATION_MAX_EDGE)}px.`, 'info');

            for (let index = 0; index < allTargets.length; index += 1) {
                const product = allTargets[index];
                try {
                    const response = await fetch(product.image_url!);
                    if (!response.ok) throw new Error(`Η λήψη εικόνας απέτυχε: ${formatNumber(response.status)}`);

                    const originalBlob = await response.blob();
                    const needsOptimization = forceSelectedOptimization && isSelectedScope ? true : await imageNeedsOptimization(originalBlob);
                    if (!needsOptimization) {
                        skipped += 1;
                        skippedUrls.add(product.image_url!);
                        continue;
                    }

                    const sourceFile = new File([originalBlob], `${product.sku}.jpg`, {
                        type: originalBlob.type || 'image/jpeg',
                    });
                    const compressedBlob = await compressImage(sourceFile);

                    if (compressedBlob.size >= originalBlob.size * 0.92) {
                        skipped += 1;
                        skippedUrls.add(product.image_url!);
                        continue;
                    }

                    const oldUrl = product.image_url;
                    const newUrl = await uploadOptimizedCloudImage(compressedBlob, product.sku);

                    await updateProductImageOnly(product.sku, newUrl);

                    optimized += 1;
                    savedBytes += Math.max(0, originalBlob.size - compressedBlob.size);
                    await deleteCloudImageBestEffort(oldUrl);
                } catch (error) {
                    failed += 1;
                    console.warn(`Η βελτιστοποίηση εικόνας απέτυχε για ${product.sku}:`, error);
                }

                const processed = index + 1;
                if (processed % IMAGE_OPTIMIZATION_BATCH_SIZE === 0 && processed < allTargets.length) {
                    saveSkippedOptimizationUrls(skippedUrls);
                    showToast(`Πρόοδος: ${formatNumber(processed)}/${formatNumber(allTargets.length)}. Βελτιστοποιήθηκαν ${formatNumber(optimized)}, παραλείφθηκαν ${formatNumber(skipped)}, απέτυχαν ${formatNumber(failed)}.`, 'info');
                    await waitForBrowserIdle();
                }
            }

            saveSkippedOptimizationUrls(skippedUrls);
            await queryClient.invalidateQueries({ queryKey: ['products'] });
            const savedMb = (savedBytes / 1024 / 1024).toFixed(1);
            saveImageOptimizationHistory({
                id: `${Date.now()}`,
                date: new Date().toISOString(),
                mode: isSelectedScope ? (forceSelectedOptimization ? 'Επιλεγμένες - αναγκαστικά' : 'Επιλεγμένες - έξυπνα') : 'Αυτόματος έλεγχος',
                checked: allTargets.length,
                optimized,
                skipped,
                failed,
                savedMb,
            });
            setSelectedImageUrls(new Set());
            setImageOptimizationPreview(prev => prev.filter(product => !product.image_url || !selectedUrls.has(product.image_url)));
            showToast(`Ολοκληρώθηκε. Βελτιστοποιήθηκαν ${formatNumber(optimized)}, παραλείφθηκαν ${formatNumber(skipped)}, απέτυχαν ${formatNumber(failed)}. Εξοικονομήθηκαν περίπου ${formatDecimal(Number(savedMb), 1)} MB.`, failed ? 'info' : 'success');
        } catch (error) {
            console.error(error);
            showToast('Η βελτιστοποίηση εικόνων απέτυχε.', 'error');
        } finally {
            setIsMaintenanceAction(false);
        }
    };

    const renderPricingTab = () => (
        <div className="space-y-6">
            <SettingsCard
                icon={TrendingUp}
                tone="amber"
                title="Τιμή ασημιού"
                description="Η τρέχουσα τιμή ανά γραμμάριο που χρησιμοποιείται σε όλους τους υπολογισμούς κόστους."
                actions={(
                    <button type="button" onClick={fetchLivePrice} disabled={isLoadingPrice || !isOnline} className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50">
                        {isLoadingPrice ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Λήψη ζωντανής τιμής
                    </button>
                )}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-end">
                    <NumberField
                        label="Τιμή ασημιού"
                        unit="€/g"
                        step="0.001"
                        value={settings.silver_price_gram}
                        invalid={!!silverError}
                        onChange={value => updateSettings({ silver_price_gram: value })}
                    />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium text-slate-500">Βάση τελευταίου επανυπολογισμού</span>
                            <span className="font-mono font-bold text-slate-800">{formatDecimal(silverBase, 3)} €/g</span>
                        </div>
                        {silverDelta !== null && (
                            <p className={`mt-1 text-xs font-bold ${Math.abs(silverDelta) < 0.0005 ? 'text-slate-500' : silverDelta > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {Math.abs(silverDelta) < 0.0005 ? 'Ίδια με τη βάση του καταλόγου.' : `${silverDelta > 0 ? '+' : ''}${formatDecimal(silverDelta * 100, 1)}% σε σχέση με τη βάση. Ενημερώστε τις τιμές από την «Τιμολόγηση».`}
                            </p>
                        )}
                    </div>
                </div>
                {silverError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{silverError}</p>}
            </SettingsCard>

            <PricingRulesSettings settings={settings} onChange={setSettings} />
        </div>
    );

    const renderLabelsTab = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <SettingsCard icon={Tag} tone="amber" title="Ετικέτα χονδρικής" description="Διαστάσεις της ετικέτας για κοσμήματα χονδρικής.">
                    <div className="space-y-4">
                        <LabelPreview width={settings.barcode_width_mm} height={settings.barcode_height_mm} tone="amber" />
                        <div className="grid grid-cols-2 gap-3">
                            <NumberField label="Πλάτος" unit="mm" step="0.5" value={settings.barcode_width_mm} invalid={!isPositive(settings.barcode_width_mm)} onChange={value => updateSettings({ barcode_width_mm: value })} />
                            <NumberField label="Ύψος" unit="mm" step="0.5" value={settings.barcode_height_mm} invalid={!isPositive(settings.barcode_height_mm)} onChange={value => updateSettings({ barcode_height_mm: value })} />
                        </div>
                    </div>
                </SettingsCard>
                <SettingsCard icon={Tag} tone="purple" title="Ετικέτα λιανικής" description="Διαστάσεις της ετικέτας για πώληση λιανικής.">
                    <div className="space-y-4">
                        <LabelPreview width={settings.retail_barcode_width_mm} height={settings.retail_barcode_height_mm} tone="purple" />
                        <div className="grid grid-cols-2 gap-3">
                            <NumberField label="Πλάτος" unit="mm" step="0.5" value={settings.retail_barcode_width_mm} invalid={!isPositive(settings.retail_barcode_width_mm)} onChange={value => updateSettings({ retail_barcode_width_mm: value })} />
                            <NumberField label="Ύψος" unit="mm" step="0.5" value={settings.retail_barcode_height_mm} invalid={!isPositive(settings.retail_barcode_height_mm)} onChange={value => updateSettings({ retail_barcode_height_mm: value })} />
                        </div>
                    </div>
                </SettingsCard>
            </div>
            {labelsError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{labelsError}</p>}

            <SettingsCard
                icon={Printer}
                tone="slate"
                title="Προεπιλογές εκτύπωσης"
                description="Οι αρχικές επιλογές στην Εκτύπωση ετικετών και στο Μητρώο. Ισχύουν για αυτή τη συσκευή και αλλάζουν και από την ίδια την εκτύπωση."
            >
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <Segmented
                        label="Τύπος ετικέτας"
                        value={devicePrefs.labels.format}
                        options={[{ value: 'standard', label: 'Χονδρική' }, { value: 'retail', label: 'Λιανική' }]}
                        onChange={format => updateLabelPrefs({ format })}
                    />
                    <Segmented
                        label="Τιμή που τυπώνεται"
                        value={devicePrefs.labels.priceTier}
                        disabled={!devicePrefs.labels.showPrice}
                        options={[{ value: 'wholesale', label: 'Χονδρικής' }, { value: 'retail', label: 'Λιανικής' }]}
                        onChange={priceTier => updateLabelPrefs({ priceTier })}
                    />
                    <ToggleRow title="Εμφάνιση τιμής" description="Τυπώνει την τιμή πάνω στην ετικέτα." checked={devicePrefs.labels.showPrice} onChange={showPrice => updateLabelPrefs({ showPrice })} />
                    <ToggleRow title="Κωδικοποιημένη τιμή" description="Τυπώνει κωδικό αντί για ποσό, π.χ. 32,20 € → 132209." checked={devicePrefs.labels.codifiedPrice} disabled={!devicePrefs.labels.showPrice} onChange={codifiedPrice => updateLabelPrefs({ codifiedPrice })} />
                </div>
            </SettingsCard>
        </div>
    );

    const renderDeviceTab = () => (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SettingsCard icon={connection.localMode ? Server : Cloud} tone="blue" title="Σύνδεση" description="Πώς είναι συνδεδεμένη αυτή η συσκευή.">
                <div className="divide-y divide-slate-100">
                    <InfoRow label="Λειτουργία" value={connection.localMode ? 'Τοπική (χωρίς cloud)' : 'Cloud'} />
                    {!connection.localMode && <InfoRow label="Βάση δεδομένων" value={connection.databaseHost || '—'} ok={!!connection.databaseHost} />}
                    <InfoRow label="Κατάσταση δικτύου" value={isOnline ? 'Online' : 'Offline'} ok={isOnline} />
                    <InfoRow label="Αποθήκευση εικόνων" value={connection.workerKeyConfigured ? 'Ρυθμισμένη' : 'Χωρίς κλειδί'} ok={connection.workerKeyConfigured} />
                    <InfoRow label="Εκκρεμείς αλλαγές" value={pendingSyncCount === null ? '—' : formatNumber(pendingSyncCount)} ok={pendingSyncCount === null ? undefined : pendingSyncCount === 0} />
                    <InfoRow label="Έκδοση εφαρμογής" value={<span className="font-mono">{APP_BUILD_ID}</span>} />
                </div>
            </SettingsCard>

            <div className="space-y-6">
                <SettingsCard icon={Key} tone="indigo" title="Κλειδί Gemini API" description="Χρησιμοποιείται για τις λειτουργίες AI (περιγραφές, ανάλυση εικόνων).">
                    {connection.geminiKeyFromEnv ? (
                        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Το κλειδί ορίζεται από τη διαμόρφωση της εγκατάστασης και δεν αλλάζει από εδώ.</p>
                    ) : (
                        <>
                            <span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
                                <input
                                    type={showGeminiKey ? 'text' : 'password'}
                                    value={localGeminiKey}
                                    onChange={(e) => setLocalGeminiKey(e.target.value)}
                                    placeholder="AIzaSy..."
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-label="Κλειδί Gemini API"
                                    className="min-w-0 w-full bg-transparent py-3 font-mono text-sm text-slate-900 outline-none"
                                />
                                <button type="button" onClick={() => setShowGeminiKey(v => !v)} aria-label={showGeminiKey ? 'Απόκρυψη κλειδιού' : 'Εμφάνιση κλειδιού'} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                                    {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </span>
                            <p className="mt-2 text-xs text-slate-500">Αποθηκεύεται μόνο σε αυτή τη συσκευή. Η αλλαγή ισχύει μετά από επανεκκίνηση.</p>
                        </>
                    )}
                </SettingsCard>

                <SettingsCard icon={HardDrive} tone="emerald" title="Εικόνες σε αυτή τη συσκευή">
                    <ToggleRow
                        title="Τοπική αποθήκευση νέων εικόνων"
                        description="Οι νέες φωτογραφίες προϊόντων αποθηκεύονται στη βάση (WebP) αντί για το cloud, μειώνοντας τις κλήσεις στο διαδίκτυο. Χωρίς σύνδεση αυτό γίνεται πάντα."
                        checked={devicePrefs.localImages}
                        onChange={localImages => setDevicePrefs(prev => ({ ...prev, localImages }))}
                    />
                </SettingsCard>
            </div>
        </div>
    );

    const renderDataTab = () => (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SettingsCard icon={Database} tone="blue" title="Αντίγραφα ασφαλείας & εξαγωγή" description="Πλήρες backup για επαναφορά ή πακέτο μεταφοράς για άλλο ERP.">
                <div className="space-y-3">
                    <ActionTile
                        icon={Download}
                        tone="blue"
                        title="Δημιουργία backup / εξαγωγή"
                        description="Επιλογή περιεχομένου, κρυπτογράφηση, ERP & PRISMA Win."
                        busy={isExporting}
                        disabled={isExporting || isMaintenanceAction}
                        onClick={() => { setBackupManagerMode('export'); setIsBackupManagerOpen(true); }}
                    />
                    <ActionTile
                        icon={Upload}
                        tone="indigo"
                        title="Επαναφορά από backup"
                        description="Από αρχείο .iliosbackup / .json ή από αυτόματο backup."
                        disabled={isMaintenanceAction || isExporting}
                        onClick={() => fileInputRef.current?.click()}
                    />
                </div>
            </SettingsCard>

            <SettingsCard icon={Clock} tone="slate" title="Ιστορικό ενεργειών" description="Ποιος άλλαξε τι και πότε στο σύστημα.">
                <ActionTile icon={Clock} tone="slate" title="Άνοιγμα ιστορικού" description="Αναζήτηση στο αρχείο καταγραφής ενεργειών." onClick={() => setIsAuditLogsOpen(true)} />
            </SettingsCard>
        </div>
    );

    const renderMaintenanceTab = () => (
        <div className="space-y-6">
            <SettingsCard icon={Wrench} tone="emerald" title="Εργαλεία συντήρησης" description="Ασφαλείς ενέργειες που μπορείτε να εκτελέσετε οποτεδήποτε.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ActionTile
                        icon={isOnline ? RefreshCw : WifiOff}
                        tone="emerald"
                        title="Συγχρονισμός εκκρεμοτήτων"
                        description={isOnline ? 'Ανεβάζει τώρα τις αλλαγές που περιμένουν στην ουρά.' : 'Απαιτείται σύνδεση στο διαδίκτυο.'}
                        busy={isMaintenanceAction}
                        disabled={isMaintenanceAction || !isOnline}
                        onClick={handleForceSync}
                        trailing={pendingSyncCount ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">{formatNumber(pendingSyncCount)}</span> : null}
                    />
                    <ActionTile
                        icon={ImageIcon}
                        tone="emerald"
                        title="Βελτιστοποίηση εικόνων προϊόντων"
                        description="Συμπίεση βαριών εικόνων στο cloud χωρίς αλλαγή στα προϊόντα."
                        disabled={isMaintenanceAction || !isOnline}
                        onClick={openImageOptimizationModal}
                    />
                </div>
            </SettingsCard>

            <section className="overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-sm">
                <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50/60 p-5 md:px-6">
                    <div className="rounded-2xl bg-rose-100 p-3 text-rose-700"><AlertTriangle size={20} /></div>
                    <div>
                        <h2 className="text-base font-bold text-slate-800">Ζώνη κινδύνου</h2>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">Χρησιμοποιήστε τις μόνο αν κάτι έχει κολλήσει. Ζητείται επιβεβαίωση πριν από κάθε ενέργεια.</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3 md:p-6">
                    <ActionTile icon={AlertTriangle} tone="amber" title="Εκκαθάριση ουράς" description="Διαγράφει εκκρεμείς αλλαγές που δεν έχουν ανέβει." disabled={isMaintenanceAction} onClick={handleClearSyncQueue} />
                    <ActionTile icon={Trash2} tone="rose" title="Εκκαθάριση cache" description="Σβήνει όλα τα τοπικά δεδομένα αυτής της συσκευής." disabled={isMaintenanceAction} onClick={handleWipeCache} />
                    <ActionTile icon={Unplug} tone="rose" title="Αλλαγή σύνδεσης" description="Αφαιρεί τα στοιχεία σύνδεσης από αυτή τη συσκευή." disabled={isMaintenanceAction || isSaving} onClick={handleResetConnection} />
                </div>
            </section>
        </div>
    );

    const tabContent: Record<SettingsTab, () => React.ReactNode> = {
        pricing: renderPricingTab,
        labels: renderLabelsTab,
        device: renderDeviceTab,
        data: renderDataTab,
        maintenance: renderMaintenanceTab,
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-8">
            <DesktopPageHeader
                icon={SettingsIcon}
                title="Ρυθμίσεις Συστήματος"
                subtitle="Παράμετροι τιμολόγησης και διαχείριση δεδομένων."
                below={(
                    <div role="tablist" aria-label="Ενότητες ρυθμίσεων" className={BELOW_TAB_CONTAINER}>
                        {SETTINGS_TABS.map(({ id, label, icon: TabIcon }) => (
                            <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} className={belowTabButton(activeTab === id)}>
                                <TabIcon size={16} /> {label}
                                {tabErrors[id] ? <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Χρειάζεται διόρθωση" /> : null}
                            </button>
                        ))}
                    </div>
                )}
            />

            <div role="tabpanel" aria-label={SETTINGS_TABS.find(tab => tab.id === activeTab)?.label}>
                {tabContent[activeTab]()}
            </div>

            <input type="file" accept=".json,.iliosbackup" className="hidden" ref={fileInputRef} onChange={handleRestoreFilePick} />

            {isDirty && (
                <div className="sticky bottom-6 z-30 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-3 pl-5 text-white shadow-2xl">
                        <span className="flex items-center gap-2 text-sm font-bold">
                            <span className="h-2 w-2 rounded-full bg-amber-400" /> Υπάρχουν μη αποθηκευμένες αλλαγές
                        </span>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={handleDiscardChanges} disabled={isSaving} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50">
                                <RotateCcw size={16} /> Απόρριψη
                            </button>
                            <button type="button" onClick={handleSaveSettings} disabled={isSaving} className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 px-5 py-2.5 text-sm font-bold text-[#060b00] shadow-lg transition hover:brightness-105 disabled:opacity-50">
                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isImageOptimizationOpen && (
                <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-5xl max-h-[88vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-4 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                                    <ImageIcon size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Βελτιστοποίηση Εικόνων Προϊόντων</h3>
                                    <p className="text-sm text-slate-500">Έλεγχος, επιλογή και συμπίεση εικόνων χωρίς να αλλάζουν τα προϊόντα.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsImageOptimizationOpen(false)} disabled={isMaintenanceAction} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 overflow-hidden">
                            <div className="min-h-0 flex flex-col gap-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <button onClick={() => handleOptimizeProductImages('smart')} disabled={isMaintenanceAction} className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50">
                                        {isMaintenanceAction ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Αυτόματος έλεγχος
                                    </button>
                                    <button onClick={loadImageOptimizationPreview} disabled={isMaintenanceAction} className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 disabled:opacity-50">
                                        <Search size={16} /> Φόρτωση λίστας
                                    </button>
                                    <button onClick={() => handleOptimizeProductImages('selected')} disabled={isMaintenanceAction || selectedImageUrls.size === 0} className="flex items-center justify-center gap-2 p-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50">
                                        <CheckSquare size={16} /> Επιλεγμένες ({formatNumber(selectedImageUrls.size)})
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            type="text"
                                            value={imageOptimizationFilter}
                                            onChange={(e) => setImageOptimizationFilter(e.target.value)}
                                            placeholder="Φίλτρο SKU, π.χ. DM, KN, SK..."
                                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-emerald-500/20 text-sm font-medium"
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3">
                                        <input
                                            type="checkbox"
                                            checked={forceSelectedOptimization}
                                            onChange={(e) => setForceSelectedOptimization(e.target.checked)}
                                            className="w-4 h-4 accent-emerald-500"
                                        />
                                        Αναγκαστικά για επιλεγμένες
                                    </label>
                                </div>

                                <div className="border border-slate-100 rounded-2xl overflow-hidden min-h-[320px] bg-slate-50">
                                    <div className="max-h-[42vh] overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {imageOptimizationPreview.length > 0 && (
                                            <div className="col-span-full text-xs font-bold text-slate-500 px-1">
                                                Εμφανίζονται {formatNumber(filteredImageOptimizationPreview.length)} από {formatNumber(imageOptimizationPreview.length)} εικόνες{imageOptimizationFilter.trim() ? ` για "${imageOptimizationFilter.trim().toUpperCase()}"` : ''}.
                                            </div>
                                        )}
                                        {imageOptimizationPreview.length === 0 ? (
                                            <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                                                <ImageIcon size={36} className="text-slate-300" />
                                                <p className="font-bold">Φορτώστε λίστα για χειροκίνητη επιλογή.</p>
                                                <p className="text-xs text-slate-500">Μετά τη φόρτωση, το φίλτρο SKU ενημερώνει άμεσα τη λίστα.</p>
                                            </div>
                                        ) : filteredImageOptimizationPreview.length === 0 ? (
                                            <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                                                <Search size={36} className="text-slate-300" />
                                                <p className="font-bold">Δεν βρέθηκαν εικόνες για αυτό το φίλτρο.</p>
                                            </div>
                                        ) : filteredImageOptimizationPreview.map(product => {
                                            const imageUrl = product.image_url || '';
                                            const selected = selectedImageUrls.has(imageUrl);
                                            return (
                                                <button
                                                    key={`${product.sku}-${imageUrl}`}
                                                    onClick={() => toggleSelectedImageUrl(imageUrl)}
                                                    className={`text-left bg-white rounded-xl border overflow-hidden shadow-sm transition-all ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-100 hover:border-slate-300'}`}
                                                >
                                                    <div className="aspect-square bg-slate-100 overflow-hidden">
                                                        <img src={imageUrl} alt={product.sku} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                                    </div>
                                                    <div className="p-2 flex items-center justify-between gap-2">
                                                        <span className="text-xs font-black text-slate-800 truncate">{product.sku}</span>
                                                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                                                            {selected && <CheckSquare size={12} className="text-white" />}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="min-h-0 flex flex-col gap-4">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm text-emerald-900">
                                    <div className="font-black mb-2">Κριτήρια αυτόματου ελέγχου</div>
                                    <p>Αλλάζει μόνο εικόνες πάνω από {formatNumber(Math.round(IMAGE_OPTIMIZATION_MIN_BYTES / 1024))}KB ή με πλευρά πάνω από {formatNumber(IMAGE_OPTIMIZATION_MAX_EDGE)}px. Οι επιλεγμένες μπορούν να γίνουν αναγκαστικά.</p>
                                </div>

                                <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden flex-1 min-h-0">
                                    <div className="p-4 border-b border-slate-100 font-black text-slate-800 flex items-center gap-2">
                                        <Clock size={16} /> Ιστορικό Βελτιστοποιήσεων
                                    </div>
                                    <div className="max-h-[44vh] overflow-y-auto p-3 space-y-2 bg-slate-50">
                                        {imageOptimizationHistory.length === 0 ? (
                                            <div className="text-sm text-slate-400 font-bold text-center py-10">Δεν υπάρχει ιστορικό ακόμα.</div>
                                        ) : imageOptimizationHistory.map(entry => (
                                            <div key={entry.id} className="bg-white border border-slate-100 rounded-xl p-3 text-xs">
                                                <div className="font-black text-slate-800">{entry.mode}</div>
                                                <div className="text-slate-500 mt-1">{new Date(entry.date).toLocaleString('el-GR')}</div>
                                                <div className="grid grid-cols-2 gap-2 mt-2 text-slate-600 font-bold">
                                                    <span>Έλεγχος: {formatNumber(entry.checked)}</span>
                                                    <span>Κέρδος: {formatDecimal(Number(entry.savedMb), 1)} MB</span>
                                                    <span>ΟΚ: {formatNumber(entry.optimized)}</span>
                                                    <span>Skip/Fail: {formatNumber(entry.skipped)}/{formatNumber(entry.failed)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isAuditLogsOpen && <AuditLogsModal onClose={() => setIsAuditLogsOpen(false)} />}

            <BackupManagerModal
                isOpen={isBackupManagerOpen}
                mode={backupManagerMode}
                restoreData={pendingRestoreData ?? undefined}
                onClose={() => { setIsBackupManagerOpen(false); setPendingRestoreData(null); setPendingEncryptedBackup(null); }}
                onRunExport={runExport}
                onRunRestore={runRestore}
                onPickRestoreFile={() => fileInputRef.current?.click()}
                onLoadAutomaticBackup={(backup) => {
                    setPendingRestoreData(backup);
                    setPendingEncryptedBackup(null);
                    setBackupManagerMode('restore');
                }}
                encryptedRestorePending={!!pendingEncryptedBackup}
                onUnlockRestore={async (password) => {
                    if (!pendingEncryptedBackup) return;
                    const backup = await readBackupBytes(pendingEncryptedBackup, password);
                    setPendingRestoreData(backup);
                    setPendingEncryptedBackup(null);
                }}
            />

            <BackupProgressModal
                isOpen={isBackupModalOpen}
                title={backupModalTitle}
                progress={backupProgress}
                isComplete={backupComplete}
                summary={backupSummary}
                errors={backupErrors}
                onClose={() => setIsBackupModalOpen(false)}
            />
        </div>
    );
}
