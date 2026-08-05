const STORAGE_KEY = 'expense-tracker-v1'

export const DEFAULT_CATEGORIES = [
  'Food',
  'Groceries',
  'Travel',
  'Petrol',
  'Shopping',
  'Bills',
  'Rent',
  'Education',
  'Gifts',
  'Fees',
  'Entertainment',
  'Health',
  'Other',
]

export const CATEGORY_COLORS = {
  Food: '#f97316',
  Groceries: '#22c55e',
  Travel: '#3b82f6',
  Petrol: '#ef4444',
  Shopping: '#a855f7',
  Bills: '#0ea5e9',
  Rent: '#6366f1',
  Education: '#8b5cf6',
  Gifts: '#f59e0b',
  Fees: '#84cc16',
  Entertainment: '#ec4899',
  Health: '#14b8a6',
  Other: '#64748b',
}

const CATEGORY_KEYWORDS = [
  ['Petrol', ['indian oil', 'iocl', 'hpcl', 'hindustan petroleum', 'bharat petroleum', 'bpcl', 'shell', 'nayara', 'jio-bp', 'reliance petroleum', 'express fuel', 'petrol', 'diesel', 'gas station', 'fuel', 'petro']],
  ['Food', ['cafe coffee day', 'bikanervala', 'burger king', 'starbucks', 'chaayos', 'haldiram', 'wow momo', 'zaitoon', 'behrouz', 'dominos', 'mcdonald', 'swiggy', 'zomato', 'faasos', 'eatfit', 'pizza hut', 'subway', 'barista', 'restaurant', 'ice cream', 'bakery', 'biryani', 'dhaba', 'tiffin', 'cafe', 'hotel', 'snacks', 'burger', 'pizza', 'juice', 'food', 'mess', 'chai']],
  ['Groceries', ['bigbasket', 'big basket', 'natures basket', 'reliance fresh', 'more retail', 'more supermarket', 'instamart', 'grofers', 'supermarket', 'dmart', 'blinkit', 'zepto', 'kirana', 'sabzi', 'vegetable', 'vegetables', 'grocer', 'groceries', 'provision', 'ration', 'dairy', 'licious', 'milk', 'fruits', 'fruit']],
  ['Travel', ['namma yatri', 'blusmart', 'redbus', 'red bus', 'abhibus', 'makemytrip', 'make my trip', 'goibibo', 'go ibibo', 'air india', 'spicejet', 'spice jet', 'vistara', 'akasa', 'irctc', 'railway', 'fabhotels', 'treebo', 'yulu', 'rapido', 'flight', 'airport', 'fastag', 'train', 'metro', 'taxi', 'cabs', 'cab', 'uber', 'ola', 'oyo', 'yatra', 'toll', 'parking']],
  ['Bills', ['tata power', 'adani electricity', 'torrent power', 'act fibernet', 'hathway', 'mahanagar gas', 'electricity', 'broadband', 'postpaid', 'prepaid', 'recharge', 'insurance', 'dishtv', 'tatasky', 'tata sky', 'indane', 'bsnl', 'airtel', 'jio', 'vodafone', 'internet', 'wifi', 'dth', 'gas bill', 'water bill', 'bijli', 'bill']],
  ['Rent', ['house owner', 'landlord', 'flat rent', 'pg rent', 'rent']],
  ['Entertainment', ['bookmyshow', 'book my show', 'prime video', 'amazon prime', 'play station', 'playstation', 'jiosaavn', 'sonyliv', 'sony liv', 'jiocinema', 'jio cinema', 'netflix', 'hotstar', 'spotify', 'gaana', 'wynk', 'disney', 'zee5', 'multiplex', 'cinema', 'movies', 'movie', 'pvr', 'inox', 'steam', 'youtube', 'app store', 'play store', 'subscription', 'ott', 'games', 'game', 'apple']],
  ['Shopping', ['vijay sales', 'reliance digital', 'max fashion', 'boat lifestyle', 'tatacliq', 'tata cliq', 'flipkart', 'myntra', 'meesho', 'ajio', 'nykaa', 'firstcry', 'lenskart', 'decathlon', 'pantaloons', 'westside', 'zudio', 'amazon', 'shopping', 'footwear', 'clothes', 'mall', 'nike', 'adidas', 'puma', 'ikea', 'croma', 'fabindia', 'lifestyle', 'shop']],
  ['Health', ['pharmeasy', 'netmeds', 'cultfit', 'cult fit', 'healthifyme', 'healthify me', 'practo', 'apollo', 'medplus', 'hospital', 'pharmacy', 'medical', 'medicine', 'diagnostic', 'doctor', 'dental', 'clinic', 'ayurveda', 'physio', 'gym', 'yoga', '1mg']],
  ['Education', ['coursera', 'udemy', 'udacity', 'unacademy', 'byjus', 'byju', 'vedantu', 'college', 'school', 'tuition', 'education', 'course', 'books', 'book store', 'library']],
  ['Gifts', ['gift', 'donation', 'donate', 'charity']],
  ['Fees', ['challan', 'fine', 'penalty', 'emi', 'loan', 'insurance premium', 'registration fee', 'fee', 'fees', 'tax']],
]

const FLAT_RULES = CATEGORY_KEYWORDS.flatMap(([cat, kws]) =>
  kws.map((kw) => ({
    cat,
    kw,
    re: /^[a-z0-9]+$/.test(kw) ? new RegExp(`\\b${kw}\\b`) : null,
  })),
).sort((a, b) => b.kw.length - a.kw.length)

const INCLUDES_EXCLUDE = new Set([
  'train', 'rent', 'bill', 'shop', 'food', 'fuel', 'milk', 'chai', 'game', 'mall',
  'mess', 'movie', 'taxi', 'cab', 'toll', 'gym', 'vi', 'jio', 'dth', 'juice',
])

function ruleMatches(rule, lower) {
  if (!rule.re) return lower.includes(rule.kw)
  if (rule.re.test(lower)) return true
  if (rule.kw.length >= 5 && !INCLUDES_EXCLUDE.has(rule.kw)) {
    return lower.includes(rule.kw)
  }
  return false
}

export function categorize(desc, people = [], amount = -1) {
  const lower = String(desc || '').toLowerCase()
  if (!lower) return 'Other'
  const isExpense = amount < 0
  const personRules = people
    .filter((p) => {
      if (!p || !p.name) return false
      const dir = p.direction || 'both'
      return isExpense ? dir !== 'received' : dir !== 'sent'
    })
    .map((p) => {
      const variants = []
      const name = p.name.toLowerCase()
      if (name) variants.push(name)
      const joined = name.replace(/\s+/g, '')
      if (joined && joined !== name) variants.push(joined)
      return { category: p.category || 'Other', variants }
    })
    .sort((a, b) => b.variants[0].length - a.variants[0].length)
  for (const p of personRules) {
    for (const v of p.variants) {
      if (lower.includes(v)) return p.category
    }
  }
  for (const rule of FLAT_RULES) {
    if (ruleMatches(rule, lower)) return rule.cat
  }
  return 'Other'
}

export function emptyState() {
  return { txns: [], balances: {}, categories: DEFAULT_CATEGORIES, people: [] }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const data = JSON.parse(raw)
    const categories =
      Array.isArray(data.categories) && data.categories.length > 0
        ? data.categories
        : DEFAULT_CATEGORIES
    for (const d of DEFAULT_CATEGORIES) {
      if (!categories.includes(d)) categories.push(d)
    }
    const txns = (Array.isArray(data.txns) ? data.txns : []).filter((t) => t && typeof t === 'object')
    const people = (Array.isArray(data.people) ? data.people : [])
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({ name: String(p.name || ''), category: p.category || 'Other', direction: p.direction || 'both' }))
    return {
      txns,
      balances: data.balances && typeof data.balances === 'object' ? data.balances : {},
      categories,
      people,
    }
  } catch {
    return emptyState()
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY)
}

export function monthKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function formatMonth(key) {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[m - 1]} ${y}`
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function fmtMoney(n) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

export function parseBankCSV(text, people = []) {
  const rows = parseCSV(text)
  const parsed = []
  let start = 0
  if (rows.length > 0) {
    const header = rows[0].map((h) => h.toLowerCase())
    if (header.some((h) => /date|amount|desc/.test(h))) start = 1
  }
  for (let i = start; i < rows.length; i++) {
    const [dateRaw, descRaw, amountRaw, catRaw, methodRaw] = rows[i]
    const date = (dateRaw || '').trim()
    if (!date || !amountRaw) continue
    const num = parseFloat(String(amountRaw).replace(/[₹,\s]/g, ''))
    if (Number.isNaN(num)) continue
    const desc = (descRaw || '').trim()
    const cat = (catRaw || '').trim() || categorize(desc, people, num)
    const method = (methodRaw || '').trim()
    let iso = date
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
      const [a, b, c] = date.split('/').map(Number)
      iso = `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(date)) {
      const [a, b, c] = date.split('-').map(Number)
      iso = `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
    parsed.push({ date: iso, desc, amount: num, category: cat, method: method || undefined })
  }
  return parsed
}

export function exportCSV(state) {
  const header = 'Date,Description,Amount,Category,Method'
  const lines = state.txns.map((t) => {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`
    return `${t.date},${esc(t.desc)},${t.amount},${esc(t.category)},${esc(t.method || '')}`
  })
  return [header, ...lines].join('\n')
}

const PDF_MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function pdfDateToISO(line) {
  let m = line.match(/^(\d{1,2})[./ -](\d{1,2})[./ -](\d{4})\b/)
  if (m) {
    return { iso: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m[0].length }
  }
  m = line.match(/^(\d{1,2})[./ -](\d{1,2})[./ -](\d{2})\b/)
  if (m) {
    return { iso: `20${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m[0].length }
  }
  m = line.match(/^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})\b/)
  if (m) {
    const mm = PDF_MONTHS[m[2].toLowerCase()]
    if (mm) {
      return { iso: `${m[3]}-${pad2(mm)}-${pad2(m[1])}`, end: m[0].length }
    }
  }
  m = line.match(/\b(\d{1,2})[./ -](\d{1,2})[./ -](\d{4})\b/)
  if (m) {
    return { iso: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m.index + m[0].length }
  }
  return null
}

function cleanDesc(line) {
  return line
    .replace(/^\d{1,2}[./ -]\d{1,2}[./ -]\d{2,4}\b/, ' ')
    .replace(/\b\d{1,2}[./ -]\d{1,2}[./ -]\d{4}\b/g, ' ')
    .replace(/\b\d{1,2}\s+[A-Za-z]{3}\.?\s+\d{4}\b/g, ' ')
    .replace(/\b(dr|debit|cr|credit)\b/gi, ' ')
    .replace(/\s+[\d,]+\.\d{1,2}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function extractAmounts(text) {
  const amounts = []
  const am = /([-+]?)\s*([\d,]+\.\d{1,2})/g
  let x
  while ((x = am.exec(text))) {
    amounts.push({ sign: x[1], val: parseFloat(x[2].replace(/,/g, '')) })
  }
  return amounts
}

function amountSign(line, amounts) {
  const lower = line.toLowerCase()
  if (/\b(dr|debit)\b/.test(lower)) return -1
  if (/\b(cr|credit)\b/.test(lower)) return 1
  if (amounts[0].sign === '+' || amounts[0].sign === '-') return amounts[0].sign === '+' ? 1 : -1
  return -1
}

export function parseBankPDF(text, people = []) {
  const out = []
  let pendingDate = null
  let pendingDesc = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const dateInfo = pdfDateToISO(line)

    if (dateInfo) {
      const amounts = extractAmounts(line.slice(dateInfo.end))
      if (amounts.length === 0) {
        pendingDate = dateInfo.iso
        pendingDesc = [cleanDesc(line)]
        continue
      }
      pendingDate = null
      pendingDesc = []
      const amount = amountSign(line, amounts) * amounts[0].val
      if (amount === 0) continue
      let desc = cleanDesc(line)
      if (!desc) desc = 'Bank transaction'
      out.push({ date: dateInfo.iso, desc, amount, category: categorize(desc, people, amount) })
      continue
    }

    if (!pendingDate) continue
    const amounts = extractAmounts(line)
    if (amounts.length === 0) {
      if (/balance|closing|opening|page|total|continued/i.test(line)) continue
      const part = cleanDesc(line)
      if (part) pendingDesc.push(part)
      continue
    }
    const amount = amountSign(line, amounts) * amounts[0].val
    if (amount === 0) continue
    const amountPart = cleanDesc(line.replace(/[-+]?\s*[\d,]+\.\d{1,2}/g, ' '))
    const descParts = [...pendingDesc, amountPart].filter(Boolean)
    const desc = (descParts.join(' ') || 'Bank transaction').slice(0, 80)
    out.push({ date: pendingDate, desc, amount, category: categorize(desc, people, amount) })
    pendingDate = null
    pendingDesc = []
  }
  return out
}
