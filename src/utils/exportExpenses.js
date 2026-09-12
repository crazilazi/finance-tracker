import * as XLSX from 'xlsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatMonthLabel(m) {
  if (!m) return '';
  const [y, mo] = String(m).split('-');
  return `${MONTHS[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
}

/**
 * Downloads the current filtered view as an Excel workbook.
 * `params` mirrors the /api/expenses query string (filter, type, category, search, query, sortCol, sortDir, monthNum).
 * Returns the number of exported rows.
 */
export async function exportExpensesToExcel(params, fileName = 'GaddiTracker_Export.xlsx') {
  const search = new URLSearchParams({ ...params, export: 'true' });
  const res = await fetch(`/api/expenses?${search.toString()}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const result = await res.json();
  if (!result.data) throw new Error('No data returned');

  const ws = XLSX.utils.json_to_sheet(result.data.map(row => ({
    Month: formatMonthLabel(row.month),
    Category: row.category,
    Type: row.type,
    Amount: row.amount,
    Notes: row.tags || '',
    Sheet: row.sheet || '',
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
  XLSX.writeFile(wb, fileName);
  return result.data.length;
}
