import { esc, fmt } from "./org-utils.js";

function renderTopBar(state, data) {
  const initials = state.currentUser && state.currentUser.full_name
    ? state.currentUser.full_name.slice(0, 2).toUpperCase()
    : data.orgInitials;
  const name = state.currentUser && state.currentUser.full_name ? state.currentUser.full_name : data.orgName;

  return `
    <header class="org-topbar bg-white border-b border-gray-200 sticky top-0 z-20">
      <div class="px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm">
            <span class="text-white font-bold text-lg">${esc(initials)}</span>
          </div>
          <div>
            <p class="font-bold text-gray-900 leading-tight">${esc(name)}</p>
            <p class="text-xs text-gray-500">CSR partner · verified dashboard</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="hidden sm:flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5">
            <span class="text-xs text-teal-700 font-medium">Wallet</span>
            <span class="font-bold text-teal-800 text-sm">₦${fmt(state.walletBalance)}</span>
          </div>
          <a href="#/org/needs" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">View Needs</a>
          <a href="#/org/finances" class="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium">Finances</a>
          <button onclick="ORG.signOut()" class="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 text-sm">Sign out</button>
        </div>
      </div>
    </header>`;
}

function renderSidebar(activeTab, state, data) {
  const metrics = data.dashboardMetrics || {};
  const deployed = metrics.totalDonated || 0;
  const budget = (state.currentUser && state.currentUser.monthly_budget) ? Number(state.currentUser.monthly_budget) : 0;
  const percentage = budget > 0 ? Math.min(100, Math.round((deployed / budget) * 100)) : 0;
  const deployedLabel = deployed > 0 ? `₦${fmt(deployed)}` : "₦0";
  const budgetLabel = budget > 0 ? `₦${fmt(budget)}` : "Not set";
  const pctLabel = budget > 0 ? `${percentage}%` : "—";

  const navItems = [
    { id: "dashboard", label: "Dashboard", href: "#/org/dashboard", icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>` },
    { id: "needs", label: "Needs", href: "#/org/needs", icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>` },
    { id: "finances", label: "Finances", href: "#/org/finances", icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>` },
    { id: "profile", label: "Profile", href: "#/org/profile", icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>` },
  ];

  return `
    <aside class="org-sidebar w-64 flex-shrink-0 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] p-4">
      <nav class="space-y-1">
        ${navItems.map((item) => `
          <a href="${item.href}" class="org-nav-item flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${activeTab === item.id ? "bg-teal-50 text-teal-700 font-semibold border border-teal-100 shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg>
            <span>${item.label}</span>
          </a>`).join("")}
      </nav>

      <div class="mt-6 pt-6 border-t border-gray-100">
        <div class="rounded-xl bg-teal-600 text-white p-4">
          <p class="text-xs text-teal-100 mb-1">Annual budget used</p>
          <p class="text-2xl font-bold mb-1">${pctLabel}</p>
          <div class="h-1.5 bg-teal-500 rounded-full overflow-hidden">
            <div class="h-full bg-white rounded-full" style="width:${percentage}%"></div>
          </div>
          <p class="text-xs text-teal-100 mt-2">${esc(deployedLabel)} of ${esc(budgetLabel)} deployed</p>
        </div>
      </div>
    </aside>`;
}

function renderShell(activeTab, content, modalHtml, state, data) {
  return `
    <div class="org-shell min-h-screen bg-gray-50">
      ${renderTopBar(state, data)}
      <div class="flex">
        ${renderSidebar(activeTab, state, data)}
        <main class="flex-1 p-6 lg:p-8 min-w-0">${content}</main>
      </div>
      <div id="org-modal-container">${modalHtml}</div>
    </div>`;
}

export { renderShell };