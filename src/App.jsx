import { Component, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadState,
  saveState,
  resetState,
  monthKey,
  todayStr,
  formatMonth,
  shiftMonth,
  fmtMoney,
  parseBankCSV,
  parseBankPDF,
  categorize,
  extractPersonName,
  personTotals,
  exportCSV,
  CATEGORY_COLORS,
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

function colorFor(category) {
  return CATEGORY_COLORS[category] || '#64748b'
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
    editingId: null,
  })
  const [newCategory, setNewCategory] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [personName, setPersonName] = useState('')
  const [personCat, setPersonCat] = useState('Food')
  const [personDir, setPersonDir] = useState('sent')
  const [copiedMsg, setCopiedMsg] = useState('')
  const [rawText, setRawText] = useState('')
  const [pastedText, setPastedText] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  const monthTxns = useMemo(
    () =>
      state.txns
        .filter((t) => monthKey(t.date) === month)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [state.txns, month],
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

  const statementGroups = useMemo(() => {
    const groups = new Map()
    for (const t of monthTxns) {
      if (t.amount >= 0) continue
      if (!groups.has(t.category)) groups.set(t.category, [])
      groups.get(t.category).push(t)
    }
    return [...groups.entries()]
      .map(([cat, txns]) => ({
        cat,
        txns,
        total: txns.reduce((s, t) => s - t.amount, 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [monthTxns])

  const incomeTxns = useMemo(() => monthTxns.filter((t) => t.amount > 0), [monthTxns])

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
    }
    setState((s) => {
      const exists = s.txns.some((t) => t.id === txn.id)
      return {
        ...s,
        txns: exists ? s.txns.map((t) => (t.id === txn.id ? txn : t)) : [txn, ...s.txns],
      }
    })
    setForm({ amount: '', type: 'expense', category: 'Food', desc: '', date: todayStr(), method: 'UPI', editingId: null })
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
      editingId: t.id,
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
      const exists = s.people.some((p) => p.name.toLowerCase() === name.toLowerCase())
      if (exists) return s
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
    for (const g of statementGroups) {
      lines.push(`${g.cat} - ${fmtMoney(g.total)} (${g.txns.length} txns)`)
      for (const t of g.txns) {
        lines.push(`  ${t.date} ${t.desc || t.category} ${fmtMoney(t.amount)}`)
      }
      lines.push('')
    }
    if (incomeTxns.length > 0) {
      lines.push(`Income - ${fmtMoney(income)} (${incomeTxns.length} txns)`)
      for (const t of incomeTxns) {
        lines.push(`  ${t.date} ${t.desc || t.category} ${fmtMoney(t.amount)}`)
      }
    }
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => setCopiedMsg('Month statement copied - paste it anywhere.'))
      .catch(() => setCopiedMsg('Could not copy. Select the text manually.'))
    setTimeout(() => setCopiedMsg(''), 4000)
  }

  function handleImport(file) {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      handlePdfImport(file)
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

  function addPersonFromPreview(p) {
    const name = (extractPersonName(p.desc) || p.desc).slice(0, 30).trim()
    if (!name) return
    const direction = p.amount < 0 ? 'sent' : 'received'
    setState((s) => {
      const exists = s.people.some((x) => x.name.toLowerCase() === name.toLowerCase())
      if (exists) return s
      return { ...s, people: [...s.people, { name, category: 'Other', direction }] }
    })
    setPreview((prev) =>
      prev.map((x) =>
        x === p
          ? { ...x, category: categorize(x.desc, [...state.people, { name, category: 'Other', direction }], x.amount) }
          : x,
      ),
    )
    setCopiedMsg(
      direction === 'sent'
        ? `Added "${name}" as a person you send money to — matching transfers will be tagged.`
        : `Added "${name}" as a person you receive from — matching credits will be tagged.`,
    )
    setTimeout(() => setCopiedMsg(''), 5000)
  }

  function addAllPeopleFromPreview() {
    if (!preview) return
    const found = []
    for (const p of preview) {
      const name = (extractPersonName(p.desc) || '').slice(0, 30).trim()
      if (!name || found.some((f) => f.name.toLowerCase() === name.toLowerCase())) continue
      found.push({ name, direction: p.amount < 0 ? 'sent' : 'received' })
    }
    if (found.length === 0) return
    setState((s) => {
      let people = [...s.people]
      for (const n of found) {
        const exists = people.some((x) => x.name.toLowerCase() === n.name.toLowerCase())
        if (!exists) people = [...people, { name: n.name, category: 'Other', direction: n.direction }]
      }
      return { ...s, people }
    })
    setPreview((prev) =>
      prev.map((x) => {
        const name = (extractPersonName(x.desc) || '').slice(0, 30).trim()
        if (!name || x.category !== 'Other') return x
        const dir = x.amount < 0 ? 'sent' : 'received'
        return {
          ...x,
          category: categorize(x.desc, [...state.people, { name, category: 'Other', direction: dir }], x.amount),
        }
      }),
    )
    setCopiedMsg(
      `Added ${found.length} ${found.length === 1 ? 'person' : 'people'}: ${found.map((f) => f.name).join(', ')}.`,
    )
    setTimeout(() => setCopiedMsg(''), 5000)
  }

  function importPreview() {
    if (!preview) return
    setState((s) => {
      const cats = [...s.categories]
      for (const p of preview) {
        if (!cats.includes(p.category)) cats.push(p.category)
      }
      return {
        txns: [
          ...preview.map((p) => ({ id: uid(), date: p.date, desc: p.desc, amount: p.amount, category: p.category, method: p.method })),
          ...s.txns,
        ],
        balances: s.balances,
        categories: cats,
        people: s.people,
      }
    })
    setImportMsg(`Imported ${preview.length} transactions.`)
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

  const delta = computedEnd - (actualEndNum ?? computedEnd)

  return (
    <div className="app">
      <header className="header no-print">
        <div className="header-inner">
          <h1>My Expenses</h1>
          <div className="month-nav">
            <button className="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              ‹
            </button>
            <span className="month-label">{formatMonth(month)}</span>
            <button className="ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
              ›
            </button>
          </div>
        </div>
      </header>

      <main>
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
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
                autoFocus
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
            <div className="chips">
              {state.categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={form.category === c ? 'chip active' : 'chip'}
                  style={form.category === c ? { background: colorFor(c), borderColor: colorFor(c) } : {}}
                  onClick={() => setForm((f) => ({ ...f, category: c }))}
                >
                  {c}
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
              <button type="button" className="ghost" onClick={() => setForm((f) => ({ ...f, editingId: null, amount: '' }))}>
                Cancel edit
              </button>
            )}
          </form>
        </section>

        <section className="panel no-print">
          <h2>Where it went</h2>
          {catTotals.length === 0 ? (
            <p className="empty">No spending recorded this month yet.</p>
          ) : (
            <div className="bars">
              {catTotals.map(([cat, total]) => (
                <div className="bar-row" key={cat}>
                  <div className="bar-top">
                    <span className="bar-cat">
                      <span className="dot" style={{ background: colorFor(cat) }} />
                      {cat}
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
          )}
        </section>

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
          {statementGroups.length === 0 && incomeTxns.length === 0 ? (
            <p className="empty">Nothing recorded for {formatMonth(month)} yet.</p>
          ) : (
            <>
              {statementGroups.map((g) => (
                <div className="stmt-group" key={g.cat}>
                  <div className="stmt-head">
                    <span className="bar-cat">
                      <span className="dot" style={{ background: colorFor(g.cat) }} />
                      {g.cat}
                    </span>
                    <span className="stmt-total">
                      {fmtMoney(g.total)}
                      <span className="bar-pct">
                        {spent > 0 ? ` ${Math.round((g.total / spent) * 100)}%` : ''}
                      </span>
                    </span>
                  </div>
                  <ul className="stmt-txns">
                    {g.txns.map((t) => (
                      <li key={t.id}>
                        <span className="txn-date">{t.date}</span>
                        <span className="pv-desc">{t.desc || t.category}{t.method ? <em className="txn-method"> · {t.method}</em> : null}</span>
                        <span className="pv-amt spent">{fmtMoney(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {incomeTxns.length > 0 && (
                <div className="stmt-group">
                  <div className="stmt-head">
                    <span className="bar-cat">
                      <span className="dot" style={{ background: '#22c55e' }} />
                      Income
                    </span>
                    <span className="stmt-total income">{fmtMoney(income)}</span>
                  </div>
                  <ul className="stmt-txns">
                    {incomeTxns.map((t) => (
                      <li key={t.id}>
                        <span className="txn-date">{t.date}</span>
                        <span className="pv-desc">{t.desc || t.category}</span>
                        <span className="pv-amt income">{fmtMoney(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
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
                      <span className="txn-cat" style={{ color: colorFor(t.category), borderColor: colorFor(t.category) }}>
                        {t.category}
                      </span>
                      {t.method && <span className="txn-method">{t.method}</span>}
                    </span>
                  </button>
                  <span className={`txn-amt ${t.amount < 0 ? 'spent' : 'income'}`}>
                    {fmtMoney(t.amount)}
                  </span>
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
          <div className="people-summary">
            <span>Total sent <b className="pts">↑ {fmtMoney(peopleSummary.sent)}</b></span>
            <span>Total received <b className="ptr">↓ {fmtMoney(peopleSummary.received)}</b></span>
          </div>
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
          {(state.people || []).length > 0 && (
            <ul className="people-list">
              {[...state.people]
                .sort((a, b) => {
                  const ta = personTotals(a.name, state.txns)
                  const tb = personTotals(b.name, state.txns)
                  return tb.sent + tb.received - (ta.sent + ta.received)
                })
                .map((p) => {
                  const totals = personTotals(p.name, state.txns)
                  return (
                    <li key={p.name}>
                      <span className="people-name">{p.name}</span>
                      <span className="people-totals">
                        <span className="pts">↑ {fmtMoney(totals.sent)}</span>
                        <span className="ptr">↓ {fmtMoney(totals.received)}</span>
                      </span>
                      <button className="ghost del" onClick={() => removePerson(p.name)} aria-label="Remove">
                        ✕
                      </button>
                    </li>
                  )
                })}
            </ul>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="ghost bordered" onClick={recategorizeOthers}>
              Re-categorize all "Other" transactions
            </button>
          </div>
        </section>

        <section className="panel no-print">
          <h2>Data</h2>
          <div className="row wrap">
            <label className="btn-label">
              {busy ? 'Reading...' : 'Import bank CSV or PDF'}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
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
          {importMsg && <p className="hint">{importMsg}</p>}
          <p className="hint">
            Descriptions are auto-categorized: Swiggy/Zomato → Food, Indian Oil/Shell → Petrol, Amazon/Flipkart →
            Shopping, Uber/Ola → Travel, Zepto/DMart → Groceries, Jio/Airtel → Bills, and more. Unmatched rows stay
            "Other". CSV should have columns: Date, Description, Amount, Category (optional). All data stays in your
            browser.
          </p>
          {rawText && (
            <details className="raw-box">
              <summary>See what the reader found in your PDF ({rawText.split('\n').filter(Boolean).length} lines)</summary>
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

      {preview && (
        <div className="modal-backdrop no-print" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Review imported transactions</h2>
            <p className="hint">
              Found {preview.length}. Check amounts are right, then import. You can edit or delete any row afterwards.
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
                    {p.category}
                  </span>
                  <span className={`pv-amt ${p.amount < 0 ? 'spent' : 'income'}`}>{fmtMoney(p.amount)}</span>
                  {p.category === 'Other' && extractPersonName(p.desc) && (
                    <button
                      type="button"
                      className="ghost pv-person"
                      onClick={() => addPersonFromPreview(p)}
                      title={p.amount < 0 ? 'Add as a person you send money to' : 'Add as a person who pays you'}
                    >
                      + person
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {copiedMsg && <p className="hint">{copiedMsg}</p>}
            <div className="modal-actions">
              <button className="primary" onClick={importPreview}>
                Import {preview.length} transactions
              </button>
              <button type="button" className="ghost bordered" onClick={addAllPeopleFromPreview}>
                + Add all people
              </button>
              <button className="ghost" onClick={() => setPreview(null)}>
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
