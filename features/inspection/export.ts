import type { InspectionSnapshot } from './types';
import { buildInspectionRegistry, inspectSnapshot } from './analysis';

function csvCell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Spreadsheet formula injection affects text, not numeric amounts.
  if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function inspectionCsv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  return '\ufeff' + [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
}

export async function buildInspectionExport(snapshot: InspectionSnapshot): Promise<{ bytes: Uint8Array; filename: string }> {
  const { zipSync, strToU8 } = await import('fflate');
  const issues = inspectSnapshot(snapshot);
  const complete = snapshot.status.state === 'complete' && Object.values(snapshot.tableStatus).every((state) => state === 'complete');
  const needsReview = !complete || issues.length > 0;
  const registry = buildInspectionRegistry(snapshot);
  const manifest = {
    format: 'ilios-inspection', version: 1, generatedAt: new Date().toISOString(), snapshotAt: snapshot.fetchedAt,
    filters: snapshot.filters, status: snapshot.status, retrievalComplete: complete, needsReview,
    tableStatus: snapshot.tableStatus, counts: Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length])),
    registryCount: registry.length, issues,
    documentEnvironments: {
      confirmed: (snapshot.tables.legal_documents || []).filter(row => row.environment === snapshot.filters.environment).length,
      unknown: (snapshot.tables.legal_documents || []).filter(row => !row.environment).length,
    },
    coverage: {
      documents: 'Επιλεγμένο περιβάλλον και περίοδος. Το άγνωστο περιβάλλον παραμένει ορατό.',
      supporting: 'Τρέχον μητρώο, υπόλοιπα και διαθέσιμα στοιχεία τρίτων κατά τον χρόνο στιγμιοτύπου.',
      inventory: 'Εσωτερικά στοιχεία με μερική ενημέρωση. Δεν αποτελούν επιβεβαιωμένη φυσική απογραφή.',
      external: 'Βιβλία, αγορές, υλικά και αποστολές προς τεχνίτες χρειάζονται τα αρχεία των δηλωμένων πηγών.',
    },
    complianceCertification: false,
  };
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)), 'snapshot.json': strToU8(JSON.stringify(snapshot, null, 2)) };
  for (const [table, rows] of Object.entries(snapshot.tables)) files[`${table}.csv`] = strToU8(inspectionCsv(rows));
  files['registry.csv'] = strToU8(inspectionCsv(registry.map((row) => ({ ...row }))));
  files['issues.csv'] = strToU8(inspectionCsv(issues.map((row) => ({ ...row }))));
  files['README.txt'] = strToU8(`${needsReview ? 'ΕΛΛΙΠΗΣ ΤΕΚΜΗΡΙΩΣΗ / ΕΥΡΗΜΑΤΑ ΠΡΟΣ ΔΙΑΣΤΑΥΡΩΣΗ' : 'Η ανάκτηση των ενοτήτων ολοκληρώθηκε.'}\n${manifest.coverage.inventory}\n${manifest.coverage.external}\nΗ πληρότητα της ανάκτησης δεν αποτελεί πιστοποίηση φορολογικής συμμόρφωσης. Δείτε manifest.json.\n`);
  return { bytes: zipSync(files, { level: 6 }), filename: `Ilios_Inspection_${snapshot.filters.environment}_${snapshot.fetchedAt.slice(0, 10)}${needsReview ? '_INCOMPLETE' : ''}.zip` };
}

export function downloadInspectionFile(bytes: Uint8Array | string, filename: string, type = 'application/zip'): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes).buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
