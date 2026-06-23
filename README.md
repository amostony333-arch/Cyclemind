# CycleMind — AI Market Regime Trading Agent
### Bitget AI Hackathon Submission

> AI-powered perpetual futures trading on BTC, ETH, SOL — demo or live via Bitget

🌐 **Live Demo:** [cyclemind.vercel.app](https://cyclemind.vercel.app) *(no login required)*
🐦 **X:** [@cyclemindarc](https://x.com/cyclemindarc)
📱 **Telegram:** @defitony0x
👤 **Builder:** [@defitony0x](https://x.com/defitony0x)

---

## Why We Built It

Most retail crypto traders lose not because they lack access to data — but because they can't process it fast enough or consistently enough to act on it. By the time a trader reads the chart, checks funding rates, glances at Fear & Greed, and decides on a size, the opportunity is gone or the risk profile has changed.

CycleMind was built to close that gap. It is a single platform that:
- Detects the current market regime in real time
- Scores multi-layer signals across sentiment, technicals, on-chain, and derivatives data
- Auto-executes perpetual futures trades via Bitget's API
- Scans prediction markets for arbitrage opportunities across Polymarket, SX Bet, and Limitless
- Lets any trader practice on $10,000 simulated funds before risking real capital

The vision: give an independent trader the same systematic edge that quant desks have, packaged in a clean mobile-first dashboard anyone can use.

---

## The Three Interfaces

CycleMind is built across three distinct interfaces, each solving a different layer of the trading problem.

### Interface 1 — Dashboard (Portfolio & Market Intelligence)
The original core of CycleMind. Connects to your Bitget account via API, reads your live spot balances, and gives you a full market intelligence layer:
- **Market Regime Detection** — classifies BTC, ETH, SOL into Bull Trend, Weak Uptrend, Range Bound, Weak Downtrend, or Bear Trend using a composite confidence score
- **Signal-Based DCA** — scales buy size dynamically based on Fear & Greed Index instead of a fixed calendar
- **Liquidation Heatmap** — estimates liquidation price clusters across common leverage tiers using live open interest and price data
- **Funding Rate Capture** — flags historically extreme funding percentiles for delta-neutral opportunities
- **Portfolio Rebalancer** — reads your live Bitget spot balances, compares against your target allocation (Conservative / Balanced / Aggressive), applies a regime-aware tilt (shifts toward USDT in detected downtrends), and returns a suggested rebalance plan
- **Entry / Exit Signals** — TP, SL, and MA levels tracked per asset in real time
- **Portfolio & Trade Suggestions** — personalized suggestions based on your connected Bitget portfolio and current market conditions
- **Trending on CoinGecko** — live trending coins with price and 24h change

### Interface 2 — Perps (AI Futures Trading Agent)
The execution layer. AI-powered perpetual futures trading directly on Bitget:
- **AI Signal Cards** — BTC, ETH, SOL each scored -5 to +5 with direction (LONG / SHORT / NEUTRAL), strength rating, funding rate, and a Quick Trade button
- **Manual Position Form** — asset selector, Long/Short toggle, margin input, leverage slider (1x–100x) with preset buttons, live trade summary (notional, estimated liquidation price)
- **AI Trading Agent** — toggle on/off, configurable leverage (default 5x) and position size, auto-executes trades every 15 minutes when signal and regime align
- **Demo Balance Panel** — Cash (USDT), Total Equity, Starting Balance, P&L
- **Open Positions** — live P&L, entry price, mark price, notional, liquidation price, Close button per position. Agent-opened positions tagged with AGENT badge
- **Trade History** — full log of closed trades

### Interface 3 — Arb (Prediction Market Scanner)
The alpha extension. Scans sports prediction markets across three platforms for pricing discrepancies:
- **Polymarket** — Live feed
- **SX Bet** — Live feed
- **Limitless** — 30 second delayed feed
- Sport filters: All / NFL / NBA / MLB / NHL / Soccer
- Configurable minimum edge threshold (default 1.5–2%) and max stake per arb ($50)
- Auto-execute toggle — runs on demo account only
- Settlement Tracker — monitors open arb positions through resolution
- Demo Balance: $1,000 simulated, tracks locked positions and realised P&L

---

## The Trading Strategy — Why It Works

### Core Philosophy

Markets move in regimes. A strategy that works in a bull trend will get destroyed in sideways chop. CycleMind's first job on every cycle is to classify *what kind of market this is* before touching position sizing or direction. No signal fires against the regime. Ever.

### Regime Engine (`regime_engine.py`)

Every asset is scored using a **composite confidence score** weighted across four factors:

| Factor | Weight |
|---|---|
| Indicator Agreement (RSI / MACD / EMA) | 30% |
| Volume Divergence | 25% |
| Funding Rate Alignment | 25% |
| BTC Dominance Momentum | 20% |

Each asset has its own confidence threshold before a signal is considered actionable:
- BTC: 60%
- ETH: 62%
- SOL: 68%

All modules — liquidation heatmap proximity, funding alignment — feed directly into this confidence score rather than acting as disconnected signals.

A **CASCADE RISK** flag activates when liquidation cluster density is elevated near current price. When CASCADE RISK is active, the agent suppresses all new entries regardless of signal score.

### Signal Stack

**Sentiment (Macro)**
- Fear & Greed Index: sub-25 (Extreme Fear) increases DCA multiplier — buy more when others panic. 75+ contracts sizing.
- Funding Rates: persistent positive = crowded longs = fade. Negative = squeeze potential = long bias.

**On-Chain and Derivatives**
- Open Interest across BTC, ETH, SOL — crowdedness indicator
- Liquidation Heatmap Zones — dense clusters treated as targets and risk zones

**Technical Indicators (`indicators.py`)**
- RSI across multiple timeframes
- MACD crossover and histogram momentum
- EMA structure: 20D / 50D / 200D alignment
- Candlestick pattern recognition
- Support and resistance proximity scoring

**Signal Scoring**

| Score | Decision |
|---|---|
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

| Control | Value | Behavior |
|---|---|---|
| Daily loss limit | 10% | Agent halts, no new entries |
| Max position per asset | 40% | Hard cap, agent skips oversized assets |
| Trade cooldown | 15 minutes | Prevents overtrading in chop |
| Default agent leverage | 5x | Conservative vs 100x manual max |
| CASCADE RISK flag | Dynamic | Suppresses all entries near liq clusters |
| Emergency Stop | Always visible | One tap closes all positions, kills agent |

### Prediction Market Arb Logic

When the same outcome is mispriced across platforms — e.g. Team A at 55% implied on Polymarket but 48% on SX Bet — that is a mathematical edge independent of the actual outcome. CycleMind identifies these gaps, validates they exceed the minimum edge threshold after fees and latency, and executes both sides simultaneously in demo mode.

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

> Public market-data endpoints (funding rate, open interest, ticker, fear/greed) work without API keys. Portfolio, rebalancer, and live trading features require connecting your own Bitget API key through the Connect modal.

---

## Deployment

### Frontend → Vercel
1. Push this repo to GitHub
2. Import in Vercel, set root directory to `frontend`
3. Deploy — Vercel auto-detects static sites, no build config needed

### Backend → Railway (or Render)
1. Import repo in Railway, set root directory to `backend`
2. Add environment variables from `.env.example` in Railway's dashboard
3. Set start command:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Copy the Railway URL, update `API_BASE` in `frontend/app.js`, and set `FRONTEND_ORIGIN` in Railway env vars to your Vercel URL

---

## Key Development Challenges and How We Solved Them

**Multi-instance auto-trade race condition**
Deploying on Kitsop caused multiple server instances to each run the background agent loop, firing duplicate orders on the same signal. Solved with a single-instance lock and heartbeat check — only one loop runs at a time.

**Flat-file user storage**
Early auth used `users.json`. Works for MVP but creates write conflicts under concurrency. Migration to PostgreSQL is the top priority for v7.

**Client-side wallet generation**
Wallets are generated in the browser via ethers.js — private keys never touch the server. The UX challenge was making this feel safe without alarming users. Solved with a staged warning flow and explicit confirmation before the key is displayed.

**Signal noise in range-bound markets**
Early builds triggered too many agent trades in sideways conditions. Adding regime detection as a hard gate — not just a weight — eliminated most false positives. CASCADE RISK suppresses all entries when liq risk is elevated.

**Arb latency on prediction markets**
Limitless has a mandatory 30-second delay. Solved by flagging delayed sources clearly in the UI and setting minimum edge thresholds high enough to survive latency and still be profitable after fees.

**Signal-to-action gap on Perps**
Users were losing signal context by the time they navigated to the trade form. Solved by unifying the Perps page — signal cards at the top with inline Quick Trade buttons, manual position form below, demo balance always visible.

---

## Features Completed

- [x] Market Regime Detection — 5 regimes, CASCADE RISK, composite confidence score with per-asset thresholds
- [x] All modules feeding from single `regime_engine.py`
- [x] Signal-Based DCA with Fear & Greed multiplier
- [x] Liquidation Heatmap — open interest + leverage tier estimation
- [x] Funding Rate Capture — extreme percentile flagging
- [x] Portfolio Rebalancer — live Bitget balances, regime-aware tilt, suggested plan
- [x] Entry / Exit Signals with TP, SL, MA levels
- [x] Portfolio & Trade Suggestions
- [x] Trending on CoinGecko module
- [x] Live prices with 24h change
- [x] Perps trading interface — full manual position form (asset, direction, margin, 1x–100x leverage)
- [x] AI Trading Agent — toggle, configurable leverage and size, 15-min cycle
- [x] Open Positions — live P&L, notional, liq price, Close button, AGENT badge
- [x] Trade History log
- [x] Demo Trading — $10,000 simulated funds, equity curve
- [x] Prediction Market Arb Scanner — Polymarket, SX Bet, Limitless
- [x] Arb auto-execute (demo only) + Settlement Tracker
- [x] Email auth with magic link
- [x] Client-side Ethereum wallet generation (ethers.js)
- [x] Emergency Stop — global, persistent across all pages
- [x] Connect Bitget modal with Conservative / Balanced / Aggressive risk profiles
- [x] Mobile-first responsive UI across all three interfaces

---

## What Is Still Missing / Next Steps

### v8 Roadmap

- [ ] Full Bitget Playbook integration — structured multi-step strategy execution
- [ ] Multi-agent infrastructure — specialist agents for regime, signals, execution, and risk running in parallel
- [ ] Live prediction market arb execution on real accounts
- [ ] Backtest engine — validate signal edge against historical OHLCV data
- [ ] Leaderboard — rank top demo performers
- [ ] Push notifications — signal triggers and agent trade alerts via mobile, X, Telegram
- [ ] Expanded asset coverage beyond BTC / ETH / SOL
- [ ] Database migration — users.json → PostgreSQL
- [ ] On-chain Bitget Wallet integration
- [ ] Trade alert webhooks — Telegram bot and X post on every agent trade

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | Vanilla JS, HTML, CSS |
| Hosting | Kitsop (API) + Vercel (frontend) |
| Exchange | Bitget REST API — prices, OI, funding, orders, portfolio |
| Wallet | ethers.js (client-side key generation) |
| Prediction Markets | Polymarket API, SX Bet API, Limitless API |
| Auth | Email magic link + localStorage session |
| Market Data | CoinGecko, Fear & Greed Index API, Bitget market data |

---

## Bitget Integration

- **Bitget REST API** — live prices, open interest, funding rates, order placement and management for BTC/USDT, ETH/USDT, SOL/USDT perpetual futures
- **Bitget Perps** — primary trading venue for the AI agent
- **Bitget Playbook** — referenced in v6 architecture, full native integration planned for v7
- API key auth: Connect modal accepts key + secret + passphrase with read-only or trade permissions based on user intent

> API keys used through the Connect modal should be **read-only** unless you explicitly intend to enable live trade execution. This MVP stores credentials in browser localStorage — for production deployments with real users, credentials should be encrypted at rest server-side.

---

## Views on Agentic Trading

The next frontier is not faster execution — it is regime-aware agents that understand *why* a market is moving, not just that it moved. Combining on-chain flows, derivatives positioning crowdedness, and macro sentiment into a single coherent world model — then routing different agent behaviors based on that model — is where the real systematic edge lives.

The path from here is multi-agent: a specialist regime detector feeding a specialist signal scorer feeding a specialist execution agent, all overseen by a risk management agent that can pull the plug on any of them. That is what CycleMind v7 is building toward.

Bitget's infrastructure makes this possible for independent builders. Reliable order execution, deep perps liquidity, and demo + live account separation via the same API surface are exactly what you need to let an agent prove itself on paper money before touching real capital. The trust bridge is the product.

---

## Submission Checklist

- [x] Live demo publicly accessible — [cyclemind.vercel.app](https://cyclemind.vercel.app) (no login required)
- [x] GitHub repo — [github.com/amostony333-arch/Cyclemind](https://github.com/amostony333-arch/Cyclemind)
- [x] Project post with #BitgetHackathon and @BitgetAI — [@cyclemindarc on X](https://x.com/cyclemindarc)
- [ ] Repost of official Bitget campaign post
- [ ] Live / paper trading log (upload to GitHub)
- [ ] Demo video

---

## Disclaimer

CycleMind is a research and signal tool. Nothing here is financial advice. Trading perpetual futures carries significant risk of loss. Always use appropriate position sizing and risk controls.

---

*Still in beta. Honest feedback appreciated.*

#BitgetHackathon @BitgetAI
