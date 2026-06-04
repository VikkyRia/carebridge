import { data, state } from "./org-state.js";
import { fmt, esc } from "./org-utils.js";
import { renderShell } from "./org-shell.js";

function renderFundWalletModal() {
  return `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" id="org-fund-modal" onclick="if(event.target===this)ORG._hideFundWallet()">
      <div class="bg-white rounded-2xl max-w-lg w-full p-8 relative shadow-2xl">
        <button onclick="ORG._hideFundWallet()" class="absolute top-5 right-5 text-gray-400 hover:text-gray-700 rounded-lg p-1 hover:bg-gray-100">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <h2 class="text-2xl font-bold text-gray-900 mb-1">Fund Wallet</h2>
        <p class="text-gray-500 text-sm mb-6">Add funds to your ${esc(data.orgName)} wallet</p>
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">Select amount</label>
            <div class="grid grid-cols-2 gap-2 mb-3">
              ${[50000,100000,500000,1000000].map((amount) => `
                <button onclick="ORG._selectWalletAmt(${amount})" data-wallet-amt="${amount}" class="wallet-preset-btn py-3.5 rounded-xl border-2 font-bold text-sm transition-colors border-gray-200 text-gray-700 hover:border-teal-400">₦${fmt(amount)}</button>
              `).join("")}
            </div>
            <div class="relative">
              <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₦</span>
              <input type="number" id="org-wallet-input" placeholder="Enter custom amount" oninput="ORG._updateWalletSummary()" class="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
            </div>
            <p class="text-xs text-gray-400 mt-1.5">Minimum: ₦10,000</p>
          </div>
          <div id="org-wallet-summary" class="hidden bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-200"></div>
          <div class="flex gap-3">
            <button onclick="ORG._hideFundWallet()" class="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold">Cancel</button>
            <button onclick="ORG._submitFundWallet()" class="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm">Fund Wallet</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderFinances() {
  const metrics = data.dashboardMetrics || {};
  const deployed = metrics.totalDonated || 0;
  const budget = (state.currentUser && state.currentUser.monthly_budget) ? Number(state.currentUser.monthly_budget) : 0;
  const rate = budget > 0 ? Math.min(100, Math.round((deployed / budget) * 100)) : 0;

  const content = `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Finances</h1>
        <p class="text-gray-500 mt-1">Manage your organisation wallet, track transactions, and download reports.</p>
      </div>
      <div class="grid xl:grid-cols-[2fr_1fr] gap-6">
        <div class="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-8 text-white shadow-lg">
          <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-5 h-5 text-teal-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                <p class="text-teal-100 text-sm font-medium">Wallet Balance</p>
              </div>
              <h2 class="text-5xl font-bold">₦${fmt(state.walletBalance)}</h2>
            </div>
            <button onclick="ORG._showFundWallet()" class="px-5 py-2.5 bg-white text-teal-700 rounded-xl hover:bg-teal-50 font-bold shadow-sm transition-colors">Fund Wallet</button>
          </div>
          <div class="grid sm:grid-cols-3 gap-4 pt-5 border-t border-teal-500">
            <div><p class="text-teal-100 text-xs mb-1">Total Deployed</p><p class="text-2xl font-bold">₦${fmt(deployed)}</p></div>
            <div><p class="text-teal-100 text-xs mb-1">Monthly Budget</p><p class="text-2xl font-bold">${budget > 0 ? `₦${fmt(budget)}` : "Not set"}</p></div>
            <div><p class="text-teal-100 text-xs mb-1">Deployment Rate</p><p class="text-2xl font-bold">${budget > 0 ? `${rate}%` : "—"}</p></div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 class="font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div class="space-y-3">
            <button onclick="ORG._showFundWallet()" class="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center gap-2 px-4 shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg> Fund Wallet
            </button>
            <button class="w-full py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium flex items-center gap-2 px-4">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export Statement
            </button>
            <button class="w-full py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium flex items-center gap-2 px-4">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Download ESG Report
            </button>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 class="text-xl font-bold text-gray-900">Recent Transactions</h2>
            <p class="text-sm text-gray-500">${data.transactions.length} transactions this period</p>
          </div>
          <button class="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export CSV
          </button>
        </div>
        <div class="space-y-1">
          ${data.transactions.map((transaction, index) => `
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl hover:bg-gray-50 transition-colors ${index < data.transactions.length - 1 ? "border-b border-gray-100" : ""}">
              <div class="flex items-center gap-4">
                <div class="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${transaction.type === "credit" ? "bg-emerald-100" : "bg-red-50"}">
                  ${transaction.type === "credit"
                    ? `<svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`
                    : `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/></svg>`}
                </div>
                <div>
                  <p class="font-semibold text-gray-900">${esc(transaction.description)}</p>
                  <p class="text-xs text-gray-500 mt-0.5">${esc(transaction.date)} at ${esc(transaction.time)}${transaction.facility ? ` · ${esc(transaction.facility)}` : ""}</p>
                </div>
              </div>
              <p class="text-lg font-bold ${transaction.type === "credit" ? "text-emerald-600" : "text-red-600"} sm:text-right">${transaction.type === "credit" ? "+" : ""}₦${fmt(Math.abs(transaction.amount))}</p>
            </div>
          `).join("")}
        </div>
        <div class="text-center mt-5 pt-4 border-t border-gray-100">
          <button class="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm">Load more transactions</button>
        </div>
      </div>
    </div>`;

  return renderShell("finances", content, state.showFundWalletModal ? renderFundWalletModal() : "", state, data);
}

export { renderFinances, renderFundWalletModal };