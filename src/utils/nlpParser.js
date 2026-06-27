// ── NLP Input Parser ──

const monthNames = {
  'jan': '01', 'january': '01', 'feb': '02', 'february': '02',
  'mar': '03', 'march': '03', 'apr': '04', 'april': '04',
  'may': '05', 'jun': '06', 'june': '06', 'jul': '07', 'july': '07',
  'aug': '08', 'august': '08', 'sep': '09', 'september': '09',
  'oct': '10', 'october': '10', 'nov': '11', 'november': '11',
  'dec': '12', 'december': '12'
};

export function guessType(category) {
  const cat = category.toLowerCase();
  const incomeKeywords = ['salary', 'income', 'bonus', 'dividend', 'incoming', 'rent received', 'interest'];
  const emiKeywords = ['loan', 'emi', 'lic', 'insurance'];
  const savingKeywords = ['saving', 'mf saving', 'land saving', 'bhima'];
  if (incomeKeywords.some(k => cat.includes(k))) return 'Income';
  if (emiKeywords.some(k => cat.includes(k))) return 'EMI';
  if (savingKeywords.some(k => cat.includes(k))) return 'Saving';
  return 'Expense';
}

export function parseNLPInput(text, knownCategories = []) {
  const result = { month: null, category: null, amount: null, type: null };
  if (!text || text.trim().length < 3) return null;

  const lower = text.toLowerCase().trim();

  // 1. Extract amount (look for numbers, optionally with ₹, rs, k suffix)
  const amountMatch = lower.match(/(?:₹|rs\.?\s*)?([\d,]+)(?:\.\d+)?\s*(?:k\b)?/i);
  if (amountMatch) {
    let amt = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (lower.includes(amountMatch[0].trim() + 'k') || lower.match(new RegExp(amountMatch[1].replace(/,/g, '') + '\\s*k\\b'))) {
      amt *= 1000;
    }
    result.amount = amt;
  }

  // 2. Extract month/year
  let monthMatched = false;
  for (const [name, num] of Object.entries(monthNames)) {
    const monthRegex = new RegExp(`\\b${name}\\b(?:\\s+(\\d{4}|\\d{2}))?`, 'i');
    const monthMatch = lower.match(monthRegex);
    if (monthMatch) {
      let year = monthMatch[1];
      if (!year) {
        year = new Date().getFullYear().toString();
      } else if (year.length === 2) {
        year = '20' + year;
      }
      result.month = `${year}-${num}`;
      monthMatched = true;
      break;
    }
  }

  // Check for YYYY-MM pattern
  const isoMatch = lower.match(/(\d{4})-(\d{2})/);
  if (isoMatch && !result.month) {
    result.month = isoMatch[0];
    monthMatched = true;
  }

  // "last month", "this month"
  if (!result.month) {
    const now = new Date();
    if (lower.includes('last month')) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      result.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else if (lower.includes('this month')) {
      result.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // 3. Extract category by fuzzy matching
  let remaining = lower
    .replace(/(?:₹|rs\.?)\s*[\d,]+\.?\d*\s*k?/gi, '')
    .replace(/\b(spent|paid|expense|for|on|in|of|the|my|a|an|is|was|to|at|from)\b/gi, '')
    .replace(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\b/gi, '')
    .replace(/\b\d{2,4}\b/g, '')
    .replace(/\b(last|this|next|month)\b/gi, '')
    .trim();

  let bestMatch = null;
  let bestScore = 0;

  knownCategories.forEach(cat => {
    const catLower = cat.toLowerCase();
    if (remaining.includes(catLower) || catLower.includes(remaining)) {
      const score = catLower.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }
    const words = remaining.split(/\s+/).filter(w => w.length > 2);
    words.forEach(word => {
      if (catLower.includes(word) || word.includes(catLower.split(' ')[0]?.toLowerCase())) {
        const s = word.length;
        if (s > bestScore) {
          bestScore = s;
          bestMatch = cat;
        }
      }
    });
  });

  if (bestMatch) {
    result.category = bestMatch;
    result.type = guessType(bestMatch);
  } else if (remaining.length > 1) {
    result.category = remaining.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    result.type = 'Expense';
  }

  // Default month to current if not set
  if (!result.month) {
    const now = new Date();
    result.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  if (!result.type) result.type = 'Expense';

  return result.amount ? result : null;
}
