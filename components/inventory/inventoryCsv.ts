type CsvCell = string | number | null | undefined;

function escapeCell(value: CsvCell): string {
  const text = value == null ? '' : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Downloads a semicolon-separated UTF-8 CSV with BOM, which Greek-locale Excel
 * opens directly with correct characters and columns.
 */
export function downloadInventoryCsv(fileName: string, header: string[], rows: CsvCell[][]): void {
  const content = [header, ...rows].map((row) => row.map(escapeCell).join(';')).join('\r\n');
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
