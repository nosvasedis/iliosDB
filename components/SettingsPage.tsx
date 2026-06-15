
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { GlobalSettings, Product } from '../types';
import { Save, TrendingUp, Loader2, Settings as SettingsIcon, Info, Shield, Key, Download, FileJson, FileText, Database, ShieldAlert, RefreshCw, Trash2, HardDrive, Upload, Tag, Activity, AlertTriangle, Clock, Image as ImageIcon, X, Search, Play, CheckSquare } from 'lucide-react';
import { supabase, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, GEMINI_API_KEY, api } from '../lib/supabase';
import { offlineDb } from '../lib/offlineDb';
import AuditLogsModal from './AuditLogsModal';
import BackupProgressModal from './BackupProgressModal';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from './UIProvider';
import { formatDecimal } from '../utils/pricingEngine';
import { convertToCSV, downloadFile, downloadBlob, flattenForCSV } from '../utils/exportUtils';
import { BACKUP_TABLE_REGISTRY, BackupProgress, validateBackup } from '../lib/backupConfig';
import DesktopPageHeader from './DesktopPageHeader';
import { useSettings } from '../hooks/api/useSettings';
import { compressImage } from '../utils/imageHelpers';

const IMAGE_OPTIMIZATION_BATCH_SIZE = 100;
const IMAGE_OPTIMIZATION_SKIPPED_KEY = 'ilios:image-optimization-skipped:v1';
const IMAGE_OPTIMIZATION_HISTORY_KEY = 'ilios:image-optimization-history:v1';
const IMAGE_OPTIMIZATION_MIN_BYTES = 450 * 1024;
const IMAGE_OPTIMIZATION_MAX_EDGE = 1100;
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

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: settingsData, isLoading: loadingSettings } = useSettings();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [settings, setSettings] = useState<GlobalSettings | null>(null);
    const [localGeminiKey, setLocalGeminiKey] = useState(GEMINI_API_KEY);

    useEffect(() => {
        if (settingsData) setSettings(settingsData);
    }, [settingsData]);

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
    const filteredImageOptimizationPreview = useMemo(() => {
        const filter = imageOptimizationFilter.trim().toUpperCase();
        const filtered = filter
            ? imageOptimizationPreview.filter(product => product.sku.toUpperCase().includes(filter))
            : imageOptimizationPreview;
        return filtered.slice(0, 200);
    }, [imageOptimizationFilter, imageOptimizationPreview]);

    if (loadingSettings || !settings) {
        return <div className="p-8 text-center text-slate-400">Φόρτωση ρυθμίσεων...</div>;
    }

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
            const newSettings = { ...settings, silver_price_gram: finalPrice };

            // Update via API for full persistence
            await api.updateSettings(newSettings);

            setSettings(newSettings);
            queryClient.setQueryData(['settings'], newSettings);
            showToast(`Η τιμή ενημερώθηκε: ${formatDecimal(finalPrice, 3)} €/g`, 'success');
        } catch (error: any) {
            showToast(`Σφάλμα: ${error.message}`, 'error');
        } finally {
            setIsLoadingPrice(false);
        }
    };

    const handleSaveSettings = async () => {
        setIsSaving(true);
        try {
            // Κεντρική αποθήκευση για τοπικά και απομακρυσμένα δεδομένα.
            await api.updateSettings(settings);

            if (localGeminiKey !== GEMINI_API_KEY) {
                localStorage.setItem('VITE_GEMINI_API_KEY', localGeminiKey);
                setTimeout(() => window.location.reload(), 1000);
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
            showToast("Οι ρυθμίσεις αποθηκεύτηκαν.", 'success');
        } catch (err) {
            showToast("Σφάλμα κατά την αποθήκευση.", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleJsonBackup = async () => {
        setIsExporting(true);
        setBackupProgress(null);
        setBackupComplete(false);
        setBackupSummary('');
        setBackupErrors([]);
        setBackupModalTitle('Δημιουργία Backup');
        setIsBackupModalOpen(true);
        try {
            const data = await api.getFullSystemExport((p) => setBackupProgress(p));
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            downloadBlob(blob, `ilios_erp_full_backup_${timestamp}.json`);

            const meta = data._meta;
            const summary = `${meta.total_tables} πίνακες, ${Object.values(meta.table_counts).reduce((a, b) => a + b, 0)} εγγραφές, ${meta.image_count} εικόνες`;
            setBackupSummary(meta.failed_images.length > 0
                ? `${summary} (${meta.failed_images.length} εικόνες απέτυχαν)`
                : summary
            );
            setBackupComplete(true);
        } catch (err) {
            setBackupSummary('Σφάλμα κατά τη δημιουργία backup.');
            setBackupComplete(true);
        } finally {
            setIsExporting(false);
        }
    };

    const handleCsvExport = async () => {
        setIsExporting(true);
        setBackupProgress(null);
        setBackupComplete(false);
        setBackupSummary('');
        setBackupErrors([]);
        setBackupModalTitle('Εξαγωγή CSV');
        setIsBackupModalOpen(true);
        try {
            const data = await api.getFullSystemExport((p) => setBackupProgress(p));
            const timestamp = new Date().toISOString().split('T')[0];

            const csvTables = BACKUP_TABLE_REGISTRY.filter(t => t.includeInCsv);
            let exported = 0;
            for (const entry of csvTables) {
                const tableData = data.tables[entry.table] || [];
                if (tableData.length > 0) {
                    const flattened = flattenForCSV(tableData);
                    const csv = convertToCSV(flattened);
                    downloadFile(csv, `ilios_${entry.displayName.toLowerCase()}_${timestamp}.csv`, 'text/csv');
                    exported++;
                    await new Promise(r => setTimeout(r, 200));
                }
            }
            setBackupSummary(`${exported} αρχεία CSV λήφθηκαν.`);
            setBackupComplete(true);
        } catch (err) {
            setBackupSummary('Σφάλμα κατά την εξαγωγή CSV.');
            setBackupComplete(true);
        } finally {
            setIsExporting(false);
        }
    };

    const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const backupData = JSON.parse(event.target?.result as string);
                const validation = validateBackup(backupData);

                if (!validation.valid) {
                    showToast(validation.errors.join(' '), 'error');
                    return;
                }

                const dateStr = validation.createdAt
                    ? new Date(validation.createdAt).toLocaleString('el-GR')
                    : 'Άγνωστη ημερομηνία';

                const configNote = validation.hasConfig
                    ? '\n\nΤο backup περιέχει ρυθμίσεις σύνδεσης που θα αντικατασταθούν.'
                    : '';

                const confirmed = await confirm({
                    title: 'ΠΡΟΣΟΧΗ: ΠΛΗΡΗΣ ΕΠΑΝΑΦΟΡΑ',
                    message: `Backup: ${dateStr}\nΠεριεχόμενα: ${validation.summary}\n\nΑυτή η ενέργεια θα ΔΙΑΓΡΑΨΕΙ ΟΛΑ τα τρέχοντα δεδομένα και θα τα αντικαταστήσει.${configNote}\n\nΕίστε σίγουροι;`,
                    isDestructive: true,
                    confirmText: 'ΝΑΙ, ΕΠΑΝΑΦΟΡΑ'
                });

                if (confirmed) {
                    setBackupProgress(null);
                    setBackupComplete(false);
                    setBackupSummary('');
                    setBackupErrors([]);
                    setBackupModalTitle('Επαναφορά Backup');
                    setIsBackupModalOpen(true);
                    setIsMaintenanceAction(true);

                    const result = await api.restoreFullSystem(backupData, {
                        restoreConfig: validation.hasConfig,
                        onProgress: (p) => setBackupProgress(p),
                    });

                    if (result.errors.length > 0) {
                        setBackupErrors(result.errors);
                        setBackupSummary(`Η επαναφορά ολοκληρώθηκε με ${result.errors.length} προειδοποιήσεις.`);
                    } else {
                        setBackupSummary('Η επαναφορά ολοκληρώθηκε επιτυχώς! Το ERP θα ανανεωθεί.');
                        setTimeout(() => window.location.reload(), 3000);
                    }
                    setBackupComplete(true);
                }
            } catch (err) {
                showToast("Το αρχείο δεν είναι έγκυρο αντίγραφο Ilios ERP.", "error");
            } finally {
                setIsMaintenanceAction(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleForceSync = async () => {
        setIsMaintenanceAction(true);
        try {
            const result = await api.syncOfflineData();
            if (result.wasQueueEmpty) {
                showToast("Δεν υπάρχουν εκκρεμείς αλλαγές προς συγχρονισμό.", "info");
            } else if (result.syncedCount > 0 && result.remainingCount === 0) {
                showToast(`Συγχρονίστηκαν ${result.syncedCount} εκκρεμείς αλλαγές!`, "success");
                queryClient.invalidateQueries();
            } else if (result.syncedCount > 0 && result.remainingCount > 0) {
                showToast(`Συγχρονίστηκαν ${result.syncedCount} αλλαγές, αλλά ${result.remainingCount} παραμένουν εκκρεμείς.`, "info");
                queryClient.invalidateQueries();
            } else if (result.remainingCount > 0) {
                showToast(`Ο συγχρονισμός δεν ολοκληρώθηκε. Παραμένουν ${result.remainingCount} εκκρεμείς αλλαγές.`, "error");
            } else if (result.failedCount > 0) {
                showToast("Ο συγχρονισμός ολοκληρώθηκε με απορρίψεις αλλαγών. Ελέγξτε τα μηνύματα σφάλματος.", "error");
                queryClient.invalidateQueries();
            }
        } catch (err) {
            showToast("Σφάλμα συγχρονισμού.", "error");
        } finally {
            setIsMaintenanceAction(false);
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
                const db = await new Promise<IDBDatabase>((resolve, reject) => {
                    const req = indexedDB.open('IliosERP_Offline_Mirror');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                const tx = db.transaction('sync_queue', 'readwrite');
                tx.objectStore('sync_queue').clear();
                showToast("Η ουρά εκκαθαρίστηκε. Ο συγχρονισμός θα σταματήσει.", "success");
                setTimeout(() => window.location.reload(), 1500);
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
                setTimeout(() => window.location.reload(), 1500);
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

        if (!response.ok) throw new Error(`Η μεταφόρτωση εικόνας απέτυχε: ${response.status}`);
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
            showToast(`Φορτώθηκαν ${candidates.length} εικόνες. Το φίλτρο SKU δουλεύει πλέον άμεσα.`, 'success');
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
                ? `Θα βελτιστοποιηθούν οι ${selectedUrls.size} επιλεγμένες εικόνες${forceSelectedOptimization ? ', ακόμη κι αν δεν ξεπερνούν τα αυτόματα όρια' : ' με βάση τα αυτόματα όρια'}. Κρατήστε αυτό το παράθυρο ανοιχτό μέχρι να ολοκληρωθεί.`
                : `Θα ελεγχθεί όλη η βιβλιοθήκη εικόνων προϊόντων σε παρτίδες των ${IMAGE_OPTIMIZATION_BATCH_SIZE}, χωρίς να χρειάζεται να πατήσετε ξανά το κουμπί. Θα αλλαχθούν μόνο όσες είναι πραγματικά βαριές ή πολύ μεγάλες σε διαστάσεις. Κρατήστε αυτό το παράθυρο ανοιχτό μέχρι να ολοκληρωθεί.`,
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

            showToast(`Ξεκίνησε ο έλεγχος ${allTargets.length} εικόνων. Θα αλλαχθούν μόνο όσες είναι πάνω από ${minKb}KB ή ${IMAGE_OPTIMIZATION_MAX_EDGE}px.`, 'info');

            for (let index = 0; index < allTargets.length; index += 1) {
                const product = allTargets[index];
                try {
                    const response = await fetch(product.image_url!);
                    if (!response.ok) throw new Error(`Η λήψη εικόνας απέτυχε: ${response.status}`);

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
                    showToast(`Πρόοδος: ${processed}/${allTargets.length}. Βελτιστοποιήθηκαν ${optimized}, παραλείφθηκαν ${skipped}, απέτυχαν ${failed}.`, 'info');
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
            showToast(`Ολοκληρώθηκε. Βελτιστοποιήθηκαν ${optimized}, παραλείφθηκαν ${skipped}, απέτυχαν ${failed}. Εξοικονομήθηκαν περίπου ${savedMb} MB.`, failed ? 'info' : 'success');
        } catch (error) {
            console.error(error);
            showToast('Η βελτιστοποίηση εικόνων απέτυχε.', 'error');
        } finally {
            setIsMaintenanceAction(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            <DesktopPageHeader
                icon={SettingsIcon}
                title="Ρυθμίσεις Συστήματος"
                subtitle="Παράμετροι τιμολόγησης και διαχείριση δεδομένων."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                        <TrendingUp className="text-amber-500" size={20} />
                        Οικονομικά Στοιχεία
                    </h2>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Τιμή Ασημιού (€/g)</label>
                            <div className="flex gap-2 relative">
                                <input
                                    type="number" step="0.01"
                                    value={settings.silver_price_gram}
                                    onChange={(e) => setSettings({ ...settings, silver_price_gram: parseFloat(e.target.value) })}
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-mono font-bold text-lg"
                                />
                                <button onClick={fetchLivePrice} disabled={isLoadingPrice} className="px-4 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 border border-blue-200 transition-colors">
                                    {isLoadingPrice ? <Loader2 className="animate-spin" size={20} /> : <TrendingUp size={20} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50">
                        <Database className="text-blue-500" size={20} />
                        Αντίγραφα Ασφαλείας & Εξαγωγή
                    </h2>
                    <div className="space-y-4">
                        <button onClick={handleJsonBackup} disabled={isExporting} className="w-full flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50 transition-all group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:scale-110 transition-transform"><FileJson size={20} /></div>
                                <div className="text-left"><span className="block font-bold text-slate-700">Backup Πλήρους Συστήματος</span><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">JSON • Όλοι οι πίνακες</span></div>
                            </div>
                            {isExporting ? <Loader2 size={18} className="animate-spin text-blue-500" /> : <Download size={18} className="text-slate-300 group-hover:text-blue-500" />}
                        </button>

                        <button onClick={handleCsvExport} disabled={isExporting} className="w-full flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50 transition-all group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg group-hover:scale-110 transition-transform"><FileText size={20} /></div>
                                <div className="text-left"><span className="block font-bold text-slate-700">Εξαγωγή Excel / Access </span><span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Πακέτο CSV • Επιπεδοποιημένα Δεδομένα</span></div>
                            </div>
                            {isExporting ? <Loader2 size={18} className="animate-spin text-emerald-500" /> : <Download size={18} className="text-slate-300 group-hover:text-emerald-500" />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-100">
                        <Tag className="text-purple-500" size={20} />
                        Διαστάσεις Ετικετών (mm)
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Χονδρική</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Φάρδος</label>
                                    <input type="number" value={settings.barcode_width_mm} onChange={(e) => setSettings({ ...settings, barcode_width_mm: parseInt(e.target.value) })} className="w-full p-2 border rounded-lg font-mono text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Ύψος</label>
                                    <input type="number" value={settings.barcode_height_mm} onChange={(e) => setSettings({ ...settings, barcode_height_mm: parseInt(e.target.value) })} className="w-full p-2 border rounded-lg font-mono text-sm" />
                                </div>
                            </div>
                        </div>
                        <div className="col-span-2 border-t border-slate-100 pt-3">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Λιανική</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Φάρδος</label>
                                    <input type="number" value={settings.retail_barcode_width_mm} onChange={(e) => setSettings({ ...settings, retail_barcode_width_mm: parseInt(e.target.value) })} className="w-full p-2 border rounded-lg font-mono text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Ύψος</label>
                                    <input type="number" value={settings.retail_barcode_height_mm} onChange={(e) => setSettings({ ...settings, retail_barcode_height_mm: parseInt(e.target.value) })} className="w-full p-2 border rounded-lg font-mono text-sm" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-100">
                        <Shield className="text-emerald-500" size={20} />
                        Τοπική Ρύθμιση & Συντήρηση
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <Key size={14} className="text-slate-400" /> Κλειδί Gemini API
                            </label>
                            <input type="password" value={localGeminiKey} onChange={(e) => setLocalGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-900 font-mono text-sm" />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                            <div className="flex flex-col">
                                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <HardDrive size={16} className="text-emerald-500" /> Τοπική Αποθήκευση Εικόνων
                                </label>
                                <span className="text-xs text-slate-500 mt-1">Αποθηκεύει τις μικρογραφίες στη Βάση (Base64 WebP) μειώνοντας τις κλήσεις στο διαδίκτυο.</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.local_image_storage || false}
                                onChange={(e) => setSettings({ ...settings, local_image_storage: e.target.checked })}
                                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer shrink-0"
                            />
                        </div>

                        <button onClick={handleForceSync} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-bold text-slate-700 text-sm mt-4">
                            <RefreshCw size={16} className={isMaintenanceAction ? 'animate-spin' : ''} /> Συγχρονισμός Εκκρεμοτήτων
                        </button>

                        <button onClick={openImageOptimizationModal} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-colors font-bold text-emerald-700 text-sm">
                            <ImageIcon size={16} /> Βελτιστοποίηση Εικόνων Προϊόντων
                        </button>

                        <button onClick={handleClearSyncQueue} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors font-bold text-amber-700 text-sm">
                            <AlertTriangle size={16} /> Εκκαθάριση Ουράς
                        </button>

                        <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleRestoreBackup} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors font-bold text-blue-700 text-sm">
                            <Upload size={16} /> Επαναφορά από Backup
                        </button>

                        <button onClick={handleWipeCache} disabled={isMaintenanceAction} className="w-full flex items-center gap-3 p-3 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors font-bold text-rose-600 text-sm">
                            <Trash2 size={16} /> Εκκαθάριση Cache
                        </button>

                        <button onClick={() => setIsAuditLogsOpen(true)} className="w-full flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors font-bold text-indigo-700 text-sm">
                            <Clock size={16} /> Ιστορικό Ενεργειών
                        </button>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-4xl px-8 pointer-events-none">
                <div className="flex justify-end pointer-events-auto">
                    <button onClick={handleSaveSettings} disabled={isSaving} className="flex items-center gap-2 text-base bg-slate-900 text-white px-10 py-4 rounded-2xl hover:bg-black font-bold disabled:opacity-50 shadow-2xl transition-all hover:-translate-y-1 active:scale-95">
                        {isSaving ? <Loader2 className="animate-spin" size={22} /> : <Save size={22} />}
                        Αποθήκευση Όλων των Ρυθμίσεων
                    </button>
                </div>
            </div>

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
                                        <CheckSquare size={16} /> Επιλεγμένες ({selectedImageUrls.size})
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
                                                Εμφανίζονται {filteredImageOptimizationPreview.length} από {imageOptimizationPreview.length} εικόνες{imageOptimizationFilter.trim() ? ` για "${imageOptimizationFilter.trim().toUpperCase()}"` : ''}.
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
                                    <p>Αλλάζει μόνο εικόνες πάνω από {Math.round(IMAGE_OPTIMIZATION_MIN_BYTES / 1024)}KB ή με πλευρά πάνω από {IMAGE_OPTIMIZATION_MAX_EDGE}px. Οι επιλεγμένες μπορούν να γίνουν αναγκαστικά.</p>
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
                                                    <span>Έλεγχος: {entry.checked}</span>
                                                    <span>Κέρδος: {entry.savedMb} MB</span>
                                                    <span>ΟΚ: {entry.optimized}</span>
                                                    <span>Skip/Fail: {entry.skipped}/{entry.failed}</span>
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
