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

export function extractPersonName(desc) {
  const s = String(desc || '')
  const seg = s.match(/UPI[A-Z]+\//i)
  if (seg) {
    const parts = s
      .slice(seg.index + seg[0].length)
      .split('/')
      .map((x) => x.trim())
      .filter(Boolean)
    if (parts.length >= 2) return parts[1]
    if (parts.length === 1) return parts[0].split('@')[0]
  }
  const m = s.match(/UPI\/([^/@\s]+)/i)
  if (m) return m[1]
  return null
}

export function cleanUPIDesc(desc) {
  const s = String(desc || '')
    .replace(/^U\d{4,}\s+/, '')
    .trim()
  if (!/UPI[A-Z]+\//i.test(s)) return s
  const name = extractPersonName(s)
  return name ? `UPI/${name}` : s
}

export function detectPeople(txns) {
  const map = new Map()
  for (const t of txns) {
    const name = (extractPersonName(t.desc) || '').slice(0, 30).trim()
    if (!name) continue
    const key = normalizeName(name)
    const dir = t.amount < 0 ? 'sent' : 'received'
    if (!map.has(key)) {
      map.set(key, { name, direction: dir })
    } else {
      const ex = map.get(key)
      map.set(key, { ...ex, direction: ex.direction === dir ? dir : 'both' })
    }
  }
  return [...map.values()]
}
export function personTxns(name, txns) {
  const lower = String(name || '').toLowerCase()
  if (!lower) return []
  const variants = [lower, lower.replace(/\s+/g, '')]
  return txns.filter((t) => {
    const d = String(t.desc || '').toLowerCase()
    return variants.some((v) => v && d.includes(v))
  })
}

export function personTotals(name, txns) {
  const lower = String(name || '').toLowerCase()
  if (!lower) return { sent: 0, received: 0 }
  const variants = new Set([lower, lower.replace(/\s+/g, '')])
  let sent = 0
  let received = 0
  for (const t of txns) {
    const d = String(t.desc || '').toLowerCase()
    const matched = [...variants].some((v) => v && d.includes(v))
    if (!matched) continue
    if (t.amount < 0) sent += -t.amount
    else if (t.amount > 0) received += t.amount
  }
  return { sent, received }
}

export function categorize(desc, people = [], amount = -1) {  const lower = String(desc || '').toLowerCase()
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

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function txnKey(t) {
  return [
    String(t.date || '').trim(),
    String(t.desc || '').toLowerCase().trim(),
    Number(t.amount || 0),
    String(t.method || '').trim(),
  ].join('|')
}

export function dedupeTxns(txns) {
  const seen = new Set()
  const out = []
  for (const t of txns) {
    const key = txnKey(t)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function emptyState() {
  return { txns: [], balances: {}, categories: DEFAULT_CATEGORIES, people: [], budgets: {}, goals: [] }
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
    const txnsRaw = dedupeTxns(
      (Array.isArray(data.txns) ? data.txns : []).filter((t) => t && typeof t === 'object'),
    )
    const txns = txnsRaw.map((t) => {
      const detected = extractPersonName(t.desc)
      const cat = String(t.category || '')
      const catIsDefault = DEFAULT_CATEGORIES.includes(cat)
      const catIsDetected = detected && cat.toUpperCase() === detected.trim().toUpperCase().slice(0, 30)
      if (!catIsDefault && (catIsDetected || cat.length <= 2)) {
        return { ...t, category: categorize(t.desc, [], t.amount) }
      }
      return t
    })
    const used = new Set(txns.map((t) => t.category))
    const cleanedCategories = [
      ...DEFAULT_CATEGORIES,
      ...categories.filter((c) => !DEFAULT_CATEGORIES.includes(c) && used.has(c)),
    ]
    const peopleMap = new Map()
    for (const p of (Array.isArray(data.people) ? data.people : [])) {
      if (!p || typeof p !== 'object') continue
      const name = normalizeName(p.name)
      if (!name) continue
      const entry = { name: p.name.trim(), category: p.category || 'Other', direction: p.direction || 'both' }
      if (peopleMap.has(name)) {
        const ex = peopleMap.get(name)
        const dirs = new Set([ex.direction, entry.direction])
        peopleMap.set(name, { ...ex, direction: dirs.size > 1 ? 'both' : ex.direction })
      } else {
        peopleMap.set(name, entry)
      }
    }
    const people = [...peopleMap.values()]
    return {
      txns,
      balances: data.balances && typeof data.balances === 'object' ? data.balances : {},
      categories: cleanedCategories,
      people,
      budgets: data.budgets && typeof data.budgets === 'object' ? data.budgets : {},
      goals: Array.isArray(data.goals) ? data.goals : [],
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

export function monthsFromTxns(txns) {
  const set = new Set()
  for (const t of txns) {
    const k = monthKey(t.date)
    if (k) set.add(k)
  }
  return [...set].sort()
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
  const header = (rows[0] || []).map((h) => String(h).toLowerCase().trim())
  const idxOf = (...names) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n))
      if (i >= 0) return i
    }
    return -1
  }
  const hasHeader =
    idxOf('date') >= 0 && (idxOf('amount', 'debit', 'credit', 'deposit', 'withdrawal', 'type') >= 0)
  const col = {
    date: hasHeader ? idxOf('date') : 0,
    desc: hasHeader ? idxOf('name', 'narrat', 'description', 'particular', 'note', 'remark') : 1,
    amount: hasHeader ? idxOf('amount', 'value', 'debit', 'credit', 'deposit', 'withdrawal') : 2,
    cat: hasHeader ? idxOf('category') : 3,
    method: hasHeader ? idxOf('method', 'mode', 'channel', 'upi', 'bank') : 4,
    type: hasHeader ? idxOf('type', 'dr', 'cr') : -1,
    note: hasHeader ? idxOf('note', 'remark', 'memo', 'utr') : -1,
  }
  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const get = (idx) => (idx >= 0 ? String(rows[i][idx] || '').trim() : '')
    const date = get(col.date)
    const amountRaw = get(col.amount)
    if (!date || !amountRaw) continue
    let num = parseFloat(String(amountRaw).replace(/[₹,\s]/g, ''))
    if (Number.isNaN(num)) continue
    if (col.type >= 0) {
      const type = get(col.type).toLowerCase()
      if (/deb|withdr|pay|sent|spent|dr\b/.test(type)) num = -Math.abs(num)
      else if (/cred|depos|rcvd|receiv|cr\b/.test(type)) num = Math.abs(num)
    }
    const desc = cleanUPIDesc(get(col.desc))
    const cat = get(col.cat) || categorize(desc, people, num)
    const method = get(col.method)
    const note = get(col.note)
    let iso = date
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
      const [a, b, c] = date.split('/').map(Number)
      iso = `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(date)) {
      const [a, b, c] = date.split('-').map(Number)
      iso = `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    } else {
      const m = date.match(/^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/)
      if (m) {
        const mm = PDF_MONTHS[m[2].toLowerCase()]
        if (mm) iso = `${m[3]}-${pad2(mm)}-${pad2(m[1])}`
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
    parsed.push({
      date: iso,
      desc,
      amount: num,
      category: cat,
      method: method || undefined,
      note: note || undefined,
    })
  }
  return parsed
}

export function exportCSV(state) {
  const header = 'Date,Description,Amount,Category,Method,Note'
  const lines = state.txns.map((t) => {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`
    return `${t.date},${esc(t.desc)},${t.amount},${esc(t.category)},${esc(t.method || '')},${esc(t.note || '')}`
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

function pdfDateToISO(line, refYear) {
  const now = new Date()
  const y = refYear || now.getFullYear()
  let m = line.match(/^(\d{1,2})[./ -](\d{1,2})[./ -](\d{4})\b/)
  if (m) {
    return { iso: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m[0].length }
  }
  m = line.match(/^(\d{1,2})[./ -](\d{1,2})[./ -](\d{2})\b/)
  if (m) {
    return { iso: `20${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m[0].length }
  }
  m = line.match(/^(\d{1,2})[./ -]([A-Za-z]{3})\.?\s+(\d{4})\b/)
  if (m) {
    const mm = PDF_MONTHS[m[2].toLowerCase()]
    if (mm) {
      return { iso: `${m[3]}-${pad2(mm)}-${pad2(m[1])}`, end: m[0].length }
    }
  }
  m = line.match(/^(\d{1,2})[./ -]([A-Za-z]{3})\.?\b/)
  if (m) {
    const mm = PDF_MONTHS[m[2].toLowerCase()]
    if (mm) {
      const yy = mm > now.getMonth() + 1 ? y - 1 : y
      return { iso: `${yy}-${pad2(mm)}-${pad2(m[1])}`, end: m[0].length }
    }
  }
  m = line.match(/^([A-Za-z]{3})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/)
  if (m) {
    const mm = PDF_MONTHS[m[1].toLowerCase()]
    if (mm) {
      const yy = m[3] ? m[3] : mm > now.getMonth() + 1 ? y - 1 : y
      return { iso: `${yy}-${pad2(mm)}-${pad2(m[2])}`, end: m[0].length }
    }
  }
  m = line.match(/\b(\d{1,2})[./ -](\d{1,2})[./ -](\d{4})\b/)
  if (m) {
    return { iso: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m.index + m[0].length }
  }
  return null
}

function cleanDesc(line) {
  return cleanUPIDesc(
    line
      .replace(/^\d{1,2}[./ -]\d{1,2}[./ -]\d{2,4}\b/, ' ')
      .replace(/\b\d{1,2}[./ -]\d{1,2}[./ -]\d{4}\b/g, ' ')
      .replace(/\b\d{1,2}\s+[A-Za-z]{3}\.?\s+\d{4}\b/g, ' ')
      .replace(/\b(dr|debit|cr|credit)\b/gi, ' ')
      .replace(/\s+[\d,]+\.\d{1,2}/g, ' ')
      .replace(/[A-Za-z]{2,}[\d,]+\.\d{1,2}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80),
  )
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
  const rest = lower.replace(/[-+]?\s*[\d,]+\.\d{1,2}/g, ' ').replace(/\s+/g, ' ').trim()
  if (rest === 'dr' || rest === 'debit' || rest.endsWith(' dr')) return -1
  if (rest === 'cr' || rest === 'credit' || rest.endsWith(' cr')) return 1
  if (amounts[0].sign === '+' || amounts[0].sign === '-') return amounts[0].sign === '+' ? 1 : -1
  return -1
}

export function parseBankPDF(text, people = []) {
  const out = []
  let pendingDate = null
  let pendingDesc = []
  let refYear = new Date().getFullYear()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const dateInfo = pdfDateToISO(line, refYear)
    if (dateInfo) {
      refYear = parseInt(dateInfo.iso.slice(0, 4), 10)
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

export const ACCOUNTS = ['Bank', 'Cash', 'UPI', 'Card', 'Other']

export function detectSubscriptions(txns) {
  const out = []
  const groups = new Map()
  for (const t of txns) {
    if (t.amount >= 0) continue
    const key = normalizeName(t.desc) + '|' + (t.method || '') + '|' + t.amount
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }
  for (const [key, group] of groups) {
    if (group.length < 3) continue
    const months = new Set(group.map((t) => t.date.slice(0, 7)))
    if (months.size < 3) continue
    const sorted = [...group].sort((a, b) => (a.date < b.date ? 1 : -1))
    const amounts = new Set(group.map((t) => t.amount))
    if (amounts.size > 1) continue
    out.push({
      name: group[0].desc,
      amount: -group[0].amount,
      category: group[0].category,
      method: group[0].method || '',
      times: group.length,
      months: months.size,
      last: sorted[0].date,
    })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

export function generateInsights(state, monthTxns, spent, income, month, monthBudget) {
  const insights = []
  if (monthTxns.length === 0) return insights
  const spendTxns = monthTxns.filter((t) => t.amount < 0)
  const incTxns = monthTxns.filter((t) => t.amount > 0)
  const byCat = new Map()
  for (const t of spendTxns) byCat.set(t.category, (byCat.get(t.category) || 0) + -t.amount)
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  if (cats.length > 0) {
    const [topCat, topAmt] = cats[0]
    const pct = Math.round((topAmt / spent) * 100)
    insights.push({
      icon: '🔥',
      title: `${topCat} is your biggest spend`,
      body: `${fmt(pct)}% of this month (${fmtMoney(topAmt)}). Consider a ${topCat.toLowerCase()} budget if it feels high.`,
    })
  }
  const dayCount = new Set(spendTxns.map((t) => t.date)).size
  const avgDay = dayCount > 0 ? spent / dayCount : 0
  insights.push({
    icon: '📅',
    title: `${fmtMoney(avgDay)} spent per active day`,
    body: `${fmtMoney(spent)} across ${dayCount} days, ${spendTxns.length} transactions (avg ${fmtMoney(spent / (spendTxns.length || 1))} each).`,
  })
  const big = spendTxns.reduce((m, t) => (t.amount < m.amount ? t : m), spendTxns[0])
  if (big) {
    insights.push({
      icon: '💥',
      title: `Largest expense: ${fmtMoney(-big.amount)}`,
      body: `${big.desc} on ${fmtDateShort(big.date)} — that's ${fmt(Math.round((-big.amount / spent) * 100))}% of the month.`,
    })
  }
  if (incTxns.length > 0 && income > 0 && spent > 0) {
    const rate = Math.max(0, Math.round(((income - spent) / income) * 100))
    const ok = income - spent >= 0
    insights.push({
      icon: ok ? '🏦' : '🚨',
      title: ok ? `Savings rate ${rate}%` : `Spending ${fmt(-(income - spent))} more than you earned`,
      body: ok
        ? `You saved ${fmtMoney(income - spent)} this month. ${rate >= 20 ? 'Great discipline! Try to keep it above 20%.' : 'Aim for at least 20% to build a cushion.'}`
        : `You spent ${fmtMoney(spent)} against ${fmtMoney(income)} earned. Cut back or the gap grows every month.`,
    })
  }
  const weekend = spendTxns.filter((t) => [0, 6].includes(new Date(t.date).getDay()))
  const weekPct = Math.round((weekend.reduce((s, t) => s + -t.amount, 0) / spent) * 100)
  if (weekend.length > 0 && weekPct >= 30) {
    insights.push({
      icon: '🎉',
      title: `${weekPct}% spent on weekends`,
      body: `${fmtMoney(weekend.reduce((s, t) => s + -t.amount, 0))} on ${weekend.length} weekend transactions. Fun is good — just keep it under a third.`,
    })
  }
  if (monthBudget > 0) {
    const pct = (spent / monthBudget) * 100
    insights.push({
      icon: pct >= 100 ? '🚨' : pct >= 80 ? '⚠️' : '✅',
      title: pct >= 100 ? 'Over budget' : pct >= 80 ? `${fmt(pct)}% of budget used` : `On track: ${fmt(pct)}% of budget`,
      body:
        pct >= 100
          ? `You're ${fmtMoney(spent - monthBudget)} over. Review the rest of the month before spending more.`
          : pct >= 80
            ? `${fmtMoney(monthBudget - spent)} left for the month — pace your remaining spending.`
            : `${fmtMoney(monthBudget - spent)} still available. Keep it going.`,
    })
  }
  return insights
}

export function computeHealthScore(state, month) {
  const txns = state.txns
  if (txns.length === 0) return { score: null, grade: null, tips: [] }
  let score = 0
  const tips = []
  const monthSpend = txns.filter((t) => t.date.startsWith(month) && t.amount < 0)
  const monthInc = txns.filter((t) => t.date.startsWith(month) && t.amount > 0)
  const spent = monthSpend.reduce((s, t) => s + -t.amount, 0)
  const income = monthInc.reduce((s, t) => s + t.amount, 0)
  const budget = state.budgets?.[month] || 0

  if (budget > 0 && spent > 0) {
    const ratio = spent / budget
    if (ratio <= 1) {
      score += 30 - Math.max(0, (ratio - 0.5)) * 10
      tips.push('Sticking to your budget — excellent.')
    } else {
      score += Math.max(0, 20 - (ratio - 1) * 15)
      tips.push('You exceeded your monthly budget — trim discretionary spending.')
    }
  } else {
    score += 20
    tips.push('Set a monthly budget to unlock full score benefits.')
  }
  const net = income - spent
  if (income > 0) {
    const rate = net / income
    score += 30 * Math.max(0, rate)
    if (rate >= 0.2) tips.push('Savings rate above 20% — great discipline.')
    else if (rate >= 0) tips.push('You saved some, but a 20%+ savings rate is the healthy target.')
    else tips.push('Spending more than you earn each month is risky — cut back.')
  } else {
    score += 15
    tips.push('Log your income to get savings-rate points.')
  }
  if (txns.length >= 30) {
    score += 20
    tips.push('Long transaction history — solid tracking habit.')
  } else {
    score += Math.min(20, txns.length / 30 * 20)
    tips.push('The more you log, the smarter the insights get.')
  }
  const spendAll = txns.filter((t) => t.amount < 0)
  const catTotals = new Map()
  for (const t of spendAll) catTotals.set(t.category, (catTotals.get(t.category) || 0) + -t.amount)
  const topShare = catTotals.size ? Math.max(...catTotals.values()) / (spendAll.reduce((s, t) => s + -t.amount, 0) || 1) : 1
  score += 15 * (1 - topShare)
  if (topShare > 0.7) tips.push('Over 70% of your spending is in one category — diversifying reduces risk.')
  else if (topShare > 0.45) tips.push('Spending is a bit concentrated — check your top category.')
  else tips.push('Well-diversified spending across categories.')

  score = Math.round(Math.min(100, Math.max(0, score)))
  const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs work'
  return { score, grade, tips }
}

export async function encryptBackup(json, password) {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json))
  return {
    app: 'expense-tracker',
    version: 1,
    encrypted: true,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(cipher))),
  }
}

export async function decryptBackup(obj, password) {
  const toBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  const key = await deriveKey(password, toBytes(obj.salt))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBytes(obj.iv) }, key, toBytes(obj.data))
  return JSON.parse(new TextDecoder().decode(plain))
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function fmtDateShort(iso) {
  if (!iso) return '?'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
