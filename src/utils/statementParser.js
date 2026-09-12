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
    if (rowStr.includes('date') || rowStr.includes('month') || rowStr.includes('narration') || rowStr.includes('description') || rowStr.includes('amount') || rowStr.includes('debit') || rowStr.includes('credit')) {
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
  const typeIdx = headers.findIndex(h => h === 'type' || h.includes('cr/dr'));
  const monthIdx = headers.findIndex(h => h === 'month');
  const catIdx = headers.findIndex(h => h === 'category');

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
    const rawMonth = monthIdx !== -1 ? row[monthIdx] : null;
    const rawExplicitCategory = catIdx !== -1 ? row[catIdx] : null;
    const rawExplicitType = typeIdx !== -1 ? row[typeIdx] : null;

    if (!rawDate && !rawMonth && !rawAmount && !rawDebit && !rawCredit) continue;

    // Process Date -> YYYY-MM
    let month = new Date().toISOString().slice(0, 7); // fallback
    if (rawMonth) {
      // Direct YYYY-MM string
      month = String(rawMonth).trim();
    } else if (rawDate) {
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

    const numDebit = rawDebit ? parseFloat(String(rawDebit).replace(/[^\d.-]/g, '')) : 0;
    const numCredit = rawCredit ? parseFloat(String(rawCredit).replace(/[^\d.-]/g, '')) : 0;

    if (numDebit > 0) {
      amount = numDebit;
    } else if (numCredit > 0) {
      amount = numCredit;
    } else if (rawAmount) {
      amount = Math.abs(parseFloat(String(rawAmount).replace(/[^\d.-]/g, '')) || 0);
    }

    if (rawExplicitType) {
      const et = String(rawExplicitType).toLowerCase();
      if (et.includes('expense')) type = 'Expense';
      else if (et.includes('income')) type = 'Income';
      else if (et.includes('saving')) type = 'Saving';
      else if (et.includes('emi')) type = 'EMI';
    } else {
      if (numDebit > 0) {
        type = 'Expense';
      } else if (numCredit > 0) {
        type = 'Income';
      } else if (rawAmount) {
        if (String(rawAmount).includes('-') || (typeIdx !== -1 && String(row[typeIdx]).toLowerCase().includes('dr'))) {
          type = 'Expense';
        } else if (typeIdx !== -1 && String(row[typeIdx]).toLowerCase().includes('cr')) {
          type = 'Income';
        }
      }
    }

    if (!amount || amount === 0) continue;

    // Smart Category Normalization using fuzzy match
    const cleanDesc = String(rawDesc || '').trim();
    let category = 'Uncategorized';
    let highestConfidence = 0;

    const lowerDesc = cleanDesc.toLowerCase();
    
    if (rawExplicitCategory) {
      category = String(rawExplicitCategory).trim();
      highestConfidence = 100;
    } else if (knownCategories && knownCategories.length > 0) {
      for (const known of knownCategories) {
        const knownLower = known.toLowerCase();
        
        // Exact match
        if (lowerDesc === knownLower) {
          category = known;
          highestConfidence = 100;
          break;
        }

        // Substring match
        if (lowerDesc.includes(knownLower)) {
          // longer match is better
          const score = (knownLower.length / lowerDesc.length) * 100;
          if (score > highestConfidence) {
            highestConfidence = score;
            category = known;
          }
        }
      }
    }

    if (highestConfidence === 0) {
      category = cleanDesc.split(/\s+/).slice(0, 3).join(' ') || 'General Expense';
    }

    if (type !== 'Income' && type !== 'Saving' && type !== 'EMI' && !rawExplicitType) {
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
