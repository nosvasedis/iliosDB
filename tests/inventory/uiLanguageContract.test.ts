import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const source = [
  '../../components/inventory/InventoryWorkspace.tsx',
  '../../components/inventory/InventoryStockList.tsx',
  '../../components/inventory/InventoryItemDrawer.tsx',
  '../../components/inventory/InventoryAdminDialogs.tsx',
  '../../components/inventory/StockEntryDialog.tsx',
  '../../components/inventory/ui/StockControls.tsx',
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
].map(read).join('\n');

const workspaceSource = read('../../components/inventory/InventoryWorkspace.tsx');
const entrySource = read('../../components/inventory/StockEntryDialog.tsx');
const controlsSource = read('../../components/inventory/ui/StockControls.tsx');

describe('Greek inventory UI language contract', () => {
  it('does not expose known English inventory labels or fallbacks', () => {
    expect(source).not.toMatch(/["']Scan Stock["']/);
    expect(source).not.toMatch(/\|\|\s*["']User["']/);
    expect(source).not.toMatch(/label:\s*["']Unisex["']/);
    expect(source).not.toContain('No results');
    expect(source).not.toContain('Add warehouse');
    expect(source).not.toContain('No Image');
  });

  it('keeps accented mobile quick actions', () => {
    expect(source).toContain('Γρήγορες Ενέργειες');
    expect(source).toContain('Σάρωση Αποθέματος');
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
});

describe('streamlined Αποθήκη & Στοκ', () => {
  it('has one screen with a single primary entry action and no tabs', () => {
    expect(workspaceSource).toContain('Αποθήκη & Στοκ');
    expect(workspaceSource.match(/<HeaderPrimaryButton icon=\{PackagePlus\}[^\n]*\n\s*Καταχώριση/g)).toHaveLength(1);
    expect(workspaceSource).not.toContain('role="tablist"');
    expect(workspaceSource).not.toContain('Σημείο Αναπαραγγελίας');
  });

  it('never requires a size: «Χωρίς μέγεθος» is always offered', () => {
    expect(controlsSource).toContain('NO_SIZE_LABEL');
    expect(entrySource).toContain('stockSizeOptions');
    expect(entrySource).toContain('Το μέγεθος είναι προαιρετικό');
  });

  it('shows stock held at customers without allowing manual moves there', () => {
    expect(workspaceSource).toContain('Σε πελάτες');
    expect(workspaceSource).toContain('WORKFLOW_OWNED_WAREHOUSE_IDS');
  });
});
