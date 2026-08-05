import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const URL = process.argv[2] || 'http://localhost:5173/'
const PDF = process.argv[3] || '/tmp/scan.pdf'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 400)}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 400)}`))
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url().slice(0, 140)}`)
})
page.on('requestfailed', (r) => errors.push(`[failed] ${r.url().slice(0, 140)} ${(r.failure() || {}).errorText || ''}`))

await page.goto(URL, { waitUntil: 'networkidle2' })
await page.waitForSelector('input[type="file"]')

const pdfBytes = readFileSync(PDF)
await page.evaluate(async (bytes) => {
  const input = document.querySelector('input[type="file"]')
  const file = new File([new Uint8Array(bytes)], 'upload.pdf', { type: 'application/pdf' })
  const dt = new DataTransfer()
  dt.items.add(file)
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}, [...pdfBytes])

let result = { modal: false, hints: [] }
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  result = await page.evaluate(() => ({
    modal: !!document.querySelector('.modal'),
    hints: [...document.querySelectorAll('.hint')].map((h) => h.textContent.trim()),
  }))
  const msg = result.hints.filter((h) => h.length > 5).slice(0, 3).join(' | ')
  console.log(`t+${(i + 1) * 3}s modal=${result.modal} msg="${msg.slice(0, 110)}"`)
  if (result.modal) break
}
if (!result.modal) {
  const boundary = await page.evaluate(() => document.body.textContent.includes('Something went wrong'))
  console.log('error boundary shown:', boundary)
}
console.log('errors:', errors.length ? errors.join('\n---\n') : 'none')
await browser.close()
