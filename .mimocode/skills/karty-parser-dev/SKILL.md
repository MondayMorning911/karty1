---
name: karty-parser-dev
description: Use when editing or testing Karty Lab site parsers (ss_ge, myhome_ge, korter_ge, realting_com). Covers the validate→test→inspect cycle. Always run py_compile after editing — undetected syntax errors cause silent publish failures.
---

# Karty Lab Parser Development

You are working in the Karty Lab project at `/root/karty-lab/`. This project automates real estate listing publishing tests on 4 Georgian sites using Camoufox + Playwright. Stack: Python 3.12 venv at `venv/`, Xvfb at `:99`, sites at `sites/`, cookies at `cookies/`, screenshots at `logs/screenshots/`.

## Core Rule: Validate Before You Test

After ANY edit to a parser file (`sites/*.py`, `parsers/*.py`), run:

```bash
cd /root/karty-lab && source venv/bin/activate && python -c "
import py_compile, sys
sites = ['sites/ss_ge.py', 'sites/myhome_ge.py', 'sites/korter_ge.py', 'sites/realting_com.py', 'sites/base.py']
errors = []
for f in sites:
    try:
        py_compile.compile(f, doraise=True)
        print(f'OK  {f}')
    except py_compile.PyCompileError as e:
        errors.append(f)
        print(f'FAIL {f}: {e}')
sys.exit(1 if errors else 0)
"
```

Why: The SS.ge parser was irrecoverably corrupted by an IndentationError after editing (MEMORY.md §Rules, 2026-07-26). Broken parsers cause **silent publish task failures** — the API returns success but nothing is published. Never skip this step.

## Running a Parser Test

The standard test harness (164+ repetitions confirmed in trajectory):

### 1. Cleanup

```bash
killall -9 firefox 2>/dev/null; killall -9 camoufox 2>/dev/null; sleep 2
```

Ensures no stale browser processes from previous runs compete for resources.

### 2. Execute

Use this template, replacing the Python script path:

```bash
cd /root/karty-lab && source venv/bin/activate && \
  DISPLAY=:99 timeout 300 python -u <script_path> 2>&1
```

or with xvfb-run if Xvfb is not already running:

```bash
cd /root/karty-lab && source venv/bin/activate && \
  xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" \
  timeout 300 python -u <script_path> 2>&1
```

Key parameters:
- **`timeout 300`**: Playwright EPIPE crash at ~10min (MEMORY.md §Rules). Adjust based on test scope: 2-3 listings per session is safe. For 8-category batches, split into runs of 2-3.
- **`DISPLAY=:99`**: Xvfb with GLX is running on this display (start: `Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render`).
- **`-u`**: Unbuffered Python output so logs appear in real-time.
- **`headless=False`**: Parsers were designed for headed mode. SS.ge wizard cards require `page.mouse.click()` (not `el.click()`) for `isTrusted=true`.

### 3. Inspect Results

Check latest screenshots:
```bash
ls -lt /root/karty-lab/logs/screenshots/ | head -10
```

View a specific screenshot with Gemini analysis (if needed):
```bash
cd /root/karty-lab && source venv/bin/activate && \
  python check_screenshot.py <screenshot_path>
```

### 4. Dashboard Verification

The user requires **visual dashboard verification** for all publish/delete/republish operations — "API returned 200" is NOT sufficient. Must verify:
- Listing appears on dashboard with count change (N→N+1)
- Listing disappears after delete (N+1→N)
- Screenshots at every stage

## Site-Specific Quirks

### SS.ge
- Form is single-page, not multi-step wizard — all panels visible simultaneously
- Wizard cards require `page.mouse.click(x, y)`, NOT `el.click()`
- Publish button: `button.btn-next` (Продолжать), then `button:has-text('Размещение заявки')`
- ≥3 photos required for active listing (≤2 sends to hidden/draft)
- Cadastral code format must be `XX.XX.XX.XXX.XXX` or leave blank — mock format blocks submit
- Delete flow: hidden tab → check checkbox → bulk action "Удалить"
- API: `api-gateway.ss.ge/v1/RealEstate/` with Bearer JWT

### MyHome.ge
- Cloudflare bypass required: user-agent `Chrome/131.0.0.0`, `--disable-blink-features=AutomationControlled`, locale `ru-RU`
- Delete: "Удалить" button per listing card → modal with "Да"/"Нет" → refresh page to update count
- Working API publish confirmed (2026-07-26)

### Korter.ge
- Pure SPA — inputs render dynamically via React/Vue
- Use `/ru/property/create` (Russian locale, not `/ka`)
- Cookie consent: "Принимаю Cookies" button, then "Шаг 1 из 2: Примите правила сайта" modal
- Auth: `korter_ge_state.json` is storage_state format — load via `browser.new_context(storage_state=file)`
- Map widget requires functional WebGL (not available on this server). Bypass or use browserless.

### Realting.com
- Not yet actively tested (skeleton parser at `sites/realting_com.py`)

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Parser import fails | IndentationError or syntax error | Run `py_compile` validation; check recent edits |
| Playwright EPIPE crash | Session >10min | Reduce batch size to 2-3 listings |
| Publish returns success but listing invisible | <3 photos uploaded | Add ≥3 valid images |
| Form stays on /create after submit | React event rejection or server-side validation | Use `page.mouse.click()` instead of `el.click()`; check cadastral code format |
| Korter "zero inputs" in DOM | SPA hasn't finished rendering | Wait 10s + scroll to trigger lazy render |
| Click doesn't open dropdown | React synthetic event system | Try `page.locator().click({force: true})` or CDP `Input.dispatchMouseEvent` |

## Reference Files

- Project memory: `/root/.local/share/mimocode/memory/projects/global/MEMORY.md`
- Test listings: `/root/karty-lab/test_listings.json` (8 combos: 2 deals × 4 types)
- Test runner: `/root/karty-lab/test_runner.py` (API-based, `--site --type --deal`)
- Parser test: `/root/karty-lab/test_parser.py` (direct parser test, korter + ss.ge)
- Screenshot analysis: `/root/karty-lab/check_screenshot.py` (Gemini 2.0 Flash)
- Cookies: `/root/karty-lab/cookies/` (ssge.json, myhome_ge.json, korter_state.json)
