import { data, state } from "./org-state.js";
import { fmt, esc, statusBadgeClass } from "./org-utils.js";
import { renderShell } from "./org-shell.js";

function renderDashboard() {
  const portfolioCounts = {
    Active: data.portfolio.filter((item) => item.status === "Active").length,
    Matched: data.portfolio.filter((item) => item.status === "Matched").length,
    Fulfilled: data.portfolio.filter((item) => item.status === "Fulfilled").length,
  };

  const dashboardMetrics = data.dashboardMetrics || {};
  const metricCards = [
    { label: "TOTAL DONATED", value: dashboardMetrics.totalDonated != null ? `₦${fmt(dashboardMetrics.totalDonated)}` : "₦0", note: "Live funding", accent: "border-teal-400" },
    { label: "NEEDS FUNDED", value: dashboardMetrics.needsFunded != null ? dashboardMetrics.needsFunded : "0", note: "Active support", accent: "border-sky-400" },
    { label: "CHILDREN REACHED", value: dashboardMetrics.childrenReached != null ? dashboardMetrics.childrenReached : "0", note: "Impact tracked", accent: "border-amber-400" },
    { label: "FULFILLMENT RATE", value: dashboardMetrics.fulfillmentRate != null ? `${dashboardMetrics.fulfillmentRate}%` : "0%", note: "Operational health", accent: "border-emerald-400" },
  ];

  const spendByCategory = dashboardMetrics.spendByCategory || data.spendByCategory;
  const spendByCategoryTotal = spendByCategory.reduce((sum, item) => {
    const amount = Number(String(item.amount).replace(/[^0-9.-]/g, "")) || 0;
    return sum + amount;
  }, 0);
  const spendTotalLabel = spendByCategory.length ? `Total ₦${fmt(spendByCategoryTotal)}` : "Total ₦0";

  const recentActivity = dashboardMetrics.recentActivity || data.recentActivity;

  const content = `
    <div class="space-y-8">
      <div class="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-6 text-white shadow-lg">
        <div class="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div class="max-w-xl">
            <p class="text-xs text-teal-200 uppercase tracking-widest mb-2">Portfolio health</p>
            <h1 class="text-3xl font-bold">${esc(data.orgName)} Impact Dashboard</h1>
            <p class="mt-2 text-sm text-slate-200 leading-relaxed">Prioritize funding, monitor commitments, and confirm delivery progress — one clean workspace built for CSR operators.</p>
          </div>
          <div class="grid sm:grid-cols-2 gap-3 min-w-[280px]">
            <div class="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-3">
              <p class="text-xs uppercase tracking-widest text-teal-200">Live pipeline</p>
              <p class="mt-2 text-2xl font-bold">${portfolioCounts.Active + portfolioCounts.Matched} active</p>
            </div>
            <div class="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-3">
              <p class="text-xs uppercase tracking-widest text-teal-200">Wallet balance</p>
              <p class="mt-2 text-xl font-bold">₦${fmt(state.walletBalance)}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${metricCards.map((item) => `
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 border-t-4 ${item.accent}">
            <p class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2">${item.label}</p>
            <p class="text-3xl font-bold text-gray-900">${item.value}</p>
            <p class="text-sm text-gray-500 mt-1">${item.note}</p>
          </div>
        `).join("")}
      </div>
      <div class="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <p class="text-sm text-gray-500">Spend by category</p>
              <h2 class="text-xl font-bold text-gray-900">Funding distribution</h2>
            </div>
            <span class="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">${spendTotalLabel}</span>
          </div>
          <div class="space-y-4">
            ${spendByCategory.map((item) => `
              <div>
                <div class="flex items-center justify-between mb-1.5 text-sm">
                  <span class="font-semibold text-gray-900">${esc(item.label)}</span>
                  <span class="text-gray-500">${esc(item.amount)} · <span class="font-bold text-gray-900">${item.percent}%</span></span>
                </div>
                <div class="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div class="h-full ${item.color} rounded-full transition-all duration-500" style="width:${item.percent}%"></div>
                </div>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-sm text-gray-500">What just happened</p>
              <h2 class="text-xl font-bold text-gray-900">Recent Activity</h2>
            </div>
            <span class="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-bold">● Live</span>
          </div>
          <div class="space-y-3">
            ${recentActivity.map((activity) => `
              <div class="flex gap-3 items-start rounded-xl bg-gray-50 p-3.5">
                <span class="text-xl flex-shrink-0">${activity.icon}</span>
                <div>
                  <p class="text-sm font-semibold text-gray-900">${esc(activity.title)}</p>
                  <p class="text-xs text-gray-500 mt-0.5">${esc(activity.detail)}</p>
                  <p class="text-[11px] text-gray-400 mt-1.5">${esc(activity.time)}</p>
                </div>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
      <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <p class="text-sm text-gray-500">Active portfolio</p>
            <h2 class="text-xl font-bold text-gray-900">Current Funding Commitments</h2>
          </div>
          <div class="flex flex-wrap gap-2">
            <span class="px-3 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-sm font-bold">${portfolioCounts.Active} Active</span>
            <span class="px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-sm font-bold">${portfolioCounts.Matched} Matched</span>
            <span class="px-3 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-sm font-bold">${portfolioCounts.Fulfilled} Fulfilled</span>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px]">
            <thead>
              <tr class="border-b border-gray-200">
                ${["Facility","Category","Amount","Status","Actions"].map((header) => `<th class="text-left py-3 px-4 text-xs font-bold uppercase tracking-widest text-gray-400">${header}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${data.portfolio.map((item) => `
                <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td class="py-4 px-4 font-semibold text-gray-900 text-sm">${esc(item.facility)}</td>
                  <td class="py-4 px-4"><span class="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">${esc(item.category)}</span></td>
                  <td class="py-4 px-4 font-bold text-gray-900 text-sm">₦${fmt(item.amount)}</td>
                  <td class="py-4 px-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${statusBadgeClass[item.status] || "bg-gray-100 text-gray-600"}">${esc(item.status)}</span></td>
                  <td class="py-4 px-4">
                    <div class="flex gap-2">
                      <a href="#/org/needs" class="px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-bold hover:bg-sky-100 border border-sky-200">View needs</a>
                      <a href="#/org/needs" class="px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold hover:bg-teal-100 border border-teal-200">Fund</a>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
  return renderShell("dashboard", content, "", state, data);
}

export { renderDashboard };