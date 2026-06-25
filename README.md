# CycleMind — AI Market Regime Trading Agent

> AI-powered perpetual futures trading on BTC, ETH, SOL — demo or live via Bitget

[![Live Demo](https://img.shields.io/badge/Live_Demo-cyclemind.vercel.app-0078ff?style=flat-square)](https://cyclemind.vercel.app)
[![Hackathon](https://img.shields.io/badge/Bitget_AI_Hackathon-S1-00c6ff?style=flat-square)](https://x.com/cyclemindarc)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

🌐 [cyclemind.vercel.app](https://cyclemind.vercel.app) &nbsp;|&nbsp; 🐦 [@cyclemindarc](https://x.com/cyclemindarc) &nbsp;|&nbsp; 📱 Telegram: [@defitony0x](https://t.me/defitony0x)

---

## Demo Video

▶️ [Watch the full platform demo on X](https://x.com/i/status/2070054549256122787)

---

## Submission Links

| Item | Link |
|------|------|
| Live Demo | [cyclemind.vercel.app](https://cyclemind.vercel.app) |
| GitHub | [github.com/amostony333-arch/Cyclemind](https://github.com/amostony333-arch/Cyclemind) |
| Paper Trading Log | [TRADE_LOG.md](https://github.com/amostony333-arch/Cyclemind/blob/main/TRADE_LOG.md) |
| Project Post | [x.com/i/status/2070054549256122787](https://x.com/i/status/2070054549256122787) |
| Repost of Official Bitget Campaign | [x.com/i/status/2069540691693256825](https://x.com/i/status/2069540691693256825) |

---

## Why We Built It

Most retail crypto traders lose not because they lack data — but because they can't process it fast enough or consistently enough to act on it. By the time a trader reads the chart, checks funding rates, glances at Fear & Greed, and decides on a size, the opportunity is gone or the risk profile has changed.

CycleMind closes that gap. The core logic is regime-first: before any signal fires, the system classifies what kind of market this is — Bull Trend, Weak Uptrend, Range Bound, Weak Downtrend, or Bear Trend. No trade executes against the detected regime. Ever. Everything else — DCA sizing, position direction, rebalancing tilt — flows from that single classification.

The vision: give an independent trader the same systematic edge that quant desks have — packaged in a clean, mobile-first dashboard anyone can use.

---

## Three Interfaces

### 1. Dashboard — Portfolio & Market Intelligence

The core intelligence layer. Connects to your Bitget account via API and gives you:

| Module | What It Does |
|--------|-------------|
| **Market Regime Detection** | Classifies BTC, ETH, SOL into Bull Trend, Weak Uptrend, Range Bound, Weak Downtrend, or Bear Trend using a composite confidence score |
| **Signal-Based DCA** | Scales buy size dynamically based on Fear & Greed Index instead of a fixed calendar |
| **Liquidation Heatmap** | Estimates liquidation price clusters across common leverage tiers using live open interest and price data |
| **Funding Rate Capture** | Flags historically extreme funding percentiles for delta-neutral opportunities |
| **Portfolio Rebalancer** | Reads your live Bitget spot balances, compares against target allocation, applies regime-aware tilt, returns a suggested rebalance plan |
| **Entry / Exit Signals** | TP, SL, and MA levels tracked per asset in real time |
| **Trending on CoinGecko** | Live trending coins with price and 24h change |

### 2. Perps — AI Futures Trading Agent

The execution layer. AI-powered perpetual futures trading directly on Bitget:

- **AI Signal Cards** — BTC, ETH, SOL each scored -5 to +5 with direction (LONG / SHORT / NEUTRAL), strength rating, and Quick Trade button
- **Manual Position Form** — asset selector, Long/Short toggle, margin input, leverage slider (1x–100x) with preset buttons, live trade summary
- **AI Trading Agent** — toggle on/off, configurable leverage and position size, auto-executes every 15 minutes when signal and regime align
- **Open Positions** — live P&L, entry price, mark price, notional, liquidation price, Close button per position. Agent-opened positions tagged with AGENT badge
- **Demo Balance Panel** — Cash (USDT), Total Equity, Starting Balance, P&L

### 3. Arb — Prediction Market Scanner

The alpha extension. Scans sports prediction markets for pricing discrepancies:

- **Sources** — Polymarket (live), SX Bet (live), Limitless (30s delayed)
- **Sports** — NFL / NBA / MLB / NHL / Soccer
- **Logic** — when the same outcome is mispriced across platforms and edge clears 2% after fees, both sides execute simultaneously on demo
- **Settlement Tracker** — monitors open arb positions through resolution
- **Demo Balance** — $1,000 simulated, tracks locked positions and realised P&L

---

## The Trading Strategy

### Why It Works

The regime engine scores each asset using a composite confidence score weighted across four factors:

| Factor | Weight |
|--------|--------|
| Indicator Agreement (RSI / MACD / EMA) | 30% |
| Volume Divergence | 25% |
| Funding Rate Alignment | 25% |
| BTC Dominance Momentum | 20% |

Per-asset confidence thresholds before a signal is considered actionable:

- BTC: 60% &nbsp;|&nbsp; ETH: 62% &nbsp;|&nbsp; SOL: 68%

A **CASCADE RISK** flag activates when liquidation cluster density is elevated near current price. When CASCADE RISK is active, the agent suppresses all new entries regardless of signal score.

### Signal Stack

**Macro / Sentiment**
- Fear & Greed sub-25 (Extreme Fear) increases DCA multiplier — buy more when others panic. Above 75 contracts sizing.
- Funding Rates: persistent positive = crowded longs = fade. Negative = squeeze potential = long bias.

**Derivatives**
- Open Interest across BTC, ETH, SOL — crowdedness indicator
- Liquidation Heatmap Zones — dense clusters treated as both targets and risk zones

**Technical Indicators**
- RSI across multiple timeframes
- MACD crossover and histogram momentum
- EMA structure: 20D / 50D / 200D alignment
- Candlestick pattern recognition
- Support and resistance proximity scoring

### Signal Scoring

| Score | Decision |
|-------|----------|
| ≥ +2 | LONG |
| -1 to +1 | WAIT |
| ≤ -2 | SHORT |

### How the Agent Decides (Every 15 Minutes)

```
1. Fetch live regime for each asset
2. Score signals across all layers
3. Check risk controls:
   - Daily P&L within -10% limit?
   - Position size under 40% cap per asset?
   - 15-minute cooldown elapsed?
   - CASCADE RISK active?
4. If all pass → open position on Bitget perps
5. Monitor positions → close on TP/SL breach or regime flip
6. Log all trades with timestamp, pair, side, price, size, balance
```

### Risk Controls

| Control | Value | Behaviour |
|---------|-------|-----------|
| Daily loss limit | 10% | Agent halts, no new entries |
| Max position per asset | 40% | Hard cap, agent skips oversized assets |
| Trade cooldown | 15 minutes | Prevents overtrading in chop |
| Default agent leverage | 5x | Conservative vs 100x manual max |
| CASCADE RISK flag | Dynamic | Suppresses all entries near liq clusters |
| Emergency Stop | Always visible | One tap closes all positions and kills agent |

---

## Project Structure

```
cyclemind/
├── frontend/
│   ├── index.html          # Dashboard — portfolio, regime, DCA, signals
│   ├── perps.html          # Perps — AI agent, manual trading, positions
│   ├── arb.html            # Arb — prediction market scanner
│   ├── styles.css
│   └── app.js
├── backend/
│   ├── main.py             # FastAPI server + background agent loop
│   ├── bitget_client.py    # Bitget REST API wrapper
│   ├── regime_engine.py    # Composite confidence scoring + regime classification
│   ├── indicators.py       # RSI, MACD, EMA calculations
│   ├── config.py
│   └── requirements.txt
└── README.md
```

---

## Local Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # fill in your values
python main.py
```

Backend runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
python3 -m http.server 5500
```

Open `http://localhost:5500` in your browser.

> Public market-data endpoints (funding rate, open interest, ticker, fear/greed) work without API keys. Portfolio, rebalancer, and live trading features require connecting your Bitget API key through the Connect modal.

---

## Deployment

### Frontend → Vercel

1. Push this repo to GitHub
2. Import in Vercel, set root directory to `frontend`
3. Deploy — Vercel auto-detects static sites, no build config needed

### Backend → Railway

1. Import repo in Railway, set root directory to `backend`
2. Add environment variables from `.env.example` in Railway's dashboard
3. Set start command:
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```
4. Copy the Railway URL, update `API_BASE` in `frontend/app.js`, and set `FRONTEND_ORIGIN` in Railway env vars to your Vercel URL

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI (Python) |
| Frontend | Vanilla JS, HTML, CSS |
| Hosting | Railway (API) + Vercel (frontend) |
| Exchange | Bitget REST API — prices, OI, funding, orders, portfolio |
| Wallet | ethers.js (client-side key generation) |
| Prediction Markets | Polymarket API, SX Bet API, Limitless API |
| Auth | Email magic link + localStorage session |
| Market Data | CoinGecko, Fear & Greed Index API, Bitget market data |

---

## Bitget Integration

- **Bitget REST API** — live prices, open interest, funding rates, order placement and management for BTC/USDT, ETH/USDT, SOL/USDT perpetual futures
- **Bitget Perps** — primary trading venue for the AI agent
- **Bitget Playbook** — full native integration planned for v8
- **API key auth** — Connect modal accepts key + secret + passphrase with read-only or trade permissions based on user intent

> API keys used through the Connect modal should be read-only unless you explicitly intend to enable live trade execution. This MVP stores credentials in browser localStorage — for production deployments, credentials should be encrypted at rest server-side.

---

## Features Completed

- [x] Market Regime Detection — 5 regimes, CASCADE RISK, composite confidence score with per-asset thresholds
- [x] Signal-Based DCA with Fear & Greed multiplier
- [x] Liquidation Heatmap — open interest + leverage tier estimation
- [x] Funding Rate Capture — extreme percentile flagging
- [x] Portfolio Rebalancer — live Bitget balances, regime-aware tilt
- [x] Entry / Exit Signals with TP, SL, MA levels
- [x] Perps trading interface — full manual position form (1x–100x leverage)
- [x] AI Trading Agent — toggle, configurable leverage and size, 15-min cycle
- [x] Open Positions — live P&L, notional, liq price, Close button, AGENT badge
- [x] Trade History log
- [x] Demo Trading — $10,000 simulated funds, equity curve sparkline
- [x] Prediction Market Arb Scanner — Polymarket, SX Bet, Limitless
- [x] Arb auto-execute (demo only) + Settlement Tracker
- [x] Email auth with magic link
- [x] Client-side Ethereum wallet generation (ethers.js)
- [x] Emergency Stop — global, persistent across all pages
- [x] Mobile-first responsive UI across all three interfaces
- [x] Institutional terminal UI — SVG icons, section labels, visual hierarchy (v7)

## v8 Roadmap

- [ ] Full Bitget Playbook integration — structured multi-step strategy execution
- [ ] Multi-agent infrastructure — specialist agents for regime, signals, execution, and risk running in parallel
- [ ] Live prediction market arb execution on real accounts
- [ ] Backtest engine — validate signal edge against historical OHLCV data
- [ ] Leaderboard — rank top demo performers
- [ ] Push notifications — signal triggers and agent trade alerts via Telegram and X
- [ ] Expanded asset coverage beyond BTC / ETH / SOL
- [ ] Database migration — users.json → PostgreSQL
- [ ] Trade alert webhooks — Telegram bot and X post on every agent trade

---

## Key Development Challenges

**Multi-instance auto-trade race condition** — deploying on Railway caused multiple server instances to each run the background agent loop, firing duplicate orders on the same signal. Solved with a single-instance lock and heartbeat check so only one loop runs at a time.

**Signal noise in range-bound markets** — early builds triggered too many agent trades in sideways conditions. Adding regime detection as a hard gate (not just a weight) eliminated most false positives. CASCADE RISK suppresses all entries when liquidation risk is elevated near price.

**Arb latency on prediction markets** — Limitless has a mandatory 30-second delay. Solved by flagging delayed sources clearly in the UI and setting minimum edge thresholds high enough to survive latency and still be profitable after fees.

**Client-side wallet generation** — private keys are generated in the browser via ethers.js and never touch the server. Solved with a staged warning flow and explicit confirmation before the key is displayed so users understand the responsibility before proceeding.

---

## Experience with Bitget AI Tools & Views on Agentic Trading

The Bitget REST API was reliable throughout — consistent order execution, deep perps liquidity, and clean separation between demo and live accounts via the same API surface. That trust bridge is the product: letting an agent prove itself on paper money before touching real capital is exactly the right architecture for agentic trading.

Playbook is the most exciting next step. CycleMind's regime engine naturally maps to a multi-step strategy execution model — detect regime, score signals, size position, manage risk — and Playbook's structured flow would let that logic run natively on Bitget's infrastructure rather than as an external loop.

The future of agentic trading is not faster execution. It is regime-aware agents that understand *why* a market is moving, not just *that* it moved. The path is multi-agent: a specialist regime detector feeding a specialist signal scorer feeding a specialist execution agent, all overseen by a risk management agent that can pull the plug on any of them. Bitget's infrastructure makes this buildable for independent developers today. That is rare and worth building on.

---

## Disclaimer

CycleMind is a research and signal tool. Nothing here is financial advice. Trading perpetual futures carries significant risk of loss. Always use appropriate position sizing and risk controls.

Still in beta. Honest feedback appreciated.

---

Built for the **Bitget AI Builder Base Camp Hackathon S1** &nbsp;|&nbsp; #BitgetHackathon @BitgetAI
