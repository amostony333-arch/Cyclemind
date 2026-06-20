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

async function fetchFundingRate(symbol) { return fetchJSON(`/funding-rate/${symbol}`); }
async function fetchOpenInterest(symbol) { return fetchJSON(`/open-interest/${symbol}`); }
async function fetchFearGreed() { return fetchJSON(`/fear-greed`); }
async function fetchRegime(symbol) { return fetchJSON(`/regime/${symbol}`); }
async function fetchRegimeOverview() { return fetchJSON(`/regime-overview`); }

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
        el.innerHTML = `
            <div class="metric"><span class="label">Fear &amp; Greed Index</span><span class="value">${fgValue} (${fgLabel})</span></div>
            <div class="metric"><span class="label">Base DCA Amount</span><span class="value">$${baseAmount}</span></div>
            <div class="metric highlight"><span class="label">Suggested Buy (${multiplier}x)</span><span class="value">$${suggestedAmount}</span></div>
        `;
    } catch (e) {
        el.innerHTML = `<div class="metric">Unable to load DCA signal.</div>`;
    }
}

async function loadLiquidationModule() {
    const el = document.getElementById("liquidation-content");
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    let html = "";
    for (const symbol of symbols) {
        const oi = await fetchOpenInterest(symbol);
        const oiAmount = oi?.data?.openInterestList?.[0]?.size || oi?.data?.[0]?.amount || "N/A";
        html += `<div class="metric"><span class="label">${symbol.replace("USDT", "")} Open Interest</span><span class="value">${oiAmount}</span></div>`;
    }
    el.innerHTML = html || `<div class="metric">No open interest data available.</div>`;
}

async function loadFundingModule() {
    const el = document.getElementById("funding-content");
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    let html = "";
    for (const symbol of symbols) {
        const current = await fetchFundingRate(symbol);
        const rateStr = current?.data?.[0]?.fundingRate;
        const rateNum = rateStr ? parseFloat(rateStr) : null;
        if (rateNum === null) {
            html += `<div class="metric"><span class="label">${symbol.replace("USDT", "")} Funding Rate</span><span class="value">N/A</span></div>`;
            continue;
        }
        const isExtreme = Math.abs(rateNum) > 0.0005;
        html += `<div class="metric ${isExtreme ? 'highlight' : ''}"><span class="label">${symbol.replace("USDT", "")} Funding Rate</span><span class="value">${(rateNum * 100).toFixed(4)}%</span>${isExtreme ? '<span class="badge">EXTREME</span>' : ''}</div>`;
    }
    el.innerHTML = html;
}

async function loadRebalancerModule() {
    const el = document.getElementById("rebalancer-content");
    if (!userCredentials) {
        el.innerHTML = `<div class="metric"><span class="label">Status</span><span class="value">Not Connected</span></div><p style="margin-top:0.8rem;font-size:0.8rem;color:#888;">Connect your Bitget account to view live balances and rebalancing suggestions.</p>`;
        return;
    }
    el.innerHTML = `<div class="loading">Fetching live portfolio data...</div>`;
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
        let html = `<div class="metric"><span class="label">Total Portfolio Value</span><span class="value">$${data.total_value_usd.toLocaleString()}</span></div><div class="metric"><span class="label">Risk Profile</span><span class="value">${data.risk_profile}</span></div>`;
        if (data.rebalance_plan.length === 0) {
            html += `<p style="margin-top:0.8rem;font-size:0.8rem;color:#4ade80;">Portfolio is within target allocation — no rebalancing needed.</p>`;
        } else {
            for (const item of data.rebalance_plan) {
                html += `<div class="metric"><span class="label">${item.action.toUpperCase()} ${item.asset}</span><span class="value">$${item.amount_usd.toLocaleString()} (${item.current_pct}% → ${item.target_pct}%)</span></div>`;
            }
        }
        el.innerHTML = html;
    } catch (error) {
        el.innerHTML = `<div class="metric"><span class="label">Status</span><span class="value" style="color:#ff4444;">Error</span></div><p style="margin-top:0.8rem;font-size:0.8rem;color:#888;">${error.message || 'Could not fetch portfolio data.'}</p>`;
    }
}

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
        bar.innerHTML = `<span>Live regime data unavailable.</span>`;
    }
}

async function loadRegimePanel() {
    const el = document.getElementById("regime-content");
    if (!el) return;
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    let html = "";
    for (const symbol of symbols) {
        const r = await fetchRegime(symbol);
        if (!r || r.error) {
            html += `<div class="metric"><span class="label">${symbol.replace("USDT","")}</span><span class="value">N/A</span></div>`;
            continue;
        }
        const regimeLabel = r.regime.replace(/_/g, " ");
        const cascadeWarning = r.liquidation_context?.cascade_risk_warning;
        html += `<div class="metric ${r.meets_threshold ? 'highlight' : ''}"><span class="label">${symbol.replace("USDT","")} — ${regimeLabel}</span><span class="value">${r.confidence}% / ${r.threshold}%</span>${r.meets_threshold ? '<span class="badge">ACTIONABLE</span>' : ''}${cascadeWarning ? '<span class="badge" style="background:#facc15;">CASCADE RISK</span>' : ''}</div>`;
    }
    el.innerHTML = html;
}

async function loadLivePrices() {
    const el = document.getElementById("prices-content");
    try {
        const res = await fetch(`${API_BASE}/prices`);
        const data = await res.json();
        el.innerHTML = `
            <div class="metric"><span class="label">BTC</span><span class="value">$${data.bitcoin.usd.toLocaleString()} <span style="color:${data.bitcoin.usd_24h_change > 0 ? '#4ade80' : '#ff4444'}">${data.bitcoin.usd_24h_change.toFixed(2)}%</span></span></div>
            <div class="metric"><span class="label">ETH</span><span class="value">$${data.ethereum.usd.toLocaleString()} <span style="color:${data.ethereum.usd_24h_change > 0 ? '#4ade80' : '#ff4444'}">${data.ethereum.usd_24h_change.toFixed(2)}%</span></span></div>
            <div class="metric"><span class="label">SOL</span><span class="value">$${data.solana.usd.toLocaleString()} <span style="color:${data.solana.usd_24h_change > 0 ? '#4ade80' : '#ff4444'}">${data.solana.usd_24h_change.toFixed(2)}%</span></span></div>
        `;
    } catch(e) {
        el.innerHTML = `<div class="metric">Unable to load prices.</div>`;
    }
}

async function loadTrending() {
    const el = document.getElementById("trending-content");
    try {
        const res = await fetch(`${API_BASE}/trending`);
        const data = await res.json();
        let html = "";
        data.coins.slice(0, 6).forEach((item, i) => {
            const coin = item.item;
            const changeColor = coin.change_24h >= 0 ? '#00a550' : '#ff4444';
            const changeSign = coin.change_24h >= 0 ? '+' : '';
            html += `
                <div class="metric">
                    <span class="label">#${i+1} ${coin.name}</span>
                    <span class="value">$${coin.price.toLocaleString()} <span style="color:${changeColor}">${changeSign}${coin.change_24h}%</span></span>
                </div>
            `;
        });
        el.innerHTML = html;
    } catch(e) {
        el.innerHTML = `<div class="metric">Unable to load trending data.</div>`;
    }
};
    }
}

async function loadPortfolioViewer() {
    const el = document.getElementById("portfolio-content");
    if (!userCredentials) {
        el.innerHTML = `<div class="metric"><span class="label">Status</span><span class="value">Not Connected</span></div><p style="margin-top:0.8rem;font-size:0.8rem;color:#888;">Connect your Bitget account to view your portfolio.</p>`;
        return;
    }
    el.innerHTML = `<div class="loading">Fetching portfolio...</div>`;
    try {
        const res = await fetch(`${API_BASE}/account/spot-balance`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                api_key: userCredentials.api_key,
                api_secret: userCredentials.api_secret,
                passphrase: userCredentials.passphrase,
            }),
        });
        const data = await res.json();
        const assets = (data.data || []).filter(a => parseFloat(a.available) + parseFloat(a.frozen) > 0);
        if (!assets.length) {
            el.innerHTML = `<div class="metric"><span class="label">No assets found.</span></div>`;
            return;
        }
        let html = "";
        assets.forEach(a => {
            const total = (parseFloat(a.available) + parseFloat(a.frozen)).toFixed(4);
            html += `<div class="metric"><span class="label">${a.coin}</span><span class="value">${total}</span></div>`;
        });
        const overview = await fetchRegimeOverview();
        html += `<p style="margin-top:1rem;font-size:0.8rem;color:#888;">AI Suggestions based on current regime:</p>`;
        ["BTCUSDT","ETHUSDT","SOLUSDT"].forEach(sym => {
            const r = overview?.[sym];
            if (!r || r.error) return;
            const coin = sym.replace("USDT","");
            let suggestion = "Hold — wait for clearer signal";
            if (r.meets_threshold) {
                suggestion = r.regime.includes("downtrend") ? `⚠️ Reduce ${coin} exposure` : `✅ Consider adding ${coin}`;
            }
            html += `<div class="metric"><span class="label">${coin}</span><span class="value">${suggestion}</span></div>`;
        });
        el.innerHTML = html;
    } catch(e) {
        el.innerHTML = `<div class="metric" style="color:#ff4444;">Error loading portfolio.</div>`;
    }
}

async function loadAllData() {
    await Promise.all([
        loadRegimePanel(),
        loadDCAModule(),
        loadLiquidationModule(),
        loadFundingModule(),
        loadRebalancerModule(),
        loadTickerBar(),
        loadLivePrices(),
        loadTrending(),
        loadPortfolioViewer(),
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
