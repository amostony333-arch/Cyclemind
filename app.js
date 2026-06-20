// CycleMind Frontend Logic
const API_BASE = "https://cyclemind-production.up.railway.app/api";

let userCredentials = null;
let emailUser = null; // { email, walletAddress }

// ==================== AUTH ====================

function showLoginModal() {
    document.getElementById("login-modal").style.display = "flex";
}

function closeLoginModal() {
    document.getElementById("login-modal").style.display = "none";
}

function switchLoginTab(tab) {
    document.getElementById("tab-bitget").classList.toggle("active", tab === "bitget");
    document.getElementById("tab-email").classList.toggle("active", tab === "email");
    document.getElementById("bitget-tab-content").style.display = tab === "bitget" ? "block" : "none";
    document.getElementById("email-tab-content").style.display = tab === "email" ? "block" : "none";
}

function showConnectedState() {
    document.getElementById("login-btn").style.display = "none";
    document.getElementById("connected-badge").style.display = "inline";
    document.getElementById("logout-btn").style.display = "inline-block";
    hideEmailCTA();
}

function logoutUser() {
    userCredentials = null;
    emailUser = null;
    localStorage.removeItem("bitget_creds");
    localStorage.removeItem("email_user");
    document.getElementById("login-btn").style.display = "inline-block";
    document.getElementById("connected-badge").style.display = "none";
    document.getElementById("logout-btn").style.display = "none";
    document.getElementById("api-key").value = "";
    document.getElementById("api-secret").value = "";
    document.getElementById("passphrase").value = "";
    loadPortfolioViewer();
    loadRebalancerModule();
}

// Bitget login
document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    userCredentials = {
        api_key: document.getElementById("api-key").value,
        api_secret: document.getElementById("api-secret").value,
        passphrase: document.getElementById("passphrase").value,
        risk_profile: document.getElementById("risk-profile").value,
    };
    localStorage.setItem("bitget_creds", JSON.stringify(userCredentials));
    closeLoginModal();
    showConnectedState();
    loadPortfolioViewer();
    loadRebalancerModule();
});

// Shared magic link sender — used by both the modal form and the hero CTA form
async function sendMagicLink(email) {
    const res = await fetch(`${API_BASE}/auth/magic-link/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("Could not send link");
}

function hideEmailCTA() {
    const cta = document.getElementById("email-cta");
    if (cta) cta.style.display = "none";
}

// Email / magic link login (modal version)
document.getElementById("email-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email-address").value.trim();
    if (!email) return;
    try {
        await sendMagicLink(email);
        document.getElementById("email-tab-content").innerHTML =
            `<h2>Check your inbox</h2><p class="modal-subtext">We sent a sign-in link to ${email}. Click it to enter your demo account.</p>`;
    } catch (err) {
        alert("Could not send sign-in link — please try again.");
    }
});

// Email / magic link login (hero CTA version — front and center on the page)
const heroEmailForm = document.getElementById("hero-email-form");
if (heroEmailForm) {
    heroEmailForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("hero-email-address");
        const statusEl = document.getElementById("hero-email-status");
        const email = emailInput.value.trim();
        if (!email) return;
        statusEl.textContent = "Sending...";
        statusEl.style.color = "#90a8c8";
        try {
            await sendMagicLink(email);
            statusEl.textContent = `✅ Check your inbox — we sent a sign-in link to ${email}.`;
            statusEl.style.color = "#00a550";
            emailInput.value = "";
        } catch (err) {
            statusEl.textContent = "❌ Could not send link — please try again.";
            statusEl.style.color = "#ff4444";
        }
    });
}

document.getElementById("confirm-saved-checkbox").addEventListener("change", (e) => {
    document.getElementById("confirm-wallet-btn").disabled = !e.target.checked;
});

async function confirmWalletSaved() {
    const { email, address } = window._pendingWallet;

    // Only email + public address go to the server. Never the private key.
    try {
        const res = await fetch(`${API_BASE}/auth/email-signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, wallet_address: address }),
        });
        if (!res.ok) throw new Error("Signup failed");
    } catch (err) {
        console.error("Email signup error:", err);
        alert("Could not register account — please try again.");
        return;
    }

    emailUser = { email, walletAddress: address };
    localStorage.setItem("email_user", JSON.stringify(emailUser));

    document.getElementById("wallet-reveal-modal").style.display = "none";
    document.getElementById("wallet-mnemonic-display").textContent = "";
    document.getElementById("wallet-privkey-display").textContent = "";
    window._pendingWallet = null;

    showConnectedState();
}

// ==================== API HELPERS ====================

async function fetchJSON(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return null;
    }
}

async function fetchRegimeOverview() { return fetchJSON(`/regime-overview`); }
async function fetchRegime(symbol) { return fetchJSON(`/regime/${symbol}`); }
async function fetchFundingRate(symbol) { return fetchJSON(`/funding-rate/${symbol}`); }
async function fetchOpenInterest(symbol) { return fetchJSON(`/open-interest/${symbol}`); }
async function fetchFearGreed() { return fetchJSON(`/fear-greed`); }
async function fetchEntryExitOverview() { return fetchJSON(`/entry-exit-overview`); }

// ==================== TOAST ====================

function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = "cm-toast";
    toast.style.background = isError ? "#ff4444" : "#00a550";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ==================== TICKER BAR ====================

async function loadTickerBar() {
    const bar = document.getElementById("ticker-bar");
    try {
        const overview = await fetchRegimeOverview();
        const parts = ["BTCUSDT", "ETHUSDT", "SOLUSDT"].map(symbol => {
            const r = overview?.[symbol];
            if (!r || r.error) return `${symbol.replace("USDT","")}: --`;
            const label = r.regime.replace(/_/g, " ").toUpperCase();
            return `${symbol.replace("USDT","")}: ${label} (${r.confidence}%)`;
        });

        let autoTradeStr = "";
        if (emailUser) {
            const risk = await fetchJSON(`/risk-status/${encodeURIComponent(emailUser.email)}`);
            if (risk) {
                const lastTrades = Object.values(risk.last_auto_trade || {});
                const lastTime = lastTrades.length ? new Date(Math.max(...lastTrades.map(t => new Date(t)))) : null;
                const statusText = risk.kill_switch_active ? "AUTO-TRADE: HALTED"
                    : risk.auto_trade_enabled ? "AUTO-TRADE: ACTIVE"
                    : "AUTO-TRADE: OFF";
                autoTradeStr = ` | ${statusText}${lastTime ? ` (last: ${lastTime.toLocaleTimeString()})` : ""}`;
            }
        }

        bar.innerHTML = `<span>${parts.join(" | ")}${autoTradeStr}</span>`;
    } catch (e) {
        bar.innerHTML = `<span>Scanning markets...</span>`;
    }
}

// ==================== MARKET REGIME ====================

async function loadRegimePanel() {
    const el = document.getElementById("regime-content");
    if (!el) return;
    try {
        const overview = await fetchRegimeOverview();
        let html = "";
        ["BTCUSDT", "ETHUSDT", "SOLUSDT"].forEach(symbol => {
            const r = overview?.[symbol];
            if (!r || r.error) {
                html += `<div class="metric"><span class="label">${symbol.replace("USDT","")}</span><span class="value">Unavailable</span></div>`;
                return;
            }
            const regimeLabel = r.regime.replace(/_/g, " ");
            const cascadeWarning = r.liquidation_context?.cascade_risk_warning;
            const changeColor = r.regime.includes("uptrend") ? "#00a550" : r.regime.includes("downtrend") ? "#ff4444" : "#4a6fa5";
            html += `
                <div class="metric ${r.meets_threshold ? 'highlight' : ''}">
                    <span class="label">${symbol.replace("USDT","")} — <span style="color:${changeColor};text-transform:capitalize">${regimeLabel}</span></span>
                    <span class="value">
                        ${r.confidence}% / ${r.threshold}%
                        ${r.meets_threshold ? '<span class="badge">ACTIONABLE</span>' : ''}
                        ${cascadeWarning ? '<span class="badge" style="background:#f59e0b;">CASCADE RISK</span>' : ''}
                    </span>
                </div>
            `;
        });
        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load regime data.</div>`;
    }
}

// ==================== LIVE PRICES ====================

async function loadLivePrices() {
    const el = document.getElementById("prices-content");
    try {
        const data = await fetchJSON("/prices");
        if (!data) throw new Error("No data");
        const coins = [
            { key: "bitcoin", label: "BTC" },
            { key: "ethereum", label: "ETH" },
            { key: "solana", label: "SOL" },
        ];
        let html = "";
        coins.forEach(({ key, label }) => {
            const coin = data[key];
            if (!coin) return;
            const changeColor = coin.usd_24h_change >= 0 ? "#00a550" : "#ff4444";
            const changeSign = coin.usd_24h_change >= 0 ? "+" : "";
            html += `
                <div class="metric">
                    <span class="label">${label}</span>
                    <span class="value">
                        $${coin.usd.toLocaleString()}
                        <span style="color:${changeColor};font-size:0.8rem;margin-left:0.4rem">${changeSign}${coin.usd_24h_change.toFixed(2)}%</span>
                    </span>
                </div>
            `;
        });
        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load prices.</div>`;
    }
}

// ==================== SIGNAL-BASED DCA ====================

async function loadDCAModule() {
    const el = document.getElementById("dca-content");
    try {
        const fearGreed = await fetchFearGreed();
        const fgValue = fearGreed?.value ? parseInt(fearGreed.value) : 50;
        const fgLabel = fearGreed?.value_classification || "Neutral";
        let multiplier = 1.0;
        if (fgValue <= 20) multiplier = 2.0;
        else if (fgValue <= 40) multiplier = 1.5;
        else if (fgValue >= 80) multiplier = 0.5;
        else if (fgValue >= 60) multiplier = 0.75;
        const baseAmount = 100;
        const suggestedAmount = (baseAmount * multiplier).toFixed(2);
        const fgColor = fgValue <= 30 ? "#00a550" : fgValue >= 70 ? "#ff4444" : "#f59e0b";
        el.innerHTML = `
            <div class="metric">
                <span class="label">Fear & Greed Index</span>
                <span class="value" style="color:${fgColor}">${fgValue} — ${fgLabel}</span>
            </div>
            <div class="metric">
                <span class="label">Base DCA Amount</span>
                <span class="value">$${baseAmount}</span>
            </div>
            <div class="metric highlight">
                <span class="label">Suggested Buy (${multiplier}x multiplier)</span>
                <span class="value">$${suggestedAmount}</span>
            </div>
        `;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load DCA signal.</div>`;
    }
}

// ==================== LIQUIDATION HEATMAP ====================

async function loadLiquidationModule() {
    const el = document.getElementById("liquidation-content");
    try {
        const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
        let html = "";
        for (const symbol of symbols) {
            const oi = await fetchOpenInterest(symbol);
            const oiAmount = oi?.data?.openInterestList?.[0]?.size
                || oi?.data?.[0]?.amount
                || "N/A";
            html += `
                <div class="metric">
                    <span class="label">${symbol.replace("USDT","")} Open Interest</span>
                    <span class="value">${parseFloat(oiAmount).toLocaleString()}</span>
                </div>
            `;
        }
        el.innerHTML = html || `<div class="metric">No data available.</div>`;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load liquidation data.</div>`;
    }
}

// ==================== FUNDING RATE ====================

async function loadFundingModule() {
    const el = document.getElementById("funding-content");
    try {
        const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
        let html = "";
        for (const symbol of symbols) {
            const current = await fetchFundingRate(symbol);
            const rateStr = current?.data?.[0]?.fundingRate;
            const rateNum = rateStr ? parseFloat(rateStr) : null;
            if (rateNum === null) {
                html += `<div class="metric"><span class="label">${symbol.replace("USDT","")} Funding Rate</span><span class="value">N/A</span></div>`;
                continue;
            }
            const isExtreme = Math.abs(rateNum) > 0.0005;
            const rateColor = rateNum > 0 ? "#00a550" : "#ff4444";
            html += `
                <div class="metric ${isExtreme ? 'highlight' : ''}">
                    <span class="label">${symbol.replace("USDT","")} Funding Rate</span>
                    <span class="value" style="color:${rateColor}">
                        ${(rateNum * 100).toFixed(4)}%
                        ${isExtreme ? '<span class="badge">EXTREME</span>' : ''}
                    </span>
                </div>
            `;
        }
        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load funding rates.</div>`;
    }
}

// ==================== TRENDING ====================

async function loadTrending() {
    const el = document.getElementById("trending-content");
    try {
        const data = await fetchJSON("/trending");
        if (!data || !data.coins) throw new Error("No data");
        let html = "";
        data.coins.slice(0, 6).forEach((item, i) => {
            const coin = item.item;
            const changeColor = coin.change_24h >= 0 ? "#00a550" : "#ff4444";
            const changeSign = coin.change_24h >= 0 ? "+" : "";
            html += `
                <div class="metric">
                    <span class="label">#${i+1} ${coin.name}</span>
                    <span class="value">
                        $${coin.price.toLocaleString()}
                        <span style="color:${changeColor};font-size:0.8rem;margin-left:0.4rem">${changeSign}${coin.change_24h}%</span>
                    </span>
                </div>
            `;
        });
        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load trending data.</div>`;
    }
}

// ==================== ENTRY / EXIT SIGNALS ====================

async function loadEntryExitModule() {
    const el = document.getElementById("entry-exit-content");
    if (!el) return;
    try {
        const overview = await fetchEntryExitOverview();
        let html = "";
        ["BTCUSDT", "ETHUSDT", "SOLUSDT"].forEach(symbol => {
            const r = overview?.[symbol];
            const coin = symbol.replace("USDT", "");
            if (!r || r.error) {
                html += `<div class="metric"><span class="label">${coin}</span><span class="value">Unavailable</span></div>`;
                return;
            }
            let actionLabel, actionColor, demoSide;
            if (r.action === "enter_long") { actionLabel = "🟢 ENTER"; actionColor = "#00a550"; demoSide = "buy"; }
            else if (r.action === "exit_or_avoid") { actionLabel = "🔴 EXIT / AVOID"; actionColor = "#ff4444"; demoSide = "sell"; }
            else { actionLabel = "⏸ WAIT"; actionColor = "#f59e0b"; demoSide = null; }

            html += `
                <div class="metric ${r.action !== 'wait' ? 'highlight' : ''}">
                    <span class="label">${coin} — $${r.current_price.toLocaleString()}</span>
                    <span class="value">
                        <span style="color:${actionColor};font-weight:600;">${actionLabel} (score: ${r.score})</span>
                        ${emailUser && demoSide ? `
                            <button class="one-click-btn" style="background:${actionColor}"
                                onclick="oneClickExecute('${coin}', '${demoSide}')">
                                ${demoSide === 'buy' ? 'Execute Buy' : 'Execute Sell'} (Demo)
                            </button>
                        ` : ''}
                    </span>
                </div>
                <div style="font-size:0.75rem;color:#90a8c8;margin:0.2rem 0 0.8rem 0;padding-left:0.2rem;">
                    TP: $${r.suggested_take_profit.toLocaleString()} · SL: $${r.suggested_stop_loss.toLocaleString()} · 
                    20D MA: $${r.daily_moving_averages.sma_20d.toLocaleString()} / 50D MA: $${r.daily_moving_averages.sma_50d.toLocaleString()}
                </div>
            `;
        });
        if (!emailUser) {
            html += `<p style="font-size:0.75rem;color:#90a8c8;margin-top:0.6rem;">Sign in with email to one-click execute these signals on your demo account.</p>`;
        }
        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load entry/exit signals.</div>`;
    }
}

// ==================== PORTFOLIO VIEWER ====================

async function loadPortfolioViewer() {
    const el = document.getElementById("portfolio-content");
    if (!userCredentials) {
        const prices = await fetchJSON("/prices");
        let html = `<p style="font-size:0.82rem;color:#4a6fa5;margin-bottom:1rem;">Connect your Bitget account to see your live portfolio. Market overview:</p>`;
        if (prices) {
            const coins = [
                { key: "bitcoin", label: "BTC" },
                { key: "ethereum", label: "ETH" },
                { key: "solana", label: "SOL" },
            ];
            coins.forEach(({ key, label }) => {
                const coin = prices[key];
                if (!coin) return;
                const changeColor = coin.usd_24h_change >= 0 ? "#00a550" : "#ff4444";
                const changeSign = coin.usd_24h_change >= 0 ? "+" : "";
                html += `
                    <div class="metric">
                        <span class="label">${label} Market Price</span>
                        <span class="value">$${coin.usd.toLocaleString()} <span style="color:${changeColor}">${changeSign}${coin.usd_24h_change.toFixed(2)}%</span></span>
                    </div>
                `;
            });
        }
        html += `<button onclick="showLoginModal()" style="margin-top:1rem;width:100%;padding:0.8rem;background:linear-gradient(135deg,#0078ff,#00c6ff);color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:0.9rem;">Connect Bitget to View Portfolio</button>`;
        el.innerHTML = html;
        return;
    }
    el.innerHTML = `<div class="loading">Fetching your portfolio...</div>`;
    try {
        const res = await fetch(`${API_BASE}/account/spot-balance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: userCredentials.api_key,
                api_secret: userCredentials.api_secret,
                passphrase: userCredentials.passphrase,
            }),
        });
        const data = await res.json();
        const assets = (data.data || []).filter(a => parseFloat(a.available) + parseFloat(a.frozen) > 0);
        if (!assets.length) {
            el.innerHTML = `<div class="metric"><span class="label">No assets found in your account.</span></div>`;
            return;
        }
        let html = `<p style="font-size:0.82rem;color:#4a6fa5;margin-bottom:1rem;">Your Bitget spot balances:</p>`;
        assets.forEach(a => {
            const total = (parseFloat(a.available) + parseFloat(a.frozen)).toFixed(4);
            html += `
                <div class="metric">
                    <span class="label">${a.coin}</span>
                    <span class="value">${total} <span style="font-size:0.75rem;color:#90a8c8;">(avail: ${parseFloat(a.available).toFixed(4)})</span></span>
                </div>
            `;
        });
        const overview = await fetchRegimeOverview();
        html += `<p style="margin-top:1.2rem;margin-bottom:0.6rem;font-size:0.82rem;color:#4a6fa5;font-weight:600;">AI Trade Suggestions:</p>`;
        ["BTCUSDT","ETHUSDT","SOLUSDT"].forEach(sym => {
            const r = overview?.[sym];
            if (!r || r.error) return;
            const coin = sym.replace("USDT","");
            let suggestion = "⏸ Hold — wait for clearer signal";
            let suggColor = "#4a6fa5";
            if (r.meets_threshold) {
                if (r.regime.includes("downtrend")) {
                    suggestion = `⚠️ Reduce ${coin} exposure`;
                    suggColor = "#ff4444";
                } else {
                    suggestion = `✅ Consider adding ${coin}`;
                    suggColor = "#00a550";
                }
            }
            html += `
                <div class="metric">
                    <span class="label">${coin}</span>
                    <span class="value" style="color:${suggColor}">${suggestion}</span>
                </div>
            `;
        });
        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = `<div class="metric" style="color:#ff4444;">Error loading portfolio. Check your API key permissions.</div>`;
    }
}

// ==================== PORTFOLIO REBALANCER ====================

async function loadRebalancerModule() {
    const el = document.getElementById("rebalancer-content");
    if (!userCredentials) {
        el.innerHTML = `
            <div class="metric"><span class="label">Status</span><span class="value">Not Connected</span></div>
            <p style="margin-top:0.8rem;font-size:0.8rem;color:#7090b0;">Connect your Bitget account to view rebalancing suggestions.</p>
        `;
        return;
    }
    el.innerHTML = `<div class="loading">Calculating rebalancing plan...</div>`;
    try {
        const response = await fetch(`${API_BASE}/rebalance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: userCredentials.api_key,
                api_secret: userCredentials.api_secret,
                passphrase: userCredentials.passphrase,
                risk_profile: userCredentials.risk_profile || "balanced",
            }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!data.rebalance_plan) {
            el.innerHTML = `<div class="metric"><span class="label">${data.message || 'No rebalancing needed.'}</span></div>`;
            return;
        }
        let html = `
            <div class="metric highlight">
                <span class="label">Total Portfolio Value</span>
                <span class="value">$${data.total_value_usd.toLocaleString()}</span>
            </div>
            <div class="metric">
                <span class="label">Risk Profile</span>
                <span class="value" style="text-transform:capitalize">${data.risk_profile}</span>
            </div>
        `;
        if (data.rebalance_plan.length === 0) {
            html += `<p style="margin-top:0.8rem;font-size:0.82rem;color:#00a550;">✅ Portfolio is within target allocation — no rebalancing needed.</p>`;
        } else {
            html += `<p style="margin-top:1rem;margin-bottom:0.5rem;font-size:0.82rem;color:#4a6fa5;font-weight:600;">Suggested Actions:</p>`;
            for (const item of data.rebalance_plan) {
                const actionColor = item.action === "buy" ? "#00a550" : "#ff4444";
                html += `
                    <div class="metric">
                        <span class="label" style="color:${actionColor};font-weight:600;">${item.action.toUpperCase()} ${item.asset}</span>
                        <span class="value">$${item.amount_usd.toLocaleString()} <span style="font-size:0.75rem;color:#90a8c8;">(${item.current_pct}% → ${item.target_pct}%)</span></span>
                    </div>
                `;
            }
        }
        html += `<p style="margin-top:0.8rem;font-size:0.75rem;color:#90a8c8;">${data.note}</p>`;
        el.innerHTML = html;
    } catch (error) {
        el.innerHTML = `<div class="metric"><span class="label">Error</span><span class="value" style="color:#ff4444;">${error.message || 'Could not fetch data.'}</span></div>`;
    }
}

// ==================== DEMO TRADING ====================

async function loadDemoTradingModule() {
    const moduleEl = document.getElementById("demo-trading-module");
    const el = document.getElementById("demo-trading-content");
    if (!emailUser) {
        moduleEl.style.display = "none";
        return;
    }
    moduleEl.style.display = "block";
    try {
        const data = await fetchJSON(`/demo/account/${encodeURIComponent(emailUser.email)}`);
        if (!data) throw new Error("No data");

        const returnColor = data.total_return_pct >= 0 ? "#00a550" : "#ff4444";
        const returnSign = data.total_return_pct >= 0 ? "+" : "";

        // Fetch equity history for sparkline
        const equityHistory = await fetchJSON(`/equity-history/${encodeURIComponent(emailUser.email)}`);
        const sparkline = equityHistory
            ? renderSparkline(equityHistory.points, equityHistory.daily_start_equity, equityHistory.daily_loss_limit_pct, 140, 36)
            : "";

        let html = `
            <p style="font-size:0.78rem;color:#f59e0b;margin-bottom:1rem;">
                🧪 SIMULATED — no real funds. Practice here, then connect a real Bitget account when ready.
            </p>
            <div class="metric highlight">
                <span class="label">Total Equity</span>
                <span class="value">$${data.total_equity_usd.toLocaleString()} 
                    <span style="color:${returnColor};font-size:0.8rem;">${returnSign}${data.total_return_pct}%</span>
                </span>
            </div>
            <div class="metric">
                <span class="label">Cash (USDT)</span>
                <span class="value">$${data.cash_usdt.toLocaleString()}</span>
            </div>
        `;

        if (sparkline) {
            html += `<div class="sparkline-panel">${sparkline}<span class="settings-hint">Today's equity curve</span></div>`;
        }

        Object.entries(data.positions).forEach(([coin, pos]) => {
            const pnlColor = pos.pnl_usd >= 0 ? "#00a550" : "#ff4444";
            const pnlSign = pos.pnl_usd >= 0 ? "+" : "";
            html += `
                <div class="metric">
                    <span class="label">${coin} — ${pos.amount.toFixed(5)}</span>
                    <span class="value">$${pos.value_usd.toLocaleString()} 
                        <span style="color:${pnlColor};font-size:0.78rem;">${pnlSign}$${pos.pnl_usd} (${pnlSign}${pos.pnl_pct}%)</span>
                    </span>
                </div>
            `;
        });

        html += `
            <div class="demo-trade-form">
                <select id="demo-coin"><option value="BTC">BTC</option><option value="ETH">ETH</option><option value="SOL">SOL</option></select>
                <input type="number" id="demo-amount" placeholder="Amount USD" min="1" step="1">
                <button onclick="placeDemoTrade('buy')" style="background:#00a550;">Buy</button>
                <button onclick="placeDemoTrade('sell')" style="background:#ff4444;">Sell</button>
                <button onclick="resetDemoAccount()" style="background:transparent;border:1px solid #4a6fa5;">Reset Demo</button>
            </div>
        `;

        if (data.trade_log.length) {
            html += `<p style="margin-top:1rem;font-size:0.8rem;color:#4a6fa5;font-weight:600;">Recent Trades:</p>`;
            data.trade_log.slice().reverse().slice(0, 5).forEach(t => {
                html += `<div style="font-size:0.75rem;color:#90a8c8;padding:0.2rem 0;">${t.side.toUpperCase()} ${t.coin} @ $${t.price.toLocaleString()} ($${t.amount_usd})</div>`;
            });
        }

        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load demo account.</div>`;
    }
}

async function placeDemoTrade(side) {
    const coin = document.getElementById("demo-coin").value;
    const amount = parseFloat(document.getElementById("demo-amount").value);
    if (!amount || amount <= 0) { alert("Enter a valid amount."); return; }
    try {
        const res = await fetch(`${API_BASE}/demo/trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailUser.email, coin, side, amount_usd: amount }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Trade failed");
        document.getElementById("demo-amount").value = "";
        loadDemoTradingModule();
    } catch (e) {
        alert(e.message);
    }
}

async function resetDemoAccount() {
    if (!confirm("Reset your demo account back to $10,000?")) return;
    await fetch(`${API_BASE}/demo/reset/${encodeURIComponent(emailUser.email)}`, { method: "POST" });
    loadDemoTradingModule();
}

// ==================== ONE-CLICK EXECUTE ====================

async function oneClickExecute(coin, side) {
    if (!emailUser) return;
    try {
        const settings = await fetchJSON(`/settings/${encodeURIComponent(emailUser.email)}`);
        const tradeSize = settings?.default_trade_size_usd || 250;
        const res = await fetch(`${API_BASE}/demo/trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailUser.email, coin, side, amount_usd: tradeSize }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Trade failed");
        showToast(`✅ ${side === 'buy' ? 'Bought' : 'Sold'} $${tradeSize} ${coin} @ $${data.executed_price.toLocaleString()} (demo)`);
        loadDemoTradingModule();
    } catch (e) {
        showToast(`❌ ${e.message}`, true);
    }
}

// ==================== SETTINGS ====================

async function loadSettingsModule() {
    const moduleEl = document.getElementById("settings-module");
    const el = document.getElementById("settings-content");
    if (!emailUser) {
        moduleEl.style.display = "none";
        return;
    }
    moduleEl.style.display = "block";
    try {
        const [s, risk, equityHistory] = await Promise.all([
            fetchJSON(`/settings/${encodeURIComponent(emailUser.email)}`),
            fetchJSON(`/risk-status/${encodeURIComponent(emailUser.email)}`),
            fetchJSON(`/equity-history/${encodeURIComponent(emailUser.email)}`),
        ]);
        if (!s || !risk) throw new Error("No data");

        const statusLabel = risk.kill_switch_active ? "Halted — Kill Switch Active"
            : risk.auto_trade_halted_reason ? "Halted"
            : risk.auto_trade_enabled ? "Active"
            : "Disabled";
        const statusClass = risk.kill_switch_active || risk.auto_trade_halted_reason ? "status-halted"
            : risk.auto_trade_enabled ? "status-active" : "status-disabled";

        const sparkline = equityHistory
            ? renderSparkline(equityHistory.points, equityHistory.daily_start_equity, equityHistory.daily_loss_limit_pct)
            : "";

        el.innerHTML = `
            <div class="metric">
                <span class="label">Auto-Trade Status</span>
                <span class="value"><span class="status-badge ${statusClass}">${statusLabel}</span></span>
            </div>
            ${risk.auto_trade_halted_reason ? `<p class="risk-warning">${risk.auto_trade_halted_reason}</p>` : ''}

            <div class="metric">
                <span class="label">Default Trade Size (USD)</span>
                <span class="value">
                    <input type="number" id="settings-trade-size" value="${s.default_trade_size_usd}"
                        min="${s.min_trade_size_usd}" max="${s.max_trade_size_usd}" step="10" class="settings-input">
                </span>
            </div>
            <p class="settings-hint">Platform range: $${s.min_trade_size_usd} \u2013 $${s.max_trade_size_usd}</p>

            <div class="metric">
                <span class="label">Daily P&amp;L</span>
                <span class="value sparkline-row">
                    <span style="color:${risk.daily_pnl_pct >= 0 ? '#00a550' : '#ff4444'}">${risk.daily_pnl_pct >= 0 ? '+' : ''}${risk.daily_pnl_pct}%</span>
                    <span class="sparkline-wrap">${sparkline}</span>
                </span>
            </div>
            <p class="settings-hint">Dashed line marks the ${risk.daily_loss_limit_pct}% daily loss limit</p>

            <div class="metric">
                <span class="label">Max Position Cap</span>
                <span class="value">${risk.max_position_pct}% per asset</span>
            </div>

            <div class="metric">
                <span class="label">Auto-Trading</span>
                <span class="value">
                    <button id="auto-trade-toggle" class="toggle-btn ${risk.auto_trade_enabled ? 'on' : 'off'}"
                        onclick="${risk.auto_trade_enabled ? 'disableAutoTrade()' : 'openAutoTradeConfirm()'}">
                        ${risk.auto_trade_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                </span>
            </div>

            <button onclick="saveSettings()" class="settings-save-btn">Save Trade Size</button>
            <button class="kill-switch-btn" onclick="${risk.kill_switch_active ? 'resetKillSwitch()' : 'confirmKillSwitch()'}">
                ${risk.kill_switch_active ? 'Reset Kill Switch' : 'Emergency Stop'}
            </button>
        `;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load settings.</div>`;
    }
}

async function saveSettings() {
    const size = parseFloat(document.getElementById("settings-trade-size").value);
    try {
        const res = await fetch(`${API_BASE}/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailUser.email, default_trade_size_usd: size }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Could not save settings");
        showToast("Settings saved");
    } catch (e) {
        showToast(e.message, true);
    }
}

// ==================== AUTO-TRADE CONTROLS ====================

function openAutoTradeConfirm() {
    document.getElementById("risk-ack-checkbox").checked = false;
    document.getElementById("confirm-autotrade-btn").disabled = true;
    document.getElementById("auto-trade-confirm-modal").style.display = "flex";
}

function closeAutoTradeConfirm() {
    document.getElementById("auto-trade-confirm-modal").style.display = "none";
}

document.getElementById("risk-ack-checkbox").addEventListener("change", (e) => {
    document.getElementById("confirm-autotrade-btn").disabled = !e.target.checked;
});

async function confirmEnableAutoTrade() {
    try {
        const res = await fetch(`${API_BASE}/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: emailUser.email,
                auto_trade_enabled: true,
                confirm_risk_acknowledged: true,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Could not enable auto-trading");
        closeAutoTradeConfirm();
        showToast("Auto-trading enabled");
        loadSettingsModule();
    } catch (e) {
        showToast(e.message, true);
    }
}

async function disableAutoTrade() {
    try {
        const res = await fetch(`${API_BASE}/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailUser.email, auto_trade_enabled: false }),
        });
        if (!res.ok) throw new Error("Could not disable auto-trading");
        showToast("Auto-trading disabled");
        loadSettingsModule();
    } catch (e) {
        showToast(e.message, true);
    }
}

// ==================== KILL SWITCH ====================

function confirmKillSwitch() {
    if (!confirm("This immediately halts auto-trading and locks it until manually reset. Continue?")) return;
    triggerKillSwitch();
}

async function triggerKillSwitch() {
    try {
        const res = await fetch(`${API_BASE}/kill-switch/${encodeURIComponent(emailUser.email)}`, { method: "POST" });
        if (!res.ok) throw new Error("Could not activate kill switch");
        showToast("Kill switch activated — auto-trading halted");
        loadSettingsModule();
    } catch (e) {
        showToast(e.message, true);
    }
}

async function resetKillSwitch() {
    try {
        const res = await fetch(`${API_BASE}/kill-switch/${encodeURIComponent(emailUser.email)}/reset`, { method: "POST" });
        if (!res.ok) throw new Error("Could not reset kill switch");
        showToast("Kill switch reset");
        loadSettingsModule();
    } catch (e) {
        showToast(e.message, true);
    }
}

// ==================== SPARKLINE ====================

function renderSparkline(points, dailyStartEquity, lossLimitPct, width = 100, height = 32) {
    if (!points || points.length < 2) {
        return `<svg width="${width}" height="${height}"></svg>`;
    }
    const values = points.map(p => p.equity);
    const lossLimitValue = dailyStartEquity * (1 - lossLimitPct / 100);
    const allValues = [...values, lossLimitValue, dailyStartEquity];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    const scaleX = (i) => (i / (points.length - 1)) * width;
    const scaleY = (v) => height - ((v - min) / range) * height;

    const pathPoints = values.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(" ");
    const lossLimitY = scaleY(lossLimitValue);
    const lastValue = values[values.length - 1];
    const lineColor = lastValue >= dailyStartEquity ? "#00a550" : "#ff4444";

    return `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <line x1="0" y1="${lossLimitY}" x2="${width}" y2="${lossLimitY}"
                stroke="#ff4444" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.6" />
            <polyline points="${pathPoints}" fill="none" stroke="${lineColor}" stroke-width="1.5" />
            <circle cx="${scaleX(values.length - 1)}" cy="${scaleY(lastValue)}" r="2" fill="${lineColor}" />
        </svg>
    `;
}

// ==================== LOAD ALL ====================

async function loadAllData() {
    await Promise.all([
        loadTickerBar(),
        loadRegimePanel(),
        loadLivePrices(),
        loadDCAModule(),
        loadLiquidationModule(),
        loadFundingModule(),
        loadTrending(),
        loadEntryExitModule(),
        loadPortfolioViewer(),
        loadRebalancerModule(),
        loadDemoTradingModule(),
        loadSettingsModule(),
    ]);
}

// ==================== INIT ====================

window.addEventListener("DOMContentLoaded", () => {
    const savedCreds = localStorage.getItem("bitget_creds");
    const savedEmail = localStorage.getItem("email_user");
    if (savedCreds) {
        userCredentials = JSON.parse(savedCreds);
        showConnectedState();
    } else if (savedEmail) {
        emailUser = JSON.parse(savedEmail);
        showConnectedState();
    }

    // Magic link verification — if the user arrived via an emailed sign-in link
    const urlParams = new URLSearchParams(window.location.search);
    const magicToken = urlParams.get("magic_token");
    if (magicToken) {
        fetch(`${API_BASE}/auth/magic-link/verify/${magicToken}`)
            .then(res => res.json())
            .then(data => {
                if (data.email) {
                    emailUser = { email: data.email, walletAddress: null };
                    localStorage.setItem("email_user", JSON.stringify(emailUser));
                    showConnectedState();
                    window.history.replaceState({}, "", window.location.pathname);
                    loadAllData();
                }
            })
            .catch(err => console.error("Magic link verification failed:", err));
    }

    loadAllData();
});

setInterval(loadAllData, 30000);
