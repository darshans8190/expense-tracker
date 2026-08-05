import { Component, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadState,
  saveState,
  resetState,
  monthKey,
  todayStr,
  formatMonth,
  shiftMonth,
  monthsFromTxns,
  fmtMoney,
  parseBankCSV,
  parseBankPDF,
  categorize,
  normalizeName,
  personTxns,
  personTotals,
  extractPersonName,
  exportCSV,
  CATEGORY_COLORS,
  txnKey,
  ACCOUNTS,
  detectSubscriptions,
  generateInsights,
  computeHealthScore,
  encryptBackup,
  decryptBackup,
} from './store.js'

async function readPdf(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    let lastY = null
    for (const item of content.items) {
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        text += line + '\n'
        line = ''
      }
      line += (line ? ' ' : '') + item.str
      lastY = y
    }
    text += line + '\n'
  }
  return { text, pages: pdf.numPages }
}

async function ocrPdf(file, onProgress) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const { createWorker } = await import('tesseract.js')
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const worker = await createWorker('eng', 1, {
    workerPath: `${import.meta.env.BASE_URL}tess/worker.min.js`,
    corePath: `${import.meta.env.BASE_URL}tess/`,
    langPath: `${import.meta.env.BASE_URL}tess/`,
  })
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2, 4096 / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    if (onProgress) onProgress(i, pdf.numPages)
    const { data: ocr } = await worker.recognize(canvas)
    text += ocr.text + '\n'
  }
  await worker.terminate()
  return text
}

function loadImageCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load this image'))
    }
    img.src = url
  })
}

async function ocrImage(file, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const canvas = await loadImageCanvas(file)
  const worker = await createWorker('eng', 1, {
    workerPath: `${import.meta.env.BASE_URL}tess/worker.min.js`,
    corePath: `${import.meta.env.BASE_URL}tess/`,
    langPath: `${import.meta.env.BASE_URL}tess/`,
  })
  if (onProgress) onProgress(1, 1)
  const { data: ocr } = await worker.recognize(canvas)
  await worker.terminate()
  return ocr.text
}

const CATEGORY_EMOJI = {
  Food: '🍔',
  Groceries: '🛒',
  Travel: '✈️',
  Petrol: '⛽',
  Shopping: '🛍️',
  Bills: '💡',
  Rent: '🏠',
  Education: '📚',
  Gifts: '🎁',
  Fees: '💳',
  Entertainment: '🎬',
  Health: '💊',
  Income: '💰',
  Other: '📦',
}

function emojiFor(category) {
  return CATEGORY_EMOJI[category] || '🏷️'
}

function colorFor(category) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category]
  let h = 0
  for (const ch of String(category || '')) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h}, 55%, 45%)`
}

function fmtShort(v) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1).replace(/\.0$/, '')}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
  return `₹${v}`
}

function resizePhoto(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

function Donut({ slices, size = 148, centerLabel }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return null
  let acc = 0
  const stops = slices.map((s) => {
    const from = (acc / total) * 360
    acc += s.value
    const to = (acc / total) * 360
    return `${s.color} ${from}% ${to}%`
  })
  return (
    <div className="donut-wrap">
      <div
        className="donut"
        style={{ width: size, height: size, background: `conic-gradient(${stops.join(', ')})` }}
      />
      <div className="donut-center">
        <span className="donut-label">{centerLabel}</span>
        <span className="donut-value">{fmtMoney(total)}</span>
      </div>
    </div>
  )
}

function isFailMsg(msg) {
  return /Could not|Failed|password|encrypt/i.test(msg)
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="panel">
            <h2>Something went wrong</h2>
            <p className="hint">
              {String(this.state.error && this.state.error.message).slice(0, 300)}
            </p>
            <button
              className="primary"
              onClick={() => {
                this.setState({ error: null })
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const [state, setState] = useState(loadState)
  const [month, setMonth] = useState(monthKey(todayStr()) || '2026-08')
  const [form, setForm] = useState({
    amount: '',
    type: 'expense',
    category: 'Food',
    desc: '',
    date: todayStr(),
    method: 'UPI',
    account: 'Bank',
    editingId: null,
    photo: null,
    note: '',
  })
  const [accountFilter, setAccountFilter] = useState('All')
  const [voiceMsg, setVoiceMsg] = useState('')
  const [listening, setListening] = useState(false)
  const [scan, setScan] = useState(null)
  const [splitTxn, setSplitTxn] = useState(null)
  const [splitNames, setSplitNames] = useState('')
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [backupPass, setBackupPass] = useState('')
  const [backupMsg, setBackupMsg] = useState('')
  const [enableAlerts, setEnableAlerts] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [photoView, setPhotoView] = useState(null)
  const [personName, setPersonName] = useState('')
  const [personCat, setPersonCat] = useState('Food')
  const [personDir, setPersonDir] = useState('sent')
  const [copiedMsg, setCopiedMsg] = useState('')
  const [rawText, setRawText] = useState('')
  const [pastedText, setPastedText] = useState('')
  const fileRef = useRef(null)
  const photoRef = useRef(null)
  const scanRef = useRef(null)
  const backupRef = useRef(null)

  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('expense-tracker-theme') === 'dark'
    } catch {
      return false
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    try {
      localStorage.setItem('expense-tracker-theme', dark ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [dark])

  useEffect(() => {
    try {
      saveState(state)
    } catch {
      setImportMsg(
        'Could not save — your browser storage is full. Try deleting photos from old transactions or removing old data.',
      )
    }
  }, [state])

  const monthTxnsRaw = useMemo(
    () =>
      state.txns
        .filter((t) => monthKey(t.date) === month)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [state.txns, month],
  )

  const accountsUsed = useMemo(() => {
    const set = new Set(['All'])
    for (const t of state.txns) set.add(t.account || 'Bank')
    return [...set]
  }, [state.txns])

  const monthTxns = useMemo(
    () =>
      accountFilter === 'All' ? monthTxnsRaw : monthTxnsRaw.filter((t) => (t.account || 'Bank') === accountFilter),
    [monthTxnsRaw, accountFilter],
  )

  const spent = monthTxns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)
  const income = monthTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const startBalance = state.balances[month]?.start ?? 0
  const computedEnd = startBalance + income - spent
  const actualEndStr = state.balances[month]?.actual != null ? String(state.balances[month].actual) : ''
  const actualEndNum = actualEndStr === '' ? null : parseFloat(actualEndStr)

  const catTotals = useMemo(() => {
    const map = new Map()
    for (const t of monthTxns) {
      if (t.amount >= 0) continue
      map.set(t.category, (map.get(t.category) || 0) - t.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [monthTxns])

  const dailySpend = useMemo(() => {
    const map = new Map()
    for (const t of monthTxns) {
      if (t.amount >= 0) continue
      map.set(t.date.slice(8, 10), (map.get(t.date.slice(8, 10)) || 0) - t.amount)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [monthTxns])
  const maxDay = dailySpend.reduce((m, [, v]) => Math.max(m, v), 0)

  const donutSlices = useMemo(() => {
    if (catTotals.length === 0) return []
    const top = catTotals.slice(0, 6)
    const rest = catTotals.slice(6)
    const slices = top.map(([cat, total]) => ({ name: cat, value: total, color: colorFor(cat) }))
    if (rest.length > 0) {
      slices.push({ name: 'Other', value: rest.reduce((s, [, v]) => s + v, 0), color: colorFor('Other') })
    }
    return slices
  }, [catTotals])

  const statementTxns = useMemo(
    () => [...monthTxns].sort((a, b) => (a.date > b.date ? 1 : -1)),
    [monthTxns],
  )

  const peopleMonth = useMemo(
    () =>
      state.people
        .map((p) => {
          const txns = personTxns(p.name, monthTxns)
          const sent = txns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)
          const received = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
          return { name: p.name, sent, received, txns }
        })
        .filter((g) => g.sent > 0 || g.received > 0)
        .sort((a, b) => b.sent + b.received - (a.sent + a.received)),
    [state.people, monthTxns],
  )
  const pSent = peopleMonth.reduce((s, g) => s + g.sent, 0)
  const pRecv = peopleMonth.reduce((s, g) => s + g.received, 0)
  const pMax = Math.max(...peopleMonth.map((g) => g.sent + g.received), 1)

  const peopleSummary = useMemo(() => {
    let sent = 0
    let received = 0
    for (const p of state.people) {
      const t = personTotals(p.name, state.txns)
      sent += t.sent
      received += t.received
    }
    return { sent, received }
  }, [state.people, state.txns])

  const dataMonths = useMemo(() => monthsFromTxns(state.txns), [state.txns])
  const allMonths = useMemo(() => {
    const set = new Set([month, ...dataMonths])
    return [...set].sort()
  }, [month, dataMonths])
  const allSpent = state.txns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)
  const allIncome = state.txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)

  const monthBudget = state.budgets?.[month] ?? 0
  const budgetPct = monthBudget > 0 ? Math.min(100, (spent / monthBudget) * 100) : 0
  const overBudget = monthBudget > 0 && spent > monthBudget

  const subscriptions = useMemo(() => detectSubscriptions(state.txns), [state.txns])
  const subTotal = subscriptions.reduce((s, x) => s + x.amount, 0)
  const insights = useMemo(
    () => generateInsights(state, monthTxns, spent, income, month, monthBudget),
    [state.txns, monthTxns, spent, income, month, monthBudget],
  )
  const health = useMemo(() => computeHealthScore(state, month), [state.txns, state.budgets, month])
  const goalsTotal = (state.goals || []).reduce((s, g) => s + (g.saved || 0), 0)

  useEffect(() => {
    if (overBudget && enableAlerts && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        try {
          const key = `expense-alert-${month}`
          if (!localStorage.getItem(key)) {
            new Notification('Over budget ⚠️', {
              body: `You've spent ${fmtMoney(spent)} against a budget of ${fmtMoney(monthBudget)} this month.`,
            })
            localStorage.setItem(key, '1')
          }
        } catch {
          /* ignore */
        }
      } else if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
  }, [overBudget, enableAlerts, month, spent, monthBudget])

  function enableBudgetAlerts() {
    setEnableAlerts(true)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    setImportMsg('Budget alerts enabled — you will get a notification when a month goes over budget.')
  }

  function addGoal() {
    const name = goalName.trim()
    const target = parseFloat(goalTarget)
    if (!name || !target || target <= 0) return
    setState((s) => ({
      ...s,
      goals: [...(s.goals || []), { id: uid(), name, target, saved: 0 }],
    }))
    setGoalName('')
    setGoalTarget('')
  }

  function contributeGoal(id, amount) {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    setState((s) => ({
      ...s,
      goals: (s.goals || []).map((g) => (g.id === id ? { ...g, saved: (g.saved || 0) + amt } : g)),
    }))
  }

  function removeGoal(id) {
    setState((s) => ({ ...s, goals: (s.goals || []).filter((g) => g.id !== id) }))
  }

  function addTxn(e) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!amount || Number.isNaN(amount)) return
    const signed = form.type === 'expense' ? -Math.abs(amount) : Math.abs(amount)
    const txn = {
      id: form.editingId || uid(),
      date: form.date || todayStr(),
      desc: form.desc.trim() || (form.editingId ? '(edited)' : ''),
      amount: signed,
      category: form.category,
      method: form.method,
      account: form.account || 'Bank',
      photo: form.photo || null,
      note: form.note.trim() || null,
    }
    setState((s) => {
      const exists = s.txns.some((t) => t.id === txn.id)
      return {
        ...s,
        txns: exists ? s.txns.map((t) => (t.id === txn.id ? txn : t)) : [txn, ...s.txns],
      }
    })
    setForm({ amount: '', type: 'expense', category: 'Food', desc: '', date: todayStr(), method: 'UPI', account: 'Bank', editingId: null, photo: null, note: '' })
  }

  function pickPhoto(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    resizePhoto(file)
      .then((dataUrl) => setForm((f) => ({ ...f, photo: dataUrl })))
      .catch(() => setImportMsg('Could not read that photo. Try a different image.'))
    if (photoRef.current) photoRef.current.value = ''
  }

  function deleteTxn(id) {
    setState((s) => ({ ...s, txns: s.txns.filter((t) => t.id !== id) }))
  }

  function editTxn(t) {
    setForm({
      amount: String(Math.abs(t.amount)),
      type: t.amount < 0 ? 'expense' : 'income',
      category: t.category,
      desc: t.desc,
      date: t.date,
      method: t.method || 'UPI',
      account: t.account || 'Bank',
      editingId: t.id,
      photo: t.photo || null,
      note: t.note || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setBalanceStart(value) {
    setState((s) => ({
      ...s,
      balances: { ...s.balances, [month]: { ...s.balances[month], start: value } },
    }))
  }

  function setBalanceActual(value) {
    setState((s) => ({
      ...s,
      balances: { ...s.balances, [month]: { ...s.balances[month], actual: value } },
    }))
  }

  function setBudget(value) {
    setState((s) => ({ ...s, budgets: { ...s.budgets, [month]: value } }))
  }

  function addCustomCategory() {
    const name = newCategory.trim()
    if (!name) return
    setState((s) =>
      s.categories.includes(name) ? s : { ...s, categories: [...s.categories, name] },
    )
    setForm((f) => ({ ...f, category: name }))
    setNewCategory('')
  }

  function addPerson() {
    const name = personName.trim()
    if (!name) return
    setState((s) => {
      const idx = s.people.findIndex((p) => normalizeName(p.name) === normalizeName(name))
      if (idx >= 0) {
        const ex = s.people[idx]
        const dirs = new Set([ex.direction, personDir])
        if (dirs.size > 1 && ex.direction !== 'both') {
          const next = [...s.people]
          next[idx] = { ...ex, direction: 'both' }
          return { ...s, people: next }
        }
        return s
      }
      return { ...s, people: [...s.people, { name, category: personCat, direction: personDir }] }
    })
    setPersonName('')
  }

  function removePerson(name) {
    setState((s) => ({ ...s, people: s.people.filter((p) => p.name !== name) }))
  }

  function recategorizeOthers() {
    setState((s) => ({
      ...s,
      txns: s.txns.map((t) =>
        t.category === 'Other' ? { ...t, category: categorize(t.desc, s.people, t.amount) } : t,
      ),
    }))
    setImportMsg('Re-categorized all "Other" transactions from their descriptions.')
  }

  function copyStatement() {
    const lines = [
      `My Expenses - ${formatMonth(month)}`,
      `Spent: ${fmtMoney(spent)} | Income: ${fmtMoney(income)} | Net: ${fmtMoney(income - spent)}`,
      '',
    ]
    for (const t of statementTxns) {
      lines.push(
        `${t.date} ${t.desc || t.category} [${t.category}] ${extractPersonName(t.desc) || '-'} ${t.method || '-'}${t.note ? ` note: ${t.note}` : ''} ${t.amount < 0 ? 'Spent' : 'Deposited'} ${fmtMoney(Math.abs(t.amount))}`,
      )
    }
    if (peopleMonth.length > 0) {
      lines.push(`People - sent ${fmtMoney(pSent)} | received ${fmtMoney(pRecv)} | net ${fmtMoney(pRecv - pSent)}`)
      lines.push('  Name, Sent, Received')
      for (const g of peopleMonth) {
        lines.push(`  ${g.name}, ${fmtMoney(g.sent)}, ${fmtMoney(g.received)}`)
      }
    }
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => setCopiedMsg('Month statement copied - paste it anywhere.'))
      .catch(() => setCopiedMsg('Could not copy. Select the text manually.'))
    setTimeout(() => setCopiedMsg(''), 4000)
  }

  function handleImport(file) {
    const name = (file.name || '').toLowerCase()
    if (name.endsWith('.pdf')) {
      handlePdfImport(file)
      return
    }
    if (/\.(png|jpe?g|webp|heic)$/.test(name)) {
      handleImageImport(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseBankCSV(String(reader.result), state.people)
      if (parsed.length === 0) {
        setImportMsg('No valid rows found. Expect columns: Date, Description, Amount, Category.')
        return
      }
      setPreview(parsed)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsText(file)
  }

  async function handleImageImport(file) {
    setBusy(true)
    setImportMsg('Reading image with OCR...')
    setRawText('')
    try {
      const text = await ocrImage(file)
      setRawText(text)
      const parsed = parseBankPDF(text, state.people)
      if (parsed.length === 0) {
        setImportMsg(
          'Could not read transactions from this image. Click "See what the reader found" below, or paste the statement text into the box below as a fallback.',
        )
      } else {
        setPreview(parsed)
        setImportMsg('')
      }
    } catch (err) {
      if (err && /unsupported image|decode/i.test(String(err.message))) {
        setImportMsg(
          'This image format could not be opened. Try a JPG or PNG screenshot of the statement, or paste the text below.',
        )
      } else {
        setImportMsg(
          `Failed to read image: ${err && err.message ? err.message : err}. Try a clear screenshot or the PDF, or paste the statement text below.`,
        )
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handlePdfImport(file) {
    setBusy(true)
    setImportMsg('Reading PDF...')
    setRawText('')
    try {
      const { text, pages } = await readPdf(file)
      setRawText(text)
      let parsed = parseBankPDF(text, state.people)
      if (parsed.length < 3) {
        setImportMsg(
          `Found very little text on ${pages} page(s) — this is likely a scanned image PDF. Running OCR to read it...`,
        )
        const ocrText = await ocrPdf(file, (pageNum, total) => {
          setImportMsg(`OCR scanning page ${pageNum} of ${total}...`)
        })
        const ocrParsed = parseBankPDF(ocrText, state.people)
        if (ocrParsed.length > parsed.length) {
          parsed = ocrParsed
          setImportMsg(`OCR read ${ocrParsed.length} transactions.`)
        } else {
          setImportMsg(`Found ${parsed.length} transactions from the text layer.`)
        }
      }
      if (parsed.length === 0) {
        setImportMsg(
          'Could not find transactions in this PDF. Click "See what the reader found" below, or paste the statement text into the box below as a fallback.',
        )
      } else {
        setPreview(parsed)
        setImportMsg('')
      }
    } catch (err) {
      if (err && err.name === 'PasswordException') {
        setImportMsg(
          'This PDF is password-protected. Open it in Preview, then File > Export as PDF (without password) and upload that one.',
        )
      } else if (err && /decrypt|password/i.test(String(err.message))) {
        setImportMsg(
          'This PDF is encrypted/password-protected. Export it without a password (Preview > File > Export) and upload again.',
        )
      } else {
        setImportMsg(
          `Failed to read PDF: ${err && err.message ? err.message : err}. Try pasting the statement text below instead.`,
        )
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handlePasteParse() {
    const text = pastedText.trim()
    if (!text) return
    const parsed = parseBankPDF(text, state.people)
    if (parsed.length === 0) {
      setImportMsg('Could not find transactions in the pasted text. It needs dates and amounts.')
      return
    }
    setPreview(parsed)
    setImportMsg('')
  }

  function importPreview() {
    if (!preview) return
    const seen = new Set(state.txns.map((t) => txnKey(t)))
    const fresh = preview.filter((p) => {
      const key = txnKey(p)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const skipped = preview.length - fresh.length
    if (fresh.length === 0) {
      setImportMsg(
        `All ${skipped} rows were already imported (duplicates) — nothing new to add.`,
      )
      setPreview(null)
      return
    }
    setState((s) => {
      const cats = [...s.categories]
      for (const p of fresh) {
        if (!cats.includes(p.category)) cats.push(p.category)
      }
      return {
        ...s,
        txns: [
          ...fresh.map((p) => ({
            id: uid(),
            date: p.date,
            desc: p.desc,
            amount: p.amount,
            category: p.category,
            method: p.method,
            account: p.account || 'Bank',
          })),
          ...s.txns,
        ],
        categories: cats,
      }
    })
    const newMonths = monthsFromTxns(fresh)
    const monthList = newMonths.map((m) => formatMonth(m)).join(', ')
    setImportMsg(
      `Imported ${fresh.length} of ${preview.length} transactions.${skipped > 0 ? ` Skipped ${skipped} duplicates.` : ''}${
        newMonths.length > 0 ? ` Added to ${monthList}.` : ''
      }`,
    )
    if (newMonths.length > 0) setMonth(newMonths[newMonths.length - 1])
    setPreview(null)
  }

  function handleExport() {
    const blob = new Blob([exportCSV(state)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'expenses.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function clearAll() {
    if (window.confirm('Delete ALL data? This cannot be undone.')) {
      resetState()
      setState(loadState())
      setImportMsg('')
    }
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setVoiceMsg('Voice entry is not supported in this browser — try Chrome or Edge.')
      return
    }
    const rec = new SR()
    rec.lang = 'en-IN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    setListening(true)
    setVoiceMsg('Listening… say something like "spent 350 on zomato"')
    rec.onresult = (e) => {
      const raw = e.results[0][0].transcript
      const isIncome = /\b(income|received|credited|got|salary|deposit|refund)\b/i.test(raw)
      const num = raw.match(/\d[\d,]*\.?\d{0,2}/)
      const amt = num ? parseFloat(num[0].replace(/,/g, '')) : ''
      const desc = raw
        .replace(/\b(spent|paid|gave|sent|used|income|received|credited|got|deposit|refund|on|for|rupees|rs)\b/gi, ' ')
        .replace(/\d[\d,]*\.?\d{0,2}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      setForm((f) => ({
        ...f,
        amount: String(amt),
        type: isIncome ? 'income' : 'expense',
        desc: desc.slice(0, 80),
        category: categorize(desc, state.people, isIncome ? Math.abs(amt || 1) : -Math.abs(amt || 1)),
      }))
      setVoiceMsg(`Heard: "${raw}"`)
      setListening(false)
    }
    rec.onerror = () => {
      setVoiceMsg('Could not hear you — check the microphone permission.')
      setListening(false)
    }
    rec.onend = () => setListening(false)
    rec.start()
  }

  function parseReceiptText(text) {
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    let amount = null
    for (const line of lines) {
      const m = line.match(/(?:grand\s*total|total|amount|payable|due|net|balance)[\s:₹.]*\s*₹?\s*([\d,]+(?:\.\d{1,2})?)/i)
      if (m) {
        amount = parseFloat(m[1].replace(/,/g, ''))
        break
      }
    }
    if (amount == null) {
      for (const line of [...lines].reverse()) {
        if (/change|return|refund|discount|savings|cash|tendered|paid|balance\s*due\s*0/i.test(line)) continue
        const m2 = line.match(/₹\s*([\d,]+(?:\.\d{1,2})?)/)
        if (m2) {
          amount = parseFloat(m2[1].replace(/,/g, ''))
          break
        }
      }
    }
    if (amount == null) {
      let best = null
      for (const line of lines) {
        for (const m of line.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\b/g)) {
          const v = parseFloat(m[1].replace(/,/g, ''))
          if (v > 0 && (best == null || v > best)) best = v
        }
      }
      amount = best
    }
    let date = todayStr()
    const dm = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/)
    if (dm) {
      const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3]
      const iso = `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
      if (!Number.isNaN(new Date(iso + 'T00:00:00').getTime())) date = iso
    } else {
      const mon = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[.,]?\s+(\d{4})\b/i)
      if (mon) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        const mm = String(months.indexOf(mon[2].toLowerCase()) + 1).padStart(2, '0')
        date = `${mon[3]}-${mm}-${mon[1].padStart(2, '0')}`
      }
    }
    const shop = lines
      .filter(
        (l) =>
          l.length > 3 &&
          l.length < 60 &&
          !/\d{2,}[.,]\d{2}/.test(l) &&
          !/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.test(l) &&
          !/\d{1,2}:\d{2}/.test(l) &&
          !/(total|gst|vat|change|cash|card|upi|bill no|order|phone|gstin)/i.test(l),
      )
      .slice(0, 3)
      .join(' ')
    const desc = (shop || 'Receipt scan').slice(0, 60)
    const category = categorize(desc, state.people, -Math.abs(amount || 1))
    return {
      date,
      desc,
      amount: amount != null ? Math.abs(amount) : '',
      category: category === 'Other' ? 'Food' : category,
      note: '',
    }
  }

  async function handleReceiptScan(file) {
    setBusy(true)
    setImportMsg('Reading receipt with OCR...')
    try {
      const text = await ocrImage(file)
      const parsed = parseReceiptText(text)
      setScan({ ...parsed, id: null })
      setImportMsg('')
    } catch (err) {
      setImportMsg(
        `Failed to read receipt: ${err && err.message ? err.message : err}. Try a clearer, well-lit photo.`,
      )
    } finally {
      setBusy(false)
      if (scanRef.current) scanRef.current.value = ''
    }
  }

  function confirmScan() {
    if (!scan) return
    const amount = parseFloat(scan.amount)
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      setImportMsg('Enter a valid amount from the receipt before adding.')
      return
    }
    const txn = {
      id: uid(),
      date: scan.date || todayStr(),
      desc: (scan.desc || 'Receipt scan').trim(),
      amount: -Math.abs(amount),
      category: scan.category,
      method: 'Cash',
      account: 'Cash',
      note: scan.note.trim() || null,
    }
    setState((s) => ({ ...s, txns: [txn, ...s.txns] }))
    setScan(null)
    setMonth(monthKey(txn.date))
    setImportMsg(`Receipt added: ${fmtMoney(-txn.amount)} for ${txn.desc}.`)
  }

  function openSplit(t) {
    setSplitTxn(t)
    setSplitNames((t.split || []).join(', '))
  }

  function saveSplit() {
    if (!splitTxn) return
    const names = splitNames
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    setState((s) => ({
      ...s,
      txns: s.txns.map((t) => (t.id === splitTxn.id ? { ...t, split: names } : t)),
    }))
    setSplitTxn(null)
  }

  async function exportBackup() {
    try {
      const json = JSON.stringify(state)
      let body = json
      let name = 'expenses-backup.json'
      if (backupPass) {
        const enc = await encryptBackup(json, backupPass)
        body = JSON.stringify(enc)
        name = 'expenses-backup.enc'
      }
      const blob = new Blob([body], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      setBackupMsg(backupPass ? 'Encrypted backup downloaded — keep your password safe, it cannot be recovered.' : 'Backup downloaded.')
    } catch (err) {
      setBackupMsg(`Backup failed: ${err && err.message ? err.message : err}`)
    }
  }

  async function handleBackupImport(file) {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const obj = JSON.parse(String(reader.result))
        let data = obj
        if (obj && obj.encrypted) {
          if (!backupPass) {
            setBackupMsg('This backup is encrypted — enter the password used when exporting.')
            if (backupRef.current) backupRef.current.value = ''
            return
          }
          data = await decryptBackup(obj, backupPass)
        }
        if (!data || !Array.isArray(data.txns)) {
          setBackupMsg('This file is not a valid expense-tracker backup.')
          return
        }
        if (!window.confirm(`Restore backup with ${data.txns.length} transactions? This replaces current data.`)) {
          if (backupRef.current) backupRef.current.value = ''
          return
        }
        setState({
          txns: data.txns || [],
          balances: data.balances || {},
          categories: data.categories || [],
          people: data.people || [],
          budgets: data.budgets || {},
          goals: data.goals || [],
        })
        setBackupMsg(`Backup restored — ${data.txns.length} transactions.`)
        const ms = monthsFromTxns(data.txns || [])
        if (ms.length > 0) setMonth(ms[ms.length - 1])
      } catch (err) {
        setBackupMsg(
          `Could not import backup${err && /password|decrypt/i.test(String(err.message)) ? ' — wrong password?' : ''}.`,
        )
      } finally {
        if (backupRef.current) backupRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  const delta = computedEnd - (actualEndNum ?? computedEnd)

  return (
    <div className="app">
      <header className="header no-print">
        <div className="header-inner">
          <h1>My Expenses</h1>
          <div className="month-nav">
            <button
              className="theme-btn"
              onClick={() => setDark((d) => !d)}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <button className="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              ‹
            </button>
            <select
              className="month-select"
              value={month}
              title="Jump to any month with data"
              onChange={(e) => setMonth(e.target.value)}
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
            <button className="ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
              ›
            </button>
          </div>
        </div>
      </header>

      <main>
        {importMsg && isFailMsg(importMsg) && (
          <div className="fail-banner no-print">
            <span>{importMsg}</span>
            <button className="ghost del" onClick={() => setImportMsg('')} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        <section className="cards no-print">
          <div className="card">
            <span className="card-label">Starting Balance</span>
            <input
              type="number"
              step="0.01"
              className="balance-input"
              value={state.balances[month]?.start ?? ''}
              placeholder="0"
              onChange={(e) => setBalanceStart(parseFloat(e.target.value) || 0)}
            />
            <span className="card-hint">Balance on the 1st of the month</span>
          </div>
          <div className="card">
            <span className="card-label">Income</span>
            <span className="card-value income">{fmtMoney(income)}</span>
            <span className="card-hint">Money in</span>
          </div>
          <div className="card">
            <span className="card-label">Spent</span>
            <span className="card-value spent">{fmtMoney(spent)}</span>
            <span className="card-hint">{monthTxns.length} transactions</span>
          </div>
          <div className="card">
            <span className="card-label">Ending Balance</span>
            <input
              type="number"
              step="0.01"
              className="balance-input"
              value={actualEndStr}
              placeholder={fmtMoney(computedEnd)}
              onChange={(e) => setBalanceActual(parseFloat(e.target.value) || 0)}
            />
            <span className="card-hint">
              Computed: {fmtMoney(computedEnd)}
              {actualEndNum != null && delta !== 0 && (
                <span className={delta < 0 ? 'warn' : 'ok'}>
                  {' '}
                  · {delta < 0 ? 'unaccounted ' : 'extra '}
                  {fmtMoney(Math.abs(delta))}
                </span>
              )}
            </span>
          </div>
        </section>

        <div className="alltime no-print">
          <span>
            All data: <b>{dataMonths.length}</b> {dataMonths.length === 1 ? 'month' : 'months'} · Total spent{' '}
            <b className="spent">{fmtMoney(allSpent)}</b> · Total received <b className="income">{fmtMoney(allIncome)}</b>
          </span>
          {dataMonths.length > 1 && (
            <span className="alltime-months">
              {dataMonths.map((m, i) => (
                <button key={m} className={m === month ? 'chip active' : 'chip'} onClick={() => setMonth(m)}>
                  {formatMonth(m)}
                </button>
              ))}
            </span>
          )}
        </div>

        {accountsUsed.length > 1 && (
          <div className="acct-filter no-print">
            <span className="acct-label">Account:</span>
            {accountsUsed.map((a) => (
              <button
                key={a}
                className={accountFilter === a ? 'chip active' : 'chip'}
                style={accountFilter === a ? { background: colorFor(a), borderColor: colorFor(a) } : {}}
                onClick={() => setAccountFilter(a)}
              >
                {a === 'All' ? 'All' : a}
              </button>
            ))}
          </div>
        )}

        <section className="panel no-print">
          <div className="panel-head">
            <h2>Dashboard</h2>
            <span className="panel-sub">{formatMonth(month)}</span>
          </div>
          <div className="stats">
            <div className="stat-card stat-spent">
              <span className="stat-label">Spent</span>
              <span className="stat-num">{fmtMoney(spent)}</span>
              <span className="stat-hint">{catTotals.length} categories</span>
            </div>
            <div className="stat-card stat-income">
              <span className="stat-label">Deposited</span>
              <span className="stat-num">{fmtMoney(income)}</span>
              <span className="stat-hint">money in</span>
            </div>
            <div className="stat-card stat-net">
              <span className="stat-label">Net</span>
              <span className={`stat-num ${income - spent < 0 ? 'spent' : 'income'}`}>{fmtMoney(income - spent)}</span>
              <span className="stat-hint">{monthTxns.length} transactions</span>
            </div>
            <div className={`stat-card stat-budget ${overBudget ? 'stat-over' : ''}`}>
              <span className="stat-label">Budget</span>
              <input
                type="number"
                step="1"
                min="0"
                className="budget-input"
                value={monthBudget || ''}
                placeholder="Set monthly budget"
                onChange={(e) => setBudget(Math.max(0, parseFloat(e.target.value) || 0))}
              />
              {monthBudget > 0 && (
                <>
                  <div className="budget-track">
                    <div className="budget-fill" style={{ width: `${budgetPct}%` }} />
                  </div>
                  <span className={`stat-hint ${overBudget ? 'spent' : ''}`}>
                    {overBudget
                      ? `Over by ${fmtMoney(spent - monthBudget)} ⚠️`
                      : `${Math.round(budgetPct)}% used · ${fmtMoney(monthBudget - spent)} left`}
                  </span>
                </>
              )}
            </div>
          </div>
          {!enableAlerts && (
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="ghost bordered" onClick={enableBudgetAlerts}>
                🔔 Enable budget alerts
              </button>
            </div>
          )}
          {dailySpend.length > 0 && (
            <div className="trend-wrap">
              <span className="trend-title">Daily spending</span>
              <div className="trend">
                {dailySpend.map(([day, amt]) => (
                  <div className="trend-col" key={day} title={`${day} ${formatMonth(month).split(' ')[0]}: ${fmtMoney(amt)}`}>
                    <span className="trend-amt">{fmtShort(amt)}</span>
                    <div className="trend-bar" style={{ height: `${Math.max(5, (amt / maxDay) * 100)}%` }} />
                    <span className="trend-day">{day}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {catTotals.length > 0 ? (
            <>
              <span className="trend-title">Where it went</span>
              <div className="donut-row">
                <Donut
                  centerLabel="Spent"
                  slices={donutSlices}
                />
                <div className="donut-legend">
                  {donutSlices.map((s) => (
                    <div className="legend-row" key={s.name}>
                      <span className="dot" style={{ background: s.color }} />
                      <span className="legend-name">{emojiFor(s.name)} {s.name}</span>
                      <span className="legend-val">
                        {fmtMoney(s.value)} <span className="bar-pct">{Math.round((s.value / spent) * 100)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bars" style={{ marginTop: 12 }}>
                {catTotals.map(([cat, total]) => (
                  <div className="bar-row" key={cat}>
                    <div className="bar-top">
                    <span className="bar-cat">
                      <span className="dot" style={{ background: colorFor(cat) }} />
                      {emojiFor(cat)} {cat}
                    </span>
                      <span className="bar-amt">
                        {fmtMoney(total)}
                        <span className="bar-pct">{Math.round((total / spent) * 100)}%</span>
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${Math.max(2, (total / spent) * 100)}%`, background: colorFor(cat) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty">No spending recorded this month yet.</p>
          )}
        </section>

        {insights.length > 0 && (
          <section className="panel no-print">
            <div className="panel-head">
              <h2>Insights</h2>
              <span className="panel-sub">this month</span>
            </div>
            <div className="insights">
              {insights.map((ins) => (
                <div className="insight-card" key={ins.title}>
                  <span className="insight-icon">{ins.icon}</span>
                  <div>
                    <span className="insight-title">{ins.title}</span>
                    <span className="insight-body">{ins.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {health.score != null && (
          <section className="panel no-print">
            <div className="panel-head">
              <h2>Financial Health</h2>
              <span className="panel-sub">your money habits</span>
            </div>
            <div className="health-row">
              <div
                className="health-ring"
                style={{ background: `conic-gradient(${health.score >= 70 ? 'var(--green)' : health.score >= 50 ? 'var(--amber)' : 'var(--red)'} ${health.score * 3.6}deg, var(--bg) 0deg)` }}
              >
                <div className="health-ring-inner">
                  <span className="health-score">{health.score}</span>
                  <span className="health-grade">{health.grade}</span>
                </div>
              </div>
              <div className="health-tips">
                <span className="health-tips-title">Score factors & tips</span>
                {health.tips.map((tip) => (
                  <span className="health-tip" key={tip}>
                    • {tip}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {subscriptions.length > 0 && (
          <section className="panel no-print">
            <div className="panel-head">
              <h2>Subscriptions</h2>
              <span className="panel-sub">auto-detected renewals</span>
            </div>
            <div className="subs">
              {subscriptions.map((s) => (
                <div className="sub-row" key={s.name + s.amount}>
                  <span className="sub-name">
                    <span className="sub-emoji">{emojiFor(s.category)}</span> {s.name}
                  </span>
                  <span className="sub-meta">
                    {s.amount}/mo · {s.times} payments over {s.months} months · last {s.last.slice(5)}
                  </span>
                  <span className="sub-amt">{fmtMoney(s.amount)}/mo</span>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              Total: <b>{fmtMoney(subTotal)}</b> per month on recurring charges — cancel anything you don't use.
            </p>
          </section>
        )}

        <section className="panel" id="statement">
          <div className="panel-head">
            <h2>Month Statement</h2>
            <div className="row">
              <button type="button" className="ghost bordered" onClick={copyStatement}>
                Copy
              </button>
              <button type="button" className="ghost bordered" onClick={() => window.print()}>
                Print / PDF
              </button>
            </div>
          </div>
          <div className="stmt-summary">
            <span>
              <span className="stmt-label">Spent</span> {fmtMoney(spent)}
            </span>
            <span>
              <span className="stmt-label">Income</span> {fmtMoney(income)}
            </span>
            <span>
              <span className="stmt-label">Net</span>{' '}
              <span className={income - spent < 0 ? 'spent' : 'income'}>{fmtMoney(income - spent)}</span>
            </span>
          </div>
          {copiedMsg && <p className="hint">{copiedMsg}</p>}
          {statementTxns.length === 0 && peopleMonth.length === 0 ? (
            <p className="empty">Nothing recorded for {formatMonth(month)} yet.</p>
          ) : (
            <>
              {statementTxns.length > 0 && (
                <div className="passbook-wrap">
                  <table className="passbook">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Person</th>
                        <th>Method</th>
                        <th className="num">Spent</th>
                        <th className="num">Deposited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementTxns.map((t) => (
                        <tr key={t.id}>
                          <td className="pb-date">{t.date}</td>
                          <td className="pb-desc">
                            {t.desc || t.category}
                            {t.note && <span className="pb-note">📝 {t.note}</span>}
                          </td>
                          <td className="pb-cat">
                            <span
                              className="txn-cat"
                              style={{ color: colorFor(t.category), borderColor: colorFor(t.category) }}
                            >
                              {emojiFor(t.category)} {t.category}
                            </span>
                          </td>
                          <td className="pb-person">{extractPersonName(t.desc) || '—'}</td>
                          <td className="pb-method">
                            {t.method || '—'}
                            {t.account && t.account !== 'Bank' ? ` · ${t.account}` : ''}
                          </td>
                          <td className="num pb-spent">{t.amount < 0 ? fmtMoney(-t.amount) : ''}</td>
                          <td className="num pb-income">{t.amount > 0 ? fmtMoney(t.amount) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="5" className="pb-total">
                          Total
                        </td>
                        <td className="num pb-spent">{fmtMoney(spent)}</td>
                        <td className="num pb-income">{fmtMoney(income)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {peopleMonth.length > 0 && (
                <div className="stmt-group" style={{ marginTop: 18 }}>
                  <div className="stmt-head">
                    <span className="bar-cat">
                      <span className="dot" style={{ background: '#f59e0b' }} />
                      People
                    </span>
                    <span className="stmt-total">
                      Total sent <b className="pts">↑ {fmtMoney(pSent)}</b> · Total received{' '}
                      <b className="ptr">↓ {fmtMoney(pRecv)}</b> · Net{' '}
                      <b className={pRecv - pSent < 0 ? 'pts' : 'ptr'}>{fmtMoney(pRecv - pSent)}</b>
                    </span>
                  </div>
                  <div className="people-stmt">
                    {peopleMonth.map((g) => (
                      <div className="pstmt-row" key={g.name}>
                        <div className="pstmt-head">
                          <span className="pstmt-name">{g.name}</span>
                          <span className="pstmt-nums">
                            <span className="ps">sent {fmtMoney(g.sent)}</span>
                            <span className="pr">received {fmtMoney(g.received)}</span>
                          </span>
                        </div>
                        <div className="pstmt-track">
                          <div className="pstmt-sent" style={{ width: `${(g.sent / pMax) * 100}%` }} />
                          <div className="pstmt-recv" style={{ width: `${(g.received / pMax) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="panel no-print">
          <h2>Transactions</h2>
          {monthTxns.length === 0 ? (
            <p className="empty">Nothing here yet — add your first expense above.</p>
          ) : (
            <ul className="txn-list">
              {monthTxns.map((t) => (
                <li key={t.id} className="txn">
                  <button className="txn-main" onClick={() => editTxn(t)} title="Click to edit">
                    <span className="txn-date">{t.date.slice(8, 10)} {formatMonth(month).split(' ')[0]}</span>
                    <span className="txn-info">
                      <span className="txn-desc">{t.desc || t.category}</span>
                      {t.note && <span className="txn-note">📝 {t.note}</span>}
                      <span className="txn-cat" style={{ color: colorFor(t.category), borderColor: colorFor(t.category) }}>
                        {emojiFor(t.category)} {t.category}
                      </span>
                      {t.method && <span className="txn-method">{t.method}</span>}
                      {t.account && <span className="txn-method">{t.account}</span>}
                      {t.split && t.split.length > 0 && (
                        <span className="txn-split">
                          🤝 {t.split.join(', ')} · each {fmtMoney(Math.abs(t.amount) / (t.split.length + 1))}
                        </span>
                      )}
                    </span>
                  </button>
                  <span className={`txn-amt ${t.amount < 0 ? 'spent' : 'income'}`}>
                    {fmtMoney(t.amount)}
                  </span>
                  {t.photo && (
                    <button
                      className="photo-thumb"
                      onClick={() => setPhotoView(t.photo)}
                      title="View photo"
                      aria-label="View photo"
                    >
                      <img src={t.photo} alt="" />
                    </button>
                  )}
                  {t.amount < 0 && (
                    <button className="ghost split-btn" onClick={() => openSplit(t)} title="Split with friends">
                      🤝
                    </button>
                  )}
                  <button className="ghost del" onClick={() => deleteTxn(t.id)} aria-label="Delete">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel no-print">
          <h2>People</h2>
          <p className="hint" style={{ marginTop: 8 }}>
            Add a name once — all their payments and credits add up here automatically. Names come from statements
            like UPI/GOWTHAM, UPIAB/…/GOWTHAM/…, or UPI/RAHUL@YBL.
          </p>
          <div className="row">
            <input
              type="text"
              placeholder="Person's name e.g. Rahul"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
            />
            <select
              className="cat-select"
              value={personCat}
              onChange={(e) => setPersonCat(e.target.value)}
            >
              {state.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="cat-select"
              value={personDir}
              onChange={(e) => setPersonDir(e.target.value)}
            >
              <option value="sent">I send to them</option>
              <option value="received">They pay me</option>
              <option value="both">Both ways</option>
            </select>
            <button type="button" className="ghost bordered" onClick={addPerson}>
              + Add
            </button>
          </div>
          {(state.people || []).length > 0 ? (
            <table className="people-table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Paid</th>
                  <th className="num">Received</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...state.people]
                  .sort((a, b) => {
                    const ta = personTotals(a.name, state.txns)
                    const tb = personTotals(b.name, state.txns)
                    return tb.sent + tb.received - (ta.sent + ta.received)
                  })
                  .map((p) => {
                    const totals = personTotals(p.name, state.txns)
                    return (
                      <tr key={p.name}>
                        <td className="pt-name">{p.name}</td>
                        <td className="num sent">{fmtMoney(totals.sent)}</td>
                        <td className="num income">{fmtMoney(totals.received)}</td>
                        <td className="pt-del">
                          <button
                            className="ghost del"
                            onClick={() => removePerson(p.name)}
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-name">Total</td>
                  <td className="num sent">{fmtMoney(peopleSummary.sent)}</td>
                  <td className="num income">{fmtMoney(peopleSummary.received)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="hint" style={{ marginTop: 10 }}>
              No people yet — add a name above and their totals will show here.
            </p>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="ghost bordered" onClick={recategorizeOthers}>
              Re-categorize all "Other" transactions
            </button>
          </div>
        </section>

        <section className="panel no-print">
          <div className="panel-head">
            <h2>Goals & Savings</h2>
            <span className="panel-sub">saved {fmtMoney(goalsTotal)}</span>
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="Goal name e.g. New phone"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
            />
            <input
              type="number"
              step="1"
              min="1"
              placeholder="Target ₹"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
            />
            <button type="button" className="ghost bordered" onClick={addGoal}>
              + Goal
            </button>
          </div>
          {(state.goals || []).length > 0 ? (
            <div className="goals" style={{ marginTop: 12 }}>
              {state.goals.map((g) => {
                const pct = Math.min(100, ((g.saved || 0) / g.target) * 100)
                const done = pct >= 100
                return (
                  <div className="goal" key={g.id}>
                    <div className="goal-top">
                      <span className="goal-name">
                        {done ? '🎉 ' : '🎯 '}
                        {g.name}
                      </span>
                      <span className={`goal-amt ${done ? 'income' : ''}`}>
                        {fmtMoney(g.saved || 0)} / {fmtMoney(g.target)} · {Math.round(pct)}%
                      </span>
                    </div>
                    <div className="goal-track">
                      <div
                        className="goal-fill"
                        style={{ width: `${pct}%`, background: done ? 'var(--green)' : 'var(--primary)' }}
                      />
                    </div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="Add ₹ to this goal"
                        className="goal-add-input"
                        id={`goal-add-${g.id}`}
                      />
                      <button
                        type="button"
                        className="ghost bordered"
                        onClick={() => {
                          const el = document.getElementById(`goal-add-${g.id}`)
                          contributeGoal(g.id, el && el.value)
                          if (el) el.value = ''
                        }}
                      >
                        Add
                      </button>
                      <button type="button" className="ghost del" onClick={() => removeGoal(g.id)} aria-label="Remove goal">
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 10 }}>
              No goals yet — add one above and track savings toward it.
            </p>
          )}
        </section>

        <section className="panel no-print">
          <h2>{form.editingId ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <form className="add-form" onSubmit={addTxn}>
            <div className="type-toggle">
              <button
                type="button"
                className={form.type === 'expense' ? 'seg active expense' : 'seg expense'}
                onClick={() => setForm((f) => ({ ...f, type: 'expense' }))}
              >
                − Expense
              </button>
              <button
                type="button"
                className={form.type === 'income' ? 'seg active income' : 'seg income'}
                onClick={() => setForm((f) => ({ ...f, type: 'income' }))}
              >
                + Income
              </button>
            </div>
            <div className="row">
              <button
                type="button"
                className={listening ? 'ghost bordered voice-btn on' : 'ghost bordered voice-btn'}
                onClick={startVoice}
                title="Add by voice — say 'spent 350 on zomato'"
              >
                🎤 {listening ? 'Listening…' : 'Voice'}
              </button>
              <button
                type="button"
                className="ghost bordered"
                onClick={() => scanRef.current && scanRef.current.click()}
                title="Scan a bill photo — amount and date are read automatically"
              >
                🧾 Scan receipt
              </button>
              <input ref={scanRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && handleReceiptScan(e.target.files[0])} />
            </div>
            {voiceMsg && <p className="hint voice-msg">{voiceMsg}</p>}
            <div className="row">
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
              <select
                value={form.method}
                title="Payment method"
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              >
                {['UPI', 'Cash', 'Card', 'Transfer', 'Other'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={form.account}
                title="Account"
                onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
              >
                {ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Description (optional) e.g. Swiggy order"
              value={form.desc}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => {
                  const amountNum = Math.abs(parseFloat(f.amount)) || 1
                  const signed = f.type === 'expense' ? -amountNum : amountNum
                  const suggested = categorize(v, state.people, signed)
                  return f.category === 'Food' && suggested !== 'Other'
                    ? { ...f, desc: v, category: suggested }
                    : { ...f, desc: v }
                })
              }}
            />
            <input
              type="text"
              placeholder="Note (optional) e.g. dinner with Rahul, birthday gift"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
            <div className="photo-row">
              <label className="btn-label">
                {form.photo ? 'Replace photo' : '+ Add photo (bill / receipt)'}
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
              </label>
              {form.photo && (
                <>
                  <img src={form.photo} alt="Attachment preview" className="photo-preview" onClick={() => setPhotoView(form.photo)} />
                  <button
                    type="button"
                    className="ghost del"
                    onClick={() => setForm((f) => ({ ...f, photo: null }))}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
            <div className="chips">
              {state.categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={form.category === c ? 'chip active' : 'chip'}
                  style={form.category === c ? { background: colorFor(c), borderColor: colorFor(c) } : {}}
                  onClick={() => setForm((f) => ({ ...f, category: c }))}
                >
                  {emojiFor(c)} {c}
                </button>
              ))}
            </div>
            <div className="row">
              <input
                type="text"
                placeholder="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button type="button" className="ghost bordered" onClick={addCustomCategory}>
                + Add
              </button>
            </div>
            <button className="primary" type="submit">
              {form.editingId ? 'Save Changes' : 'Add Transaction'}
            </button>
            {form.editingId && (
              <button
                type="button"
                className="ghost"
                onClick={() => setForm((f) => ({ ...f, editingId: null, amount: '' }))}
              >
                Cancel edit
              </button>
            )}
          </form>
        </section>

        <section className="panel no-print">
          <h2>Data</h2>
          <div className="row wrap">
            <label className="btn-label">
              {busy ? 'Reading...' : 'Import bank CSV, PDF or photo'}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => e.target.files[0] && handleImport(e.target.files[0])}
              />
            </label>
            <button className="ghost bordered" onClick={handleExport}>
              Export CSV
            </button>
            <button className="ghost bordered danger" onClick={clearAll}>
              Delete all data
            </button>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <label className="btn-label">
              Import backup
              <input
                ref={backupRef}
                type="file"
                accept=".json,.enc,application/json"
                className="hidden"
                onChange={(e) => e.target.files[0] && handleBackupImport(e.target.files[0])}
              />
            </label>
            <button className="ghost bordered" onClick={exportBackup}>
              Export backup
            </button>
            <input
              type="password"
              className="pass-input"
              placeholder="Optional password (encrypts backup)"
              value={backupPass}
              onChange={(e) => setBackupPass(e.target.value)}
            />
          </div>
          {backupMsg && <p className="hint">{backupMsg}</p>}
          {importMsg && (
            <p className={isFailMsg(importMsg) ? 'import-msg fail' : 'hint'}>{importMsg}</p>
          )}
          <p className="hint">
            Descriptions are auto-categorized: Swiggy/Zomato → Food, Indian Oil/Shell → Petrol, Amazon/Flipkart →
            Shopping, Uber/Ola → Travel, Zepto/DMart → Groceries, Jio/Airtel → Bills, and more. Unmatched rows stay
            "Other". CSV should have columns: Date, Description, Amount, Category (optional). All data stays in your
            browser.
          </p>
          {rawText && (
            <details className="raw-box" open={importMsg.includes('Could not')}>
              <summary>See what the reader found ({rawText.split('\n').filter(Boolean).length} lines)</summary>
              <pre>{rawText.slice(0, 4000)}</pre>
            </details>
          )}
          <div className="paste-box">
            <p className="hint" style={{ marginTop: 10 }}>
              Nothing read? Copy the text from your statement (even from the bank app) and paste it here:
            </p>
            <textarea
              rows={4}
              placeholder="Paste statement text, e.g.  05/02/2026 SUPRIYA UPI 500.00  08/02/2026 SWIGGY 452.00"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
            <button type="button" className="ghost bordered" onClick={handlePasteParse}>
              Parse pasted text
            </button>
          </div>
        </section>
      </main>

      {busy && (
        <div className="busy-overlay no-print">
          <div className="busy-box">
            <div className="spinner" />
            <p className="busy-title">{importMsg || 'Reading file...'}</p>
            <p className="hint">This can take a minute or two for scanned statements. Please don't close the tab.</p>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop no-print" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Review imported transactions</h2>
            <p className="hint">
              Found {preview.length}. Scroll down to see all rows. Check amounts are right, then import. You can edit
              or delete any row afterwards.
            </p>
            <ul className="preview-list">
              <li className="preview-head">
                <span className="pv-date">Date</span>
                <span className="pv-desc">Description</span>
                <span className="pv-cat">Category</span>
                <span className="pv-amt">Amount</span>
              </li>
              {preview.map((p, i) => (
                <li key={i}>
                  <span className="pv-date">{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</span>
                  <span className="pv-desc">{p.desc}</span>
                  <span
                    className="pv-cat"
                    style={{ color: colorFor(p.category), borderColor: colorFor(p.category) }}
                  >
                    {emojiFor(p.category)} {p.category}
                  </span>
                  <span className={`pv-amt ${p.amount < 0 ? 'spent' : 'income'}`}>{fmtMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
            {preview.length > 10 && (
              <p className="hint">Showing all {preview.length} — scroll to the bottom, then click Import.</p>
            )}
            <div className="modal-actions">
              <button className="primary" onClick={importPreview}>
                Import {preview.length} transactions
              </button>
              <button className="ghost" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {photoView && (
        <div className="modal-backdrop no-print" onClick={() => setPhotoView(null)}>
          <div className="modal photo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setPhotoView(null)}>
                Close
              </button>
            </div>
            <img src={photoView} alt="Transaction photo" className="photo-full" />
          </div>
        </div>
      )}

      {scan && (
        <div className="modal-backdrop no-print" onClick={() => setScan(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🧾 Receipt scan</h2>
            <p className="hint">
              OCR read the receipt. Check the amount and date below — everything else is filled in automatically.
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount ₹"
                value={scan.amount}
                onChange={(e) => setScan((s) => ({ ...s, amount: e.target.value }))}
              />
              <input
                type="date"
                value={scan.date}
                onChange={(e) => setScan((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <input
              type="text"
              placeholder="Description / shop"
              value={scan.desc}
              onChange={(e) => setScan((s) => ({ ...s, desc: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={scan.note}
              onChange={(e) => setScan((s) => ({ ...s, note: e.target.value }))}
            />
            <select
              className="cat-select"
              style={{ width: '100%', marginTop: 10 }}
              value={scan.category}
              onChange={(e) => setScan((s) => ({ ...s, category: e.target.value }))}
            >
              {state.categories.map((c) => (
                <option key={c} value={c}>
                  {emojiFor(c)} {c}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="primary" onClick={confirmScan}>
                Add transaction
              </button>
              <button className="ghost" onClick={() => setScan(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {splitTxn && (
        <div className="modal-backdrop no-print" onClick={() => setSplitTxn(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🤝 Split expense</h2>
            <p className="hint">
              {fmtMoney(Math.abs(splitTxn.amount))} for "{splitTxn.desc || splitTxn.category}". Enter the friends who
              were part of it — each pays {fmtMoney(Math.abs(splitTxn.amount) / ((splitTxn.split || []).length + 1))}
              {splitTxn.split && splitTxn.split.length > 0 ? '' : ' with you'}.
            </p>
            <input
              type="text"
              placeholder="Names, comma separated e.g. Rahul, Suresh"
              value={splitNames}
              onChange={(e) => setSplitNames(e.target.value)}
              style={{ marginTop: 10 }}
            />
            <div className="modal-actions">
              <button className="primary" onClick={saveSplit}>
                Save split
              </button>
              <button className="ghost" onClick={() => setSplitTxn(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer no-print">Your data never leaves this browser.</footer>
    </div>
  )
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
