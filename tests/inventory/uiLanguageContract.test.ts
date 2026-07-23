import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = [
  '../../components/inventory/InventoryWorkspace.tsx',
  '../../components/inventory/InventoryStockExplorer.tsx',
  '../../components/inventory/InventoryGuideDialog.tsx',
  '../../components/inventory/InventoryQuickSearch.tsx',
  '../../components/inventory/InventoryPostingDialog.tsx',
  '../../components/inventory/InventoryCountSessionDialog.tsx',
  '../../components/inventory/InventoryAvailabilityNote.tsx',
  '../../components/suppliers/SupplierReceiptModal.tsx',
  '../../components/mobile/MobileProductDetails.tsx',
  '../../components/mobile/MobileDashboard.tsx',
  '../../components/employee/EmployeeRegistry.tsx',
  '../../components/mobile/MobileRegistry.tsx',
  '../../components/ProductRegistry.tsx',
  '../../components/PriceListPage.tsx',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

const workspaceSource = readFileSync(
  new URL('../../components/inventory/InventoryWorkspace.tsx', import.meta.url),
  'utf8',
);

describe('Greek inventory UI language contract', () => {
  it('does not expose known English inventory labels or fallbacks', () => {
    expect(source).not.toMatch(/["']Scan Stock["']/);
    expect(source).not.toMatch(/\|\|\s*["']User["']/);
    expect(source).not.toMatch(/label:\s*["']Unisex["']/);
  });

  it('uses the ERP reorder term and accented mobile actions', () => {
    expect(source).toContain('Κάτω από Σημείο Αναπαραγγελίας');
    expect(source).toContain('Γρήγορες Ενέργειες');
    expect(source).toContain('Σάρωση Αποθέματος');
  });

  it('keeps the grouped SKU explorer and its help flow in professional Greek', () => {
    expect(source).toContain('Κύριο SKU & εικόνα');
    expect(source).toContain('Οδηγός Αποθήκης & Αποθέματος');
    expect(source).toContain('Αποθήκη Προέλευσης');
    expect(source).toContain('Πρώτη φυσική απογραφή σε κενό σύστημα');
    expect(source).not.toContain('No Image');
  });

  it('keeps immediate search and smart posting fully Greek and operational', () => {
    expect(source).toContain('Αναζήτηση SKU ή παραλλαγής…');
    expect(source).toContain('Καταχώριση & επόμενο SKU');
    expect(source).toContain('Απογραφή — Ορισμός ακριβούς Φυσικού Αποθέματος');
    expect(source).toContain('Προσθήκη δεύτερης αποθήκης');
    expect(source).toContain('Δεν πραγματοποιήθηκε καμία μεταβολή');
    expect(source).not.toContain('No results');
    expect(source).not.toContain('Add warehouse');
  });

  it('keeps mobile stock feedback canonical and operationally explicit', () => {
    expect(source).toContain('Επιβεβαίωση υπολοίπου...');
    expect(source).toContain('Το απόθεμα ενδέχεται να έχει μεταβληθεί');
    expect(source).toContain('Δεν εμφανίζονται προσωρινά ποσότητες, ώστε να μην παρουσιαστούν παλιά στοιχεία');
  });

  it('keeps the resumable count session fully Greek and explicit about posting state', () => {
    expect(source).toContain('Συνεδρία Απογραφής');
    expect(source).toContain('Ρητές μηδενικές');
    expect(source).toContain('Υποβολή όλων');
    expect(source).toContain('Η προσθήκη στη συνεδρία δεν αλλάζει ακόμη το απόθεμα');
    expect(source).not.toContain('Start session');
    expect(source).not.toContain('Submit batch');
  });

  it('keeps one primary stock-posting entry point and flexible warehouse terminology', () => {
    const stockHeaderStart = workspaceSource.indexOf('Αναλυτικά Υπόλοιπα SKU');
    const stockFiltersStart = workspaceSource.indexOf('Φίλτρο αποθήκης', stockHeaderStart);
    const stockHeader = workspaceSource.slice(stockHeaderStart, stockFiltersStart);

    expect(stockHeader).not.toContain('Καταχώριση Αποθέματος');
    expect(stockHeader).toContain('Συνεδρία Απογραφής');
    expect(workspaceSource).toContain('Κατηγορία / υπεύθυνος');
    expect(workspaceSource).toContain('Δειγματολόγιο κύριου πλασιέ');
    expect(workspaceSource).not.toContain("label: 'Κατάστημα'");
  });
});
