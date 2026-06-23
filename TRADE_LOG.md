# CycleMind Regime Strategy — Paper Trading Log

> This Bitget GetAgent Studio paper trading session is the strategy used to train and calibrate the CycleMind AI trading agent. The signal logic, regime confidence thresholds, entry/exit rules, and risk parameters defined in this Playbook were iterated on through live paper trading and fed directly into CycleMind's regime engine (`regime_engine.py`) and signal scoring system. The results — including losses — informed every tuning decision in v7
> # CycleMind Regime Strategy — Paper Trading Log

**Platform:** Bitget GetAgent Studio
**Strategy:** CycleMind Regime Strategy (v5)
**Markets:** BTCUSDT · ETHUSDT · SOLUSDT
**Paper Trading Start:** Jun 22, 2026 08:07 AM
**Log Snapshot:** Jun 23, 2026 14:02

---

## Performance Summary

| Metric | Value |
|---|---|
| Total Return | -7.41% |
| Max Drawdown | -23.9% |
| Win Rate | 29% |
| Profit Factor | 0.76x |
| Avg Round Trip | -0.01% |
| Round Trips | 17 |
| Avg Hold Time | 2h 24m |

---

## Strategy Logic (Bitget Playbook Brief)

**Entry Conditions**
- Regime confirmed by at least 2 of 3 layers agreeing
- Composite confidence score ≥ 65%
- No trades during Compression / Chop regimes regardless of confidence
- Counter-trend trades require 85% confidence and sized at half normal risk (1.5% instead of 3%)

**Exit Conditions**
- Stop loss at 1.5× the 14-period ATR from entry on the adverse side
- Take profit at 2:1 reward-to-risk ratio (3× ATR from entry)
- No trailing stops or partial exits

**Risk Notes**
- Regime classification can lag during rapid market transitions
- Volume-derived proxies for funding rate may diverge from actual funding rates
- Strategy may underperform in sideways or low-volatility markets where regime signals are weak

---

## Execution History — 17 Round Trips (Jun 2026)

| # | Direction | Entry Time | Entry Price | Exit Time | Exit Price | Qty | P&L (USD) | Return | Hold Time |
|---|---|---|---|---|---|---|---|---|---|
| 1 | LONG | Jun 14, 11:30 PM | $65,240.10 | Jun 15, 01:00 AM | $65,845.40 | 0.715 | +$385.93 | +0.93% | 1h 30m |
| 2 | LONG | Jun 14, 10:45 PM | $65,417.90 | Jun 14, 11:00 PM | $65,258.40 | 0.764 | -$171.78 | -0.24% | 15m |
| 3 | SHORT | Jun 14, 06:45 PM | $63,760.50 | Jun 14, 09:30 PM | $64,003.10 | 0.784 | -$240.28 | -0.38% | 2h 45m |
| 4 | SHORT | Jun 14, 03:30 PM | $63,974.70 | Jun 14, 05:15 PM | $64,108.30 | 0.781 | -$154.36 | -0.21% | 1h 45m |
| 5 | LONG | Jun 13, 10:45 PM | $64,472.00 | Jun 14, 07:30 AM | $64,287.90 | 0.775 | -$192.57 | -0.29% | 8h 45m |
| 6 | LONG | Jun 13, 01:45 PM | $64,097.00 | Jun 13, 05:15 PM | $64,037.80 | 0.780 | -$96.15 | -0.09% | 3h 30m |
| 7 | LONG | Jun 12, 01:00 AM | $63,700.00 | Jun 12, 02:15 AM | $63,320.10 | 0.784 | -$347.63 | -0.60% | 1h 15m |
| 8 | LONG | Jun 11, 02:45 PM | $63,134.00 | Jun 11, 03:00 PM | $62,760.20 | 0.791 | -$345.47 | -0.59% | 15m |
| 9 | LONG | Jun 11, 09:45 AM | $62,905.20 | Jun 11, 01:30 PM | $62,883.70 | 0.794 | -$67.01 | -0.03% | 3h 45m |
| 10 | LONG | Jun 10, 04:00 PM | $62,143.20 | Jun 10, 06:30 PM | $61,719.80 | 0.577 | -$280.04 | -0.68% | 2h 30m |
| 11–17 | — | — | — | — | — | — | Pending full export | — | — |

---

## Notes

- Only 1 winning trade out of 10 logged (trade #1, +$385.93)
- Strategy is long-biased during a period where BTC ranged between $61,700–$65,800
- Short entries (#3, #4) both closed at a loss — market did not follow through on downside
- Longest losing streak: trades #2 through #10 (9 consecutive losses)
- Win rate of 29% with profit factor of 0.76 indicates the strategy is not yet recovering losses on winners
- Max drawdown of -23.9% suggests regime lag during the Jun 10–14 range-bound period

## Diagnosis

The Jun 2026 window was predominantly **Range Bound** across BTC, ETH, and SOL — exactly the regime where CycleMind is designed to stay out. The -7.4% return likely reflects regime misclassification during rapid transitions between $62K and $65K, causing the agent to enter trending setups that reversed quickly.

**v8 fixes targeting this:**
- Tighter compression detection to suppress entries during low-ATR environments
- Confidence threshold raised to 70% for BTC during cascade risk periods
- Counter-trend short entries require 85% confidence (already in Playbook brief, needs stricter enforcement)

---

*Generated from Bitget GetAgent Studio paper trading session*
*Strategy: CycleMind Regime Strategy v5 · Published Jun 18, 2026*
