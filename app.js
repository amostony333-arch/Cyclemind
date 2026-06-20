// CycleMind Frontend Logic
const API_BASE = "https://cyclemind-production.up.railway.app/api";

let userCredentials = null;

function showLoginModal() {
    document.getElementById("login-modal").style.display = "flex";
}

function closeLoginModal() {
    document.getElementById("login-modal").style.display = "none";
}

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

function showConnectedState() {
    document.getElementById("login-btn").style.display = "none";
    document.getElementById("connected-badge").style.display = "inline";
}

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

// ---------- Ticker Bar ----------
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
        bar.innerHTML = `<span>${parts.join(" | ")}</span>`;
    } catch (e) {
        bar.innerHTML = `<span>Scanning markets...</span>`;
    }
}

// ---------- Market Regime Detection ----------
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

// ---------- Live Prices ----------
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

// ---------- Signal-Based DCA ----------
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

// ---------- Liquidation Heatmap ----------
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

// ---------- Funding Rate Capture ----------
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

// ---------- Trending ----------
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

// ---------- Portfolio Viewer ----------
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

// ---------- Portfolio Rebalancer ----------
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

// ---------- Load All ----------
async function loadAllData() {
    await Promise.all([
        loadTickerBar(),
        loadRegimePanel(),
        loadLivePrices(),
        loadDCAModule(),
        loadLiquidationModule(),
        loadFundingModule(),
        loadTrending(),
        loadPortfolioViewer(),
        loadRebalancerModule(),
    ]);
}

window.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("bitget_creds");
    if (saved) {
        userCredentials = JSON.parse(saved);
        showConnectedState();
    }
    loadAllData();
});

setInterval(loadAllData, 30000);
