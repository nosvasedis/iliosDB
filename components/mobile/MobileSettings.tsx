
import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase, GEMINI_API_KEY, AUTH_KEY_SECRET, CLOUDFLARE_WORKER_URL } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { LogOut, Coins, ShieldCheck, User, Wifi, WifiOff, Upload, Save, Tag, ShoppingBag, Key, RefreshCw, Loader2, Database, Settings } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { formatDecimal } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import { downloadBlob } from '../../utils/exportUtils';
import { BackupExportOptions, BackupProgress, BackupRestoreOptions } from '../../lib/backupConfig';
import BackupManagerModal, { BackupExportKind } from '../backup/BackupManagerModal';
import { buildCanonicalMigration } from '../../lib/migrationExport';
import { createMigrationBundle, createRecoveryBundle, encryptBackupPackage, isEncryptedBackupPackage, readBackupBytes } from '../../lib/backupPackage';
import BackupProgressModal from '../BackupProgressModal';
import IliosLoader from '../ui/IliosLoader';

export default function MobileSettings() {
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { signOut, profile } = useAuth();
    const { showToast, confirm } = useUI();
    const queryClient = useQueryClient();
    const isOnline = navigator.onLine;
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Local state for edits
    const [localSettings, setLocalSettings] = useState<any>(null);
    const [geminiKey, setGeminiKey] = useState(GEMINI_API_KEY);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingPrice, setIsLoadingPrice] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

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

    // Initialize local state when data loads
    React.useEffect(() => {
        if (settings) setLocalSettings(settings);
    }, [settings]);

    const handleLogout = () => {
        localStorage.removeItem('ILIOS_LOCAL_MODE');
        signOut();
    };

    const handleLocalUpdate = (field: string, value: any) => {
        setLocalSettings((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSaveAll = async () => {
        if (!localSettings) return;
        setIsSaving(true);
        try {
            // Use central API method for persistence (local + cloud)
            await api.updateSettings(localSettings);

            if (geminiKey !== GEMINI_API_KEY) {
                localStorage.setItem('VITE_GEMINI_API_KEY', geminiKey);
                setTimeout(() => window.location.reload(), 1000);
            } else {
                queryClient.invalidateQueries({ queryKey: ['settings'] });
                showToast("Οι ρυθμίσεις αποθηκεύτηκαν.", "success");
            }
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        } finally {
            setIsSaving(false);
        }
    };

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
            handleLocalUpdate('silver_price_gram', finalPrice);
            showToast(`Τιμή: ${formatDecimal(finalPrice, 3)} €/g`, 'success');
        } catch (error: any) {
            showToast(`Σφάλμα: ${error.message}`, 'error');
        } finally {
            setIsLoadingPrice(false);
        }
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
                if (!data._manifest?.complete) throw new Error('Το πλήρες backup δεν δημιουργήθηκε επειδή απέτυχαν εικόνες.');
                let packageBytes = await createRecoveryBundle(data);
                if (password) packageBytes = await encryptBackupPackage(packageBytes, password);
                downloadBlob(
                    new Blob([packageBytes.buffer.slice(packageBytes.byteOffset, packageBytes.byteOffset + packageBytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
                    `ilios_erp_mobile_backup_${timestamp}.iliosbackup`,
                );
                const meta = data._meta;
                const totalRows = Object.values(meta.table_counts).reduce((a, b) => a + b, 0);
                let summary = `${meta.total_tables} πίνακες, ${totalRows} εγγραφές, ${meta.image_count} εικόνες`;
                if (password) summary += ' · κρυπτογραφημένο';
                setBackupSummary(summary);
            } else {
                const bundle = createMigrationBundle(buildCanonicalMigration(data.tables), { includePrisma: format === 'prisma' });
                downloadBlob(
                    new Blob([bundle.buffer.slice(bundle.byteOffset, bundle.byteOffset + bundle.byteLength) as ArrayBuffer], { type: 'application/zip' }),
                    `ilios_${format}_export_${timestamp}.zip`,
                );
                setBackupSummary(format === 'prisma' ? 'Το πακέτο PRISMA Win δημιουργήθηκε.' : 'Το πακέτο μεταφοράς ERP δημιουργήθηκε.');
            }
            setBackupComplete(true);
        } catch (error: any) {
            setBackupSummary(error?.message || 'Σφάλμα εξαγωγής.');
            setBackupComplete(true);
        } finally {
            setIsExporting(false);
        }
    };

    const runRestore = async (backupData: unknown, options: BackupRestoreOptions) => {
        setIsBackupManagerOpen(false);
        const confirmed = await confirm({
            title: 'Επαναφορά Backup',
            message: `Θα επαναφερθούν ${options.tables.length} πίνακες. Συνέχεια;`,
            isDestructive: true,
            confirmText: 'Επαναφορά',
        });
        if (!confirmed) return;

        setBackupProgress(null);
        setBackupComplete(false);
        setBackupSummary('');
        setBackupErrors([]);
        setBackupModalTitle('Επαναφορά Backup');
        setIsBackupModalOpen(true);

        try {
            if ((options.mode ?? 'merge') !== 'merge') {
                setBackupModalTitle('Safety snapshot');
                const safety = await api.getFullSystemExport((progress) => setBackupProgress(progress));
                if (!safety._manifest?.complete) {
                    throw new Error('Η επαναφορά ακυρώθηκε: δεν δημιουργήθηκε πλήρες safety snapshot.');
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
                setBackupSummary(`Ολοκληρώθηκε με ${result.errors.length} προειδοποιήσεις.`);
            } else {
                const resetCount = result.auth?.passwordResetRequired.length ?? 0;
                setBackupSummary(resetCount > 0
                    ? `Επαναφορά ολοκληρώθηκε. ${resetCount} χρήστες πρέπει να αλλάξουν κωδικό μέσω email.`
                    : 'Επιτυχής επαναφορά! Ανανέωση...');
                setTimeout(() => window.location.reload(), 3000);
            }
            setBackupComplete(true);
        } catch (error: any) {
            setBackupSummary(error?.message || 'Σφάλμα επαναφοράς.');
            setBackupComplete(true);
        } finally {
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
            setPendingRestoreData(await readBackupBytes(bytes));
            setBackupManagerMode('restore');
            setIsBackupManagerOpen(true);
        } catch {
            showToast('Μη έγκυρο αρχείο ή κωδικός backup.', 'error');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!localSettings) return <IliosLoader variant="section" detail="Ρυθμίσεις" />;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
            <MobileScreenHeader icon={Settings} title="Ρυθμίσεις" subtitle="Λογαριασμός & εφαρμογή" iconClassName="text-slate-600" />
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-32 pt-3">
                {/* Profile */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><User size={24} /></div>
                    <div><div className="font-bold text-slate-900">{profile?.full_name || 'Χρήστης'}</div><div className="text-xs text-slate-500">{profile?.email}</div></div>
                </div>

                {/* Silver Price */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 rounded-2xl text-white shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2"><Coins size={20} className="text-emerald-400" /><span className="font-bold text-sm">Τιμή Ασημιού (€/g)</span></div>
                        <button onClick={fetchLivePrice} disabled={isLoadingPrice} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">{isLoadingPrice ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
                    </div>
                    <input type="number" step="0.01" value={localSettings.silver_price_gram} onChange={(e) => handleLocalUpdate('silver_price_gram', parseFloat(e.target.value))} className="bg-white/10 border border-white/20 rounded-xl p-2 text-xl font-mono font-bold w-full outline-none focus:bg-white/20 transition-colors" />
                </div>

                {/* API Key */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><Key size={14} /> Gemini API Key</label>
                    <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-mono" />
                </div>

                {/* Label Settings */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><Tag size={14} /> Διαστάσεις (mm)</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block">Χονδρική (W x H)</label>
                            <div className="flex gap-2">
                                <input type="number" value={localSettings.barcode_width_mm} onChange={(e) => handleLocalUpdate('barcode_width_mm', parseInt(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-center outline-none" />
                                <input type="number" value={localSettings.barcode_height_mm} onChange={(e) => handleLocalUpdate('barcode_height_mm', parseInt(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-center outline-none" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block flex items-center gap-1"><ShoppingBag size={10} className="text-fuchsia-600" /> Λιανική</label>
                            <div className="flex gap-2">
                                <input type="number" value={localSettings.retail_barcode_width_mm} onChange={(e) => handleLocalUpdate('retail_barcode_width_mm', parseInt(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 text-center outline-none" />
                                <input type="number" value={localSettings.retail_barcode_height_mm} onChange={(e) => handleLocalUpdate('retail_barcode_height_mm', parseInt(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 text-center outline-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Backup & System */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><Database size={14} /> Backup & Δεδομένα</h3>
                    <button onClick={() => { setBackupManagerMode('export'); setIsBackupManagerOpen(true); }} disabled={isExporting} className="w-full flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors">{isExporting ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />} Backup & Εξαγωγή</button>

                    <input type="file" accept=".json,.iliosbackup" className="hidden" ref={fileInputRef} onChange={handleRestoreFilePick} />
                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 p-3 bg-slate-50 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors border border-slate-200 mt-2"><Upload size={18} /> Επαναφορά από Backup</button>

                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-50 mt-2">
                        <span className="text-slate-500 flex items-center gap-2">{isOnline ? <Wifi size={16} className="text-emerald-500" /> : <WifiOff size={16} className="text-red-500" />} Κατάσταση</span>
                        <span className={`font-bold ${isOnline ? 'text-emerald-600' : 'text-red-500'}`}>{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>

                <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors mt-4"><LogOut size={20} /> Αποσύνδεση</button>
                <div className="text-center text-[10px] text-slate-300 mt-4 flex items-center justify-center gap-1"><ShieldCheck size={12} /> Secure Connection • Ilios ERP</div>
            </div>

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
                    setPendingRestoreData(await readBackupBytes(pendingEncryptedBackup, password));
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

            {/* Sticky Save Button */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 z-50">
                <button onClick={handleSaveAll} disabled={isSaving} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50">
                    {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση Αλλαγών'}
                </button>
            </div>
        </div>
    );
}
