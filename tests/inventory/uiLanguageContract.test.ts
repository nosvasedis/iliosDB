import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = [
  '../../components/inventory/InventoryWorkspace.tsx',
  '../../components/inventory/InventoryStockExplorer.tsx',
  '../../components/inventory/InventoryGuideDialog.tsx',
  '../../components/inventory/InventoryAvailabilityNote.tsx',
  '../../components/suppliers/SupplierReceiptModal.tsx',
  '../../components/mobile/MobileDashboard.tsx',
  '../../components/employee/EmployeeRegistry.tsx',
  '../../components/mobile/MobileRegistry.tsx',
  '../../components/ProductRegistry.tsx',
  '../../components/PriceListPage.tsx',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

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
});
