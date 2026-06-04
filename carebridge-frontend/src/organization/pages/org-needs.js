import { data, state, getSelectedAmount } from "../state/org-state.js";
import { fmt, esc, categoryColors, categoryIcons, timeAgo, verifiedBadge, urgencyBadge } from "../utils/org-utils.js";
import { renderShell } from "../utils/org-shell.js";
import { renderPortfolioCard, renderDiscoveryCard } from "../components/org-active-portfolio.js";

function renderNeeds() {
  const f = state.needsFilter;
  const matchesFilter = (need) => {
    const catOk = f.category === "All" || need.category === f.category;
    const q = f.search.toLowerCase();
    const text = [need.orphanageName, need.location, need.description, ...(need.items || [])].join(" ").toLowerCase();
    return catOk && (!q || text.includes(q));
  };

  const portfolioNeeds = data.portfolio
    .filter((item) => !state.hiddenPortfolioIds.includes(item.id))
    .filter((item) => {
      const catOk = f.category === "All" || item.category === f.category;
      const q = f.search.toLowerCase();
      const text = [item.facility, item.category, item.location || ""].join(" ").toLowerCase();
      return catOk && (!q || text.includes(q));
    })
    .map((item) => ({
      id: item.id,
      orphanageName: item.facility,
      category: item.category,
      location: item.location || "To be confirmed",
      verified: item.verified || false,
      description: item.description || "Facility details synced from CareBridge.",
      childrenImpacted: 0,
      cashEquivalent: item.amount,
      urgency: "medium",
      timePosted: "",
      items: [],
      portfolioStatus: item.status,
      portfolioAmount: item.amount,
    }));

  const discoveryNeeds = data.needs
    .filter((need) => !portfolioNeeds.some((p) => p.id === need.id))
    .filter(matchesFilter)
    .sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "critical" ? -1 : b.urgency === "critical" ? 1 : a.urgency === "high" ? -1 : 1));

  const cats = ["All", "Food", "Medical", "Education", "Shelter", "Clothing"];
  const urgs = ["All", "Critical", "High", "Medium"];

  const content = `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Needs / Opportunities</h1>
        <p class="text-gray-500 mt-1">Your active portfolio first, then discover new funding opportunities.</p>
      </div>
      <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div class="grid md:grid-cols-3 gap-4">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" value="${esc(f.search)}" placeholder="Search facility, need, or location…" oninput="ORG._setFilter('search',this.value)" class="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          </div>
          <select onchange="ORG._setFilter('category',this.value)" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500">
            ${cats.map((category) => `<option value="${category}" ${f.category === category ? "selected" : ""}>${category === "All" ? "All Categories" : category}</option>`).join("")}
          </select>
          <select onchange="ORG._setFilter('urgency',this.value)" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500">
            ${urgs.map((urgency) => `<option value="${urgency}" ${f.urgency === urgency ? "selected" : ""}>${urgency === "All" ? "All Urgency Levels" : urgency}</option>`).join("")}
          </select>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-gray-100">
          <div class="flex flex-wrap gap-2">
            <span class="px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold rounded-full">${data.portfolio.filter((item) => item.status === "Active").length} Active</span>
            <span class="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-full">${data.portfolio.filter((item) => item.status === "Matched").length} Matched</span>
            <span class="px-3 py-1 bg-gray-100 text-gray-600 border border-gray-200 text-xs font-bold rounded-full">${data.portfolio.filter((item) => item.status === "Fulfilled").length} Fulfilled</span>
          </div>
          <label class="flex items-center gap-3 cursor-pointer">
            <span class="text-sm font-medium text-gray-700">Auto-fund similar needs</span>
            <div class="relative">
              <input type="checkbox" ${state.autoFundSimilar ? "checked" : ""} onchange="ORG._toggleAutoFund(this.checked)" class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-teal-600 transition-all"></div>
              <div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
            </div>
            <span class="text-sm ${state.autoFundSimilar ? "text-teal-700 font-semibold" : "text-gray-400"}">${state.autoFundSimilar ? "On" : "Off"}</span>
          </label>
        </div>
        ${state.autoFundSimilar ? `<p class="text-sm text-teal-700 bg-teal-50 rounded-lg p-3 border border-teal-200">Auto-fund rules: same category, similar urgency, location within your active portfolio.</p>` : ""}
      </div>
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-gray-900">Active Portfolio</h2>
            <p class="text-sm text-gray-500">${portfolioNeeds.length} tracked need${portfolioNeeds.length !== 1 ? "s" : ""} visible</p>
          </div>
          ${!state.showMoreNeeds ? `<button onclick="ORG._toggleShowMore(true)" class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-sm">Discover more needs</button>` : ""}
        </div>
        ${portfolioNeeds.length === 0 ? `<div class="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center"><p class="text-gray-500">No portfolio needs match your current filters.</p></div>` : ""}
        <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">${portfolioNeeds.map((need) => renderPortfolioCard(need)).join("")}</div>
      </section>
      ${state.showMoreNeeds ? `
        <section class="space-y-4 border-t-2 border-dashed border-gray-200 pt-6">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-bold text-gray-900">Discover New Needs</h2>
              <p class="text-sm text-gray-500">Additional verified opportunities outside your current portfolio.</p>
            </div>
            <button onclick="ORG._toggleShowMore(false)" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium">Hide discovery</button>
          </div>
          ${discoveryNeeds.length === 0 ? `<div class="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center"><p class="text-gray-500">No additional needs match your filters right now.</p></div>` : ""}
          <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">${discoveryNeeds.map((need) => renderDiscoveryCard(need)).join("")}</div>
        </section>` : ""}
    </div>`;

  return renderShell("needs", content, "", state, data);
}

function renderNeedDetail(needId) {
  const need = data.needDetails?.[needId] || data.needs.find((item) => item.id === needId);

  if (!need) {
    if (state.needFetchFailedId === needId) {
      return renderShell("needs", `
        <div class="text-center py-20">
          <p class="text-2xl font-bold text-gray-900 mb-3">Need not found</p>
          <p class="text-sm text-gray-500 mb-4">We could not fetch that need from the server.</p>
          <a href="#/org/needs" class="text-teal-600 hover:underline font-medium">← Back to needs</a>
        </div>`, "", state, data);
    }

    if (!state.pendingNeedId) {
      state.pendingNeedId = needId;
      // loadNeedDetail is provided by org-state module and will be called from index
    }

    return renderShell("needs", `
      <div class="text-center py-20">
        <p class="text-2xl font-bold text-gray-900 mb-3">Loading need details…</p>
        <p class="text-sm text-gray-500">Please wait while we fetch the latest need information.</p>
        <a href="#/org/needs" class="mt-6 inline-block text-teal-600 hover:underline font-medium">← Back to needs</a>
      </div>`, "", state, data);
  }

  const commitment = state.commitments[needId] || { mode: "fund", funded: false, committed: false, inTransit: false, delivered: false, fulfilled: false, fundedAmount: 0 };
  const mode = commitment.mode || "fund";
  const selected = getSelectedAmount(needId, need.cashEquivalent);
  const insufficient = selected > state.walletBalance;
  const walletAfterFunding = commitment.funded ? state.walletBalance : Math.max(0, state.walletBalance - selected);

  const fundTimeline = [
    { label: "Funded", done: commitment.funded, note: commitment.funded ? `₦${fmt(commitment.fundedAmount || selected)} deducted from wallet` : "Select an amount to fund this need" },
    { label: "Fulfilled", done: commitment.fulfilled, note: commitment.fulfilled ? "Awaiting proof of fulfillment" : "Proof will be requested after funding" },
  ];

  const deliveryTimeline = [
    { label: "Committed", done: commitment.committed, note: commitment.committed ? "Delivery commitment confirmed" : "Confirm the delivery commitment" },
    { label: "In Transit", done: commitment.inTransit, note: commitment.inTransit ? "Items are on the way" : "Prepare dispatch and logistics" },
    { label: "Delivered", done: commitment.delivered, note: commitment.delivered ? "Delivery complete · proof pending" : "Mark the delivery as complete after handoff" },
  ];

  const timelineSteps = mode === "delivery" ? deliveryTimeline : fundTimeline;

  const actionPanel = mode === "delivery" ? `
    <div class="space-y-4">
      <div class="rounded-2xl border border-teal-200 bg-teal-50 p-4">
        <p class="text-sm text-teal-700">Confirm a delivery commitment for the items below.</p>
      </div>
      <div class="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 class="font-bold text-gray-900 mb-3">Facility address</h3>
        <p class="text-sm text-gray-700">${esc(need.deliveryAddress)}</p>
      </div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div class="bg-white border border-gray-200 rounded-2xl p-4">
          <p class="text-xs text-gray-500 mb-1">Contact person</p>
          <p class="font-semibold text-gray-900">${esc(need.contactPerson)}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-2xl p-4">
          <p class="text-xs text-gray-500 mb-1">Phone</p>
          <p class="font-semibold text-gray-900">${esc(need.contactPhone)}</p>
        </div>
      </div>
      <div class="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 class="font-bold text-gray-900 mb-3">Items and description</h3>
        <p class="text-sm text-gray-700 leading-relaxed mb-4">${esc(need.description)}</p>
        <ul class="space-y-2">
          ${need.items.map((item) => `<li class="flex items-start gap-2 text-sm text-gray-700"><span class="text-teal-600 font-bold">✓</span><span>${esc(item)}</span></li>`).join("")}
        </ul>
      </div>
      ${!commitment.committed ? `<button onclick="ORG._commit('${need.id}')" class="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm">Confirm Commitment</button>` : ""}
      ${commitment.committed && !commitment.inTransit ? `<button onclick="ORG._advance('${need.id}','inTransit')" class="w-full py-3 border-2 border-teal-600 text-teal-700 hover:bg-teal-50 rounded-xl font-bold">Mark as in transit</button>` : ""}
      ${commitment.inTransit && !commitment.delivered ? `<button onclick="ORG._advance('${need.id}','delivered')" class="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold shadow-sm">Mark as delivered</button>` : ""}
      ${commitment.delivered ? `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center"><p class="text-emerald-800 font-bold">✓ Delivery complete</p><p class="text-sm text-emerald-700 mt-0.5">Proof will be attached after handoff.</p></div>` : ""}
    </div>` : `
    <div class="space-y-4">
      <div class="rounded-2xl border border-teal-200 bg-teal-50 p-4"><p class="text-sm text-teal-700">Fund this need from your wallet.</p></div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">Choose amount</label>
        <div class="grid grid-cols-2 gap-2">
          ${[1000, 10000, 25000, need.cashEquivalent].map((amount) => `<button type="button" onclick="ORG._setCustomAmount('${need.id}', '${amount}'); ORG._rerender()" class="py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${selected === amount ? "border-teal-600 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-700 hover:border-gray-300"}">₦${fmt(amount)}</button>`).join("")}
        </div>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">Custom amount</label>
        <div class="relative">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₦</span>
          <input type="number" placeholder="${need.cashEquivalent}" value="${esc(state.customAmounts[need.id] || "")}" oninput="ORG._setCustomAmount('${need.id}', this.value); ORG._rerender()" class="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
        </div>
      </div>
      <div class="bg-gray-50 rounded-xl p-4 space-y-2">
        <div class="flex justify-between text-sm"><span class="text-gray-600">Selected</span><span class="font-bold text-gray-900">₦${fmt(selected)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-600">Wallet after funding</span><span class="font-bold ${insufficient ? "text-red-600" : "text-gray-900"}">₦${fmt(walletAfterFunding)}</span></div>
      </div>
      ${insufficient ? `<p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">Insufficient wallet balance. <a href="#/org/finances" class="underline font-semibold">Add funds →</a></p>` : ""}
      ${commitment.funded ? `<div class="bg-teal-50 border border-teal-200 rounded-xl p-4"><p class="text-sm font-bold text-teal-800">Funding confirmed</p><p class="text-sm text-teal-700 mt-0.5">₦${fmt(commitment.fundedAmount || selected)} deducted and recorded in transactions.</p></div>` : ""}
      ${!commitment.funded ? `<button onclick="ORG._fund('${need.id}', ${selected})" ${insufficient ? "disabled" : ""} class="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-sm">Fund This Need</button>` : ""}
    </div>`;

  const content = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm text-gray-500">Operations view</p>
          <h1 class="text-3xl font-bold text-gray-900">${esc(need.orphanageName)}</h1>
        </div>
        <div class="flex items-center gap-3">
          <a href="#/org/needs" class="text-teal-600 hover:text-teal-700 font-semibold text-sm">← Back to Needs</a>
          <button onclick="ORG._refreshNeed('${need.id}')" class="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50">Refresh</button>
        </div>
      </div>
      <div class="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div class="space-y-5">
          <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div class="bg-gradient-to-br ${categoryColors[need.category] || "from-gray-400 to-gray-500"} h-48 flex items-center justify-center relative">
              <span class="text-8xl">${categoryIcons[need.category] || "📦"}</span>
              <div class="absolute top-4 left-4"><span class="px-3 py-1 bg-white/90 text-gray-800 text-xs font-bold rounded-full shadow">Cash-in-Kind</span></div>
              ${need.urgency === "critical" ? `<div class="absolute top-4 right-4"><span class="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow">HIGH URGENCY</span></div>` : ""}
            </div>
            <div class="p-6">
              <div class="flex items-start gap-3 mb-4">
                <div class="flex-1">
                  <p class="text-sm text-gray-500">${esc(need.location)} · verified March 2026</p>
                  <p class="text-gray-700 mt-2 leading-relaxed">${esc(need.description)}</p>
                </div>
                ${need.verified ? verifiedBadge("w-6 h-6", "text-teal-500") : ""}
              </div>
              <div class="grid grid-cols-3 gap-3 mb-5">
                ${[
                  ["Children", need.childrenImpacted],
                  ["Need value", `₦${fmt(need.cashEquivalent)}`],
                  ["Posted", need.createdAt ? timeAgo(need.createdAt) : need.timePosted || "Just now"],
                ].map(([label, value]) => `
                  <div class="bg-gray-50 rounded-xl p-3 text-center">
                    <p class="text-xs text-gray-500">${label}</p>
                    <p class="font-bold text-gray-900 mt-0.5">${esc(String(value))}</p>
                  </div>
                `).join("")}
              </div>
              <div class="border-t border-gray-100 pt-4">
                <p class="font-semibold text-gray-900 mb-2">Delivery requirements</p>
                <ul class="space-y-1.5">
                  ${need.items.map((item) => `<li class="flex items-start gap-2 text-sm"><span class="text-teal-600 flex-shrink-0 font-bold">✓</span><span class="text-gray-700">${esc(item)}</span></li>`).join("")}
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div class="space-y-5">
          <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div class="mb-5">
              <p class="text-sm text-gray-500 mb-2">Choose one path</p>
              <div class="grid sm:grid-cols-2 gap-3">
                <button type="button" onclick="ORG._setNeedAction('${need.id}', 'fund'); ORG._rerender()" class="text-left rounded-2xl border-2 p-4 transition-colors ${mode === 'fund' ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}">
                  <p class="font-bold text-gray-900">Fund from Wallet</p>
                </button>
                <button type="button" onclick="ORG._setNeedAction('${need.id}', 'delivery'); ORG._rerender()" class="text-left rounded-2xl border-2 p-4 transition-colors ${mode === 'delivery' ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}">
                  <p class="font-bold text-gray-900">Commit to Deliver</p>
                </button>
              </div>
            </div>
            ${actionPanel}
          </div>
          <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 class="font-bold text-gray-900 mb-5">${mode === 'delivery' ? 'Delivery timeline' : 'Funding timeline'}</h2>
            <div class="space-y-1">
              ${timelineSteps.map((step, index) => `
                <div class="flex gap-4">
                  <div class="flex flex-col items-center">
                    <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step.done ? 'bg-teal-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}">${step.done ? '✓' : index + 1}</div>
                    ${index < timelineSteps.length - 1 ? `<div class="w-0.5 flex-1 mt-1 mb-1 ${step.done ? 'bg-teal-300' : 'bg-gray-200'} min-h-[20px]"></div>` : ""}
                  </div>
                  <div class="pb-5 pt-1">
                    <p class="font-semibold text-gray-900 text-sm">${step.label}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${step.note}</p>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  return renderShell("needs", content, "", state, data);
}

export { renderNeeds, renderNeedDetail };