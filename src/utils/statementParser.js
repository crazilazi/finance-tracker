import * as XLSX from 'xlsx';
import { guessType } from './nlpParser';

export function parseStatementFile(fileBuffer, knownCategories = [], existingData = []) {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

  if (!jsonData || jsonData.length < 2) {
    throw new Error('Statement file appears empty or invalid.');
  }

  // Find header row (row containing words like date, description, narration, amount, debit, credit)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
    if (!jsonData[i]) continue;
    const rowStr = jsonData[i].join(' ').toLowerCase();
    if (rowStr.includes('date') || rowStr.includes('narration') || rowStr.includes('description') || rowStr.includes('amount') || rowStr.includes('debit') || rowStr.includes('credit')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0; // fallback

  const headers = jsonData[headerRowIdx].map(h => String(h || '').trim().toLowerCase());
  
  // Detect column indices
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('txn date') || h.includes('value date'));
  const descIdx = headers.findIndex(h => h.includes('narration') || h.includes('description') || h.includes('particulars') || h.includes('details') || h.includes('remarks'));
  const amountIdx = headers.findIndex(h => h === 'amount' || h.includes('amt') || h.includes('transaction amount'));
  const debitIdx = headers.findIndex(h => h.includes('debit') || h.includes('withdrawal') || h.includes('dr'));
  const creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('deposit') || h.includes('cr'));
  const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('cr/dr'));

  const parsedRows = [];

  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    // Extract raw fields
    const rawDate = dateIdx !== -1 ? row[dateIdx] : null;
    const rawDesc = descIdx !== -1 ? row[descIdx] : row.join(' ');
    let rawAmount = amountIdx !== -1 ? row[amountIdx] : null;
    const rawDebit = debitIdx !== -1 ? row[debitIdx] : null;
    const rawCredit = creditIdx !== -1 ? row[creditIdx] : null;

    if (!rawDate && !rawAmount && !rawDebit && !rawCredit) continue;

    // Process Date -> YYYY-MM
    let month = new Date().toISOString().slice(0, 7); // fallback
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        month = d.toISOString().slice(0, 7);
      } else {
        const mMatch = String(rawDate).match(/(\d{4})[-/](\d{1,2})/) || String(rawDate).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (mMatch) {
          if (mMatch[3]) {
            month = `${mMatch[3]}-${String(mMatch[2]).padStart(2, '0')}`;
          } else {
            month = `${mMatch[1]}-${String(mMatch[2]).padStart(2, '0')}`;
          }
        }
      }
    }

    // Process Amount & Type
    let amount = 0;
    let type = 'Expense';

    const numDebit = rawDebit ? parseFloat(String(rawDebit).replace(/,/g, '')) : 0;
    const numCredit = rawCredit ? parseFloat(String(rawCredit).replace(/,/g, '')) : 0;

    if (numDebit > 0) {
      amount = numDebit;
      type = 'Expense';
    } else if (numCredit > 0) {
      amount = numCredit;
      type = 'Income';
    } else if (rawAmount) {
      amount = Math.abs(parseFloat(String(rawAmount).replace(/,/g, '')) || 0);
      if (String(rawAmount).includes('-') || (typeIdx !== -1 && String(row[typeIdx]).toLowerCase().includes('dr'))) {
        type = 'Expense';
      } else if (typeIdx !== -1 && String(row[typeIdx]).toLowerCase().includes('cr')) {
        type = 'Income';
      }
    }

    if (!amount || amount === 0) continue;

    // Smart Category Normalization
    const cleanDesc = String(rawDesc || '').trim();
    let category = 'Uncategorized';

    // Try fuzzy matching against knownCategories
    const matchedKnown = knownCategories.find(c => cleanDesc.toLowerCase().includes(c.toLowerCase()));
    if (matchedKnown) {
      category = matchedKnown;
    } else {
      const lowerDesc = cleanDesc.toLowerCase();
      if (lowerDesc.includes('rent')) category = 'Room Rent';
      else if (lowerDesc.includes('swiggy') || lowerDesc.includes('zomato') || lowerDesc.includes('food')) category = 'Ghar Kharch';
      else if (lowerDesc.includes('electricity') || lowerDesc.includes('power') || lowerDesc.includes('bijali')) category = 'Bijali Bill';
      else if (lowerDesc.includes('salary') || lowerDesc.includes('payroll')) category = 'Salary';
      else if (lowerDesc.includes('cc') || lowerDesc.includes('card')) category = 'HDFC CC';
      else {
        category = cleanDesc.split(/\s+/).slice(0, 3).join(' ') || 'General Expense';
      }
    }

    if (type !== 'Income') {
      type = guessType(category);
    }

    parsedRows.push({
      id: i,
      month,
      category,
      amount,
      type,
      description: cleanDesc,
      rawDate: String(rawDate || '')
    });
  }

  return reconcileWithDatabase(parsedRows, existingData);
}

export function reconcileWithDatabase(parsedRows, existingData = []) {
  return parsedRows.map(row => {
    // Find exact match
    const exactMatch = existingData.find(d => 
      d.month === row.month && 
      d.category.toLowerCase() === row.category.toLowerCase() && 
      Math.abs(d.amount - row.amount) < 1
    );

    if (exactMatch) {
      return { ...row, status: 'synced', checked: false, existingItem: exactMatch };
    }

    // Find category & month match with amount mismatch
    const mismatch = existingData.find(d => 
      d.month === row.month && 
      d.category.toLowerCase() === row.category.toLowerCase()
    );

    if (mismatch) {
      return { ...row, status: 'mismatch', checked: true, existingItem: mismatch };
    }

    // Completely new item
    return { ...row, status: 'new', checked: true, existingItem: null };
  });
}
