import { data } from "./org-state.js";
import { fmt, esc, verifiedBadge, urgencyBadge, categoryColors, categoryIcons } from "./org-utils.js";

function renderPortfolioCard(item) {
  return `
    <article class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div class="bg-gradient-to-br ${categoryColors[item.category] || "from-gray-400 to-gray-500"} h-24 flex items-center justify-center relative">
        <span class="text-5xl">${categoryIcons[item.category] || "📦"}</span>
        ${(item.portfolioStatus || item.status) === "Active"
          ? `<div class="absolute top-3 right-3"><span class="px-2.5 py-1 bg-teal-500 text-white text-xs font-bold rounded-full shadow">Active</span></div>`
          : `<div class="absolute top-3 right-3"><span class="px-2.5 py-1 bg-white/90 text-gray-700 text-xs font-bold rounded-full shadow">${esc(item.portfolioStatus || item.status)}</span></div>`}
      </div>
      <div class="p-5 space-y-3">
        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <h3 class="font-bold text-gray-900 truncate">${esc(item.orphanageName)}</h3>
            ${item.verified ? verifiedBadge("w-4 h-4", "text-teal-600") : ""}
          </div>
          <p class="text-xs text-gray-500">${esc(item.location)}</p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span class="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">${esc(item.category)}</span>
          ${urgencyBadge(item.urgency)}
        </div>
        <p class="text-sm text-gray-600 line-clamp-2">${esc(item.description)}</p>
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-gray-50 rounded-lg p-2.5 text-center">
            <p class="text-xs text-gray-500">Tracked</p>
            <p class="font-bold text-gray-900 text-sm">₦${fmt(item.portfolioAmount || item.cashEquivalent)}</p>
          </div>
          <div class="bg-gray-50 rounded-lg p-2.5 text-center">
            <p class="text-xs text-gray-500">Children</p>
            <p class="font-bold text-gray-900 text-sm">${item.childrenImpacted}</p>
          </div>
        </div>
        <div class="flex gap-2 pt-1">
          <a href="#/org/needs" onclick="ORG._setFilter('category','${item.category}')" class="flex-1 py-2 text-center text-sm font-semibold bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50">View Needs</a>
          <a href="#/org/needs" onclick="ORG._setFilter('category','${item.category}')" class="flex-1 py-2 text-center text-sm font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700">Fund</a>
        </div>
      </div>
    </article>`;
}

function renderDiscoveryCard(need) {
  const fundedTx = data.transactions.filter((t) => t.type === "debit" && t.facility === need.orphanageName);
  const fundedTotal = fundedTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const fundedPct = need.cashEquivalent > 0 && fundedTotal > 0 ? Math.min(100, Math.round((fundedTotal / need.cashEquivalent) * 100)) : 0;

  return `
    <article class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow hover:border-teal-200">
      <div class="bg-gradient-to-br ${categoryColors[need.category] || "from-gray-400 to-gray-500"} h-24 flex items-center justify-center relative">
        <span class="text-5xl">${categoryIcons[need.category] || "📦"}</span>
        ${need.urgency === "critical" ? `<div class="absolute top-3 right-3"><span class="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow">CRITICAL</span></div>` : ""}
      </div>
      <div class="p-5 space-y-3">
        <div>
          <div class="flex items-center gap-1.5 mb-0.5">
            <h3 class="font-bold text-gray-900 truncate">${esc(need.orphanageName)}</h3>
            ${need.verified ? verifiedBadge("w-4 h-4", "text-teal-600") : ""}
          </div>
          <p class="text-xs text-gray-500">${esc(need.location)}</p>
        </div>
        <p class="text-sm text-gray-600 line-clamp-2">${esc(need.description)}</p>
        <div>
          <div class="flex justify-between text-xs mb-1.5">
            <span class="text-gray-500">₦${fmt(fundedTotal)} funded</span>
            <span class="font-bold text-teal-600">${fundedPct}%</span>
          </div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full bg-teal-500 rounded-full" style="width:${fundedPct}%"></div>
          </div>
        </div>
        <div class="flex gap-2 pt-1">
          <a href="#/org/needs/${need.id}" class="flex-1 py-2 text-center text-sm font-semibold bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50">Details</a>
          <a href="#/org/needs/${need.id}" class="flex-1 py-2 text-center text-sm font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700">Fund Need</a>
        </div>
      </div>
    </article>`;
}

export { renderPortfolioCard, renderDiscoveryCard };