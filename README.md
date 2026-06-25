# CycleMind — AI Market Regime Trading Agent

> AI-powered perpetual futures trading on BTC, ETH, SOL — demo or live via Bitget

[![Live Demo](https://img.shields.io/badge/Live_Demo-cyclemind.vercel.app-0078ff?style=flat-square)](https://cyclemind.vercel.app)
[![Hackathon](https://img.shields.io/badge/Bitget_AI_Hackathon-S1-00c6ff?style=flat-square)](https://x.com/cyclemindarc)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

🌐 [cyclemind.vercel.app](https://cyclemind.vercel.app) &nbsp;|&nbsp; 🐦 [@cyclemindarc](https://x.com/cyclemindarc) &nbsp;|&nbsp; 📱 Telegram: [@defitony0x](https://t.me/defitony0x)

---

## Strategy — Full Breakdown

### Why Does the Strategy Work?

Most trading systems fail because they apply the same logic to every market condition. A momentum strategy that crushes it in a bull trend gets destroyed in sideways chop. A mean-reversion strategy that works in range-bound markets bleeds out during a strong trend. The root problem is not the signal — it is applying the signal without knowing what kind of market you are in.

CycleMind solves this with a **regime-first architecture**. Before any signal fires, the system classifies the current market into one of five states:

- **Bull Trend** — strong upward momentum, high confidence, agent buys dips
- **Weak Uptrend** — upward bias but low conviction, agent sizes down
- **Range Bound** — no directional edge, agent waits or fades extremes
- **Weak Downtrend** — downward bias, agent avoids longs, reduces exposure
- **Bear Trend** — strong downward momentum, agent exits positions, shifts to USDT

Every other module — DCA sizing, position direction, portfolio rebalancing tilt — flows from this single classification. No trade ever executes against the detected regime. This one constraint eliminates the majority of losing trades that other systems make by fighting the trend.

---

### What Signals Does It Use?

CycleMind layers four distinct signal categories. Each contributes to the composite confidence score that determines whether a signal is actionable.

#### 1. Macro / Sentiment Signals

**Fear & Greed Index** (Alternative.me)

The Fear & Greed Index measures the emotional state of the market on a 0–100 scale. CycleMind uses it to scale DCA buy size dynamically:

| Fear & Greed Value | Sentiment | DCA Multiplier |
|--------------------|-----------|----------------|
| 0 – 20 | Extreme Fear | 2.0x — buy aggressively |
| 21 – 40 | Fear | 1.5x — buy more than normal |
| 41 – 59 | Neutral | 1.0x — standard size |
| 60 – 74 | Greed | 0.75x — reduce size |
| 75 – 100 | Extreme Greed | 0.5x — contract significantly |

The logic: when everyone is panicking, assets are oversold and expected returns are higher. When everyone is greedy, assets are overbought and risk is elevated. This is a systematic implementation of contrarian sizing.

#### 2. Derivatives Signals

**Funding Rates** (Bitget API)

Perpetual futures funding rates reveal positioning crowdedness in real time.
- Persistent positive funding = market is net long = crowded = fade the crowd, reduce long bias
- Persistent negative funding = market is net short = squeeze potential = long bias increases
- Extreme funding percentiles trigger the Funding Rate Capture module and flag delta-neutral opportunities

**Open Interest** (Bitget API)

Rising open interest during a price move confirms the move is backed by new money entering the market. Flat or falling OI during a price move signals a weak, unconvinced move. CycleMind uses OI as a crowdedness and conviction indicator across BTC, ETH, and SOL.

**Liquidation Heatmap**

Built from live open interest data and common leverage tier assumptions (5x, 10x, 20x, 50x, 100x), the heatmap estimates where large clusters of liquidations sit relative to current price. Dense liquidation clusters above price are potential targets for short squeezes. Dense clusters below price are cascade risk zones. When price is near a dense cluster, the **CASCADE RISK** flag activates and all new entries are suppressed regardless of signal score.

#### 3. Technical Indicators

All technical signals are calculated in `indicators.py` and fed into the composite regime score.

**RSI (Relative Strength Index)** — measured across multiple timeframes. Sub-30 = oversold, contributes positive signal score. Above 70 = overbought, contributes negative signal score. Multi-timeframe agreement strengthens the signal.

**MACD (Moving Average Convergence Divergence)** — crossover direction and histogram momentum. Bullish crossover with expanding histogram = positive contribution. Bearish crossover with contracting histogram = negative contribution.

**EMA Structure (20D / 50D / 200D)** — price position relative to moving averages defines the trend structure. Price above all three EMAs in sequence = confirmed uptrend. Price below = confirmed downtrend. The 200D EMA acts as the macro trend anchor.

**Candlestick Pattern Recognition** — identifies high-probability reversal and continuation patterns to refine entry timing within the regime context.

**Support and Resistance Proximity Scoring** — measures distance from key price levels. Entries near strong support in an uptrend score higher. Entries near strong resistance score lower.

#### 4. On-Chain / Cross-Asset Signals

**BTC Dominance Momentum** — contributes 20% to the regime confidence score. Rising BTC dominance during a market downturn signals risk-off rotation (altcoins selling into BTC). Falling BTC dominance in an uptrend signals risk-on expansion. This provides a cross-asset macro context that pure price indicators miss.

**Prediction Market Arb** (Polymarket, SX Bet, Limitless) — a separate alpha layer that scans for mathematical pricing discrepancies across sports prediction markets. When the same outcome is priced at 55% on one platform and 48% on another, that is a risk-free edge independent of the actual outcome. CycleMind identifies these gaps, validates they exceed the minimum threshold after fees and latency, and executes both sides simultaneously on demo.

---

### How Are Decisions Made?

Every 15 minutes the agent runs a full decision cycle:

```
STEP 1 — REGIME CHECK
  Fetch live OHLCV, funding rate, OI, BTC dominance
  Run regime_engine.py composite scoring
  Classify: Bull / Weak Uptrend / Range / Weak Downtrend / Bear
  Check CASCADE RISK flag

STEP 2 — SIGNAL SCORING
  Score each asset -5 to +5 across:
    RSI (multi-timeframe)        → +/- contribution
    MACD crossover + histogram   → +/- contribution
    EMA structure alignment      → +/- contribution
    Funding rate alignment       → +/- contribution
    Open interest trend          → +/- contribution
    Fear & Greed context         → +/- contribution

STEP 3 — DECISION GATE
  Score >= +2 AND regime supports LONG  → ENTER LONG
  Score <= -2 AND regime supports SHORT → ENTER SHORT
  Score -1 to +1                        → WAIT
  CASCADE RISK active                   → WAIT (override, no exceptions)

STEP 4 — RISK CHECKS (all must pass)
  Daily P&L within -10% limit?          → continue / halt
  Position size under 40% per asset?    → continue / skip
  15-minute cooldown elapsed?           → continue / wait
  Kill switch active?                   → halt all

STEP 5 — EXECUTION
  Open position on Bitget perps
  Set TP and SL levels
  Tag position with AGENT badge in UI

STEP 6 — MONITORING
  Check open positions every cycle
  Close on TP breach, SL breach, or regime flip
  Log: timestamp, pair, side, price, size, balance
```

Per-asset confidence thresholds before a signal is considered actionable:

| Asset | Confidence Threshold | Reason |
|-------|---------------------|--------|
| BTC | 60% | Most liquid, lower noise threshold |
| ETH | 62% | Slightly more volatile than BTC |
| SOL | 68% | Most volatile, highest false signal rate |

The regime confidence score is weighted across four factors:

| Factor | Weight |
|--------|--------|
| Indicator Agreement (RSI / MACD / EMA) | 30% |
| Volume Divergence | 25% |
| Funding Rate Alignment | 25% |
| BTC Dominance Momentum | 20% |

---

### How Is Risk Managed?

Risk management in CycleMind operates at four levels simultaneously.

#### Level 1 — Position-Level Risk

Every position opened by the agent has a defined take profit and stop loss calculated at entry. These are not optional — no position opens without both levels set. If price reaches either level, the position closes automatically regardless of current signal score.

#### Level 2 — Asset-Level Risk

No single asset can represent more than **40% of total portfolio value** in open positions. If BTC already represents 40% of the portfolio and the agent generates a new BTC signal, that signal is skipped. This prevents concentration risk and single-asset blow-ups.

#### Level 3 — Account-Level Risk

The agent tracks daily P&L as a percentage of starting equity every cycle. If daily losses reach **-10%**, the agent halts completely — no new entries, no new positions — until the next trading day resets the counter. This hard daily loss limit prevents a bad signal cluster from compounding into account destruction.

A **15-minute cooldown** between trades on the same asset prevents the agent from overtrading during choppy, low-conviction conditions where signals flip rapidly.

Default agent leverage is **5x** — conservative relative to the 100x maximum available. This gives meaningful exposure while keeping liquidation levels far from current price under normal volatility.

#### Level 4 — System-Level Risk

The **CASCADE RISK** flag operates above all other signals. When liquidation cluster density is elevated near current price — meaning a large number of leveraged positions are close to being forcibly closed — the agent suppresses all new entries. Cascade events are one of the most dangerous conditions in crypto markets, and no signal score overrides this flag.

The **Emergency Stop** button is always visible on every page. One tap closes all open positions immediately and kills the agent loop. It persists across page refreshes — once activated, it stays active until manually reset. This is the human override layer that sits above all automated logic.

| Control | Value | Behaviour |
|---------|-------|-----------|
| Daily loss limit | 10% | Agent halts, no new entries |
| Max position per asset | 40% | Hard cap, agent skips oversized assets |
| Trade cooldown | 15 minutes | Prevents overtrading in chop |
| Default agent leverage | 5x | Conservative vs 100x manual max |
| CASCADE RISK flag | Dynamic | Suppresses all entries near liq clusters |
| Emergency Stop | Always visible | One tap closes all positions and kills agent |

---

## Development Challenges, Features & Stack

### Key Development Challenges and How We Solved Them

**Multi-instance auto-trade race condition**
Deploying on Railway caused multiple server instances to each run the background agent loop simultaneously, firing duplicate orders on the same signal. Solved with a single-instance lock and heartbeat check — only one agent loop runs at a time across all instances. Any new instance that starts detects the running lock and defers.

**Signal noise in range-bound markets**
Early builds triggered too many agent trades in sideways conditions. The signals were technically correct in isolation but wrong for the market context. Adding regime detection as a hard gate — not just a weight in the score — eliminated most false positives. The agent now waits completely in Range Bound regimes rather than trading smaller. CASCADE RISK suppresses all entries when liquidation risk is elevated near price, adding a second layer of noise filtering.

**Multi-instance flat-file write conflicts**
Early auth used a `users.json` file for storing demo account state. Under concurrent users this caused write conflicts and corrupted data. Short-term fix was atomic file writes with retry logic. Long-term fix (v8) is full PostgreSQL migration.

**Arb latency on prediction markets**
Limitless enforces a mandatory 30-second data delay. An arb opportunity identified on Limitless could have already closed by the time execution fires. Solved by flagging delayed sources clearly in the UI, applying a latency discount to Limitless edge calculations, and setting minimum edge thresholds high enough that the opportunity still clears after fees and delay.

**Client-side wallet generation UX**
Private keys are generated in the browser via ethers.js and never touch the server. The UX challenge was making this feel safe without alarming new users. Solved with a staged reveal flow: warning screen first, explicit checkbox confirmation, then the key displayed once. The key is cleared from the DOM immediately after the user confirms they have saved it.

**Signal-to-action gap on Perps**
Early Perps builds showed signal cards at the top and the trade form at the bottom — users were losing signal context by the time they scrolled to execute. Solved by unifying the Perps page: signal cards with inline Quick Trade buttons, manual form below, demo balance always visible. One screen, no context switching.

---

### Features Completed

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

### Still Missing / Next Steps (v8)

- [ ] Full Bitget Playbook integration — structured multi-step strategy execution natively on Bitget infrastructure
- [ ] Multi-agent infrastructure — specialist agents for regime, signals, execution, and risk running in parallel
- [ ] Live prediction market arb execution on real accounts
- [ ] Backtest engine — validate signal edge against historical OHLCV data
- [ ] Leaderboard — rank top demo performers
- [ ] Push notifications — signal triggers and agent trade alerts via Telegram and X
- [ ] Expanded asset coverage beyond BTC / ETH / SOL
- [ ] Database migration — users.json → PostgreSQL
- [ ] Trade alert webhooks — Telegram bot and X post on every agent trade
- [ ] On-chain Bitget Wallet integration

### Frameworks, Models, and APIs Used

| Layer | Technology |
|-------|-----------|
| Backend framework | FastAPI (Python) |
| Frontend | Vanilla JS, HTML5, CSS3 |
| Hosting — frontend | Vercel |
| Hosting — backend | Railway |
| Exchange API | Bitget REST API — spot prices, open interest, funding rates, order placement, portfolio balances |
| Trading venue | Bitget Perps (BTC/USDT, ETH/USDT, SOL/USDT perpetual futures) |
| Wallet generation | ethers.js (client-side, browser only) |
| Market sentiment | Fear & Greed Index API (Alternative.me) |
| Price & trending data | CoinGecko API |
| Prediction markets | Polymarket API, SX Bet API, Limitless API |
| Auth | Email magic link + localStorage session |
| Technical indicators | Custom Python — RSI, MACD, EMA (indicators.py) |
| Regime engine | Custom Python — composite confidence scoring (regime_engine.py) |

**Bitget tools used:**
- **Bitget REST API** — core data and execution layer throughout
- **Bitget Perps** — primary trading venue for all AI agent positions
- **Bitget Playbook** — referenced in v8 architecture, full integration is the top next-step priority. CycleMind's regime → signal → execute → risk flow maps directly to Playbook's structured multi-step strategy model.

Agent Hub, MCP Server, Skill Hub, and US Stocks Data API were not used in this version.

---

## AI Trading Thoughts

### Experience Using Bitget AI Tools

The Bitget REST API was the most reliable part of the entire stack throughout development. Order execution was consistent, the perps data (funding rates, open interest, mark price) was accurate and low-latency, and the clean separation between demo and live accounts on the same API surface was exactly what was needed to let the agent prove itself on paper money before touching real capital.

That demo/live separation is underrated. It means the same codebase, the same agent logic, and the same risk controls run identically in both environments. There is no "test mode" divergence. When the agent works correctly on demo, you have genuine confidence it will behave the same way live. That trust bridge is the product.

### Suggestions for Improvement

**Playbook native regime integration** — the biggest gap right now is that CycleMind's regime engine runs as an external loop calling the Bitget API. If Playbook exposed a regime-context hook — a way for an external signal source to set the strategy's current market state — the full CycleMind stack could run natively inside Bitget's infrastructure rather than on a separate Railway server. This would reduce latency, improve reliability, and remove the multi-instance race condition entirely.

**Webhook triggers on funding rate extremes** — a simple API endpoint that fires when funding crosses a configurable percentile threshold would unlock a lot of delta-neutral strategy automation without requiring a always-on polling loop.

**Demo account P&L leaderboard** — a public leaderboard of demo account returns built into Bitget's platform would drive significant engagement for AI builder hackathons and strategy competitions.

### Views on the Future of Agentic Trading

The next frontier is not faster execution — it is regime-aware agents that understand *why* a market is moving, not just *that* it moved. Combining on-chain flows, derivatives positioning crowdedness, and macro sentiment into a single coherent world model — then routing different agent behaviours based on that model — is where the real systematic edge lives.

The path from here is multi-agent: a specialist regime detector feeding a specialist signal scorer feeding a specialist execution agent, all overseen by a risk management agent that can pull the plug on any of them. Each agent is optimised for one job. No single agent tries to do everything. The risk agent's only job is to say no — and it never gets overridden by the others.

The biggest unsolved problem in agentic trading is not alpha generation — it is trust. How does a trader trust an autonomous agent with real capital? The answer is a transparent paper trading record that proves the agent's edge before live funds are risked, hard-coded risk limits that the agent literally cannot override, and a kill switch that the human controls absolutely. CycleMind is built around all three. Bitget's infrastructure — reliable execution, demo/live account parity, deep perps liquidity — makes this buildable for independent developers today. That is rare and worth building on.

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

## Disclaimer

CycleMind is a research and signal tool. Nothing here is financial advice. Trading perpetual futures carries significant risk of loss. Always use appropriate position sizing and risk controls.

Still in beta. Honest feedback appreciated.

---

Built for the **Bitget AI Builder Base Camp Hackathon S1** &nbsp;|&nbsp; #BitgetHackathon @BitgetAI
