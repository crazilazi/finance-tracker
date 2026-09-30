import * as XLSX from 'xlsx';
import { apiFetch } from '../lib/apiClient';

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
  // apiFetch sends this tab's unlock grant; without it the rows would come back hidden or fake.
  const { body: result } = await apiFetch(`/api/expenses?${search.toString()}`);
  if (!result?.data) throw new Error('No data returned');
  if (result.mode !== 'real') throw new Error('Unlock to export real amounts.');

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
