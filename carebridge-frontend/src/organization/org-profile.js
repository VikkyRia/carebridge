import { data, state } from "./org-state.js";
import { fmt, esc } from "./org-utils.js";
import { renderShell } from "./org-shell.js";

function renderProfile() {
  const user = state.currentUser || {};
  const profileItems = [
    ["Organisation", user.full_name || data.orgName],
    ["Primary Contact", user.email || data.orgEmail],
    ["Focus Areas", (user.categories && user.categories.length) ? user.categories.join(", ") : "Not set"],
    ["Monthly Budget", user.monthly_budget ? `₦${fmt(Number(user.monthly_budget))}` : "Not set"],
    ["Location", [user.city, user.state, user.country].filter(Boolean).join(", ") || "Not set"],
    ["Role", user.role || "Organisation"],
  ];

  const quickLinks = [
    { href: "#/org/finances", label: "Wallet & Transactions", icon: "💳" },
    { href: "#/org/needs", label: "Review Matching Needs", icon: "📋" },
    { href: "#/org/dashboard", label: "Return to Dashboard", icon: "⊞" },
  ];

  const reports = [
    { label: "Q1 2026 Impact Report", date: "Mar 31, 2026", ready: true },
    { label: "Q4 2025 Impact Report", date: "Dec 31, 2025", ready: true },
    { label: "Annual 2025 Summary", date: "Jan 15, 2026", ready: true },
  ];

  const content = `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">${esc(data.orgName)} Profile</h1>
        <p class="text-gray-500 mt-1">Manage settings, preferences, and reporting access.</p>
      </div>
      <div class="grid xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div class="space-y-5">
          <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div class="flex items-start gap-4 mb-6">
              <div class="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md">${esc(data.orgInitials)}</div>
              <div>
                <h2 class="text-xl font-bold text-gray-900">${esc(data.orgName)}</h2>
                <p class="text-gray-500 text-sm">${esc(data.orgEmail)}</p>
                <span class="inline-block mt-1.5 px-3 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold rounded-full">CSR Partner · Verified</span>
              </div>
            </div>
            <div class="grid sm:grid-cols-2 gap-3">
              ${profileItems.map(([label, value]) => `
                <div class="bg-gray-50 rounded-xl p-4">
                  <p class="text-xs text-gray-500 mb-0.5">${esc(label)}</p>
                  <p class="font-semibold text-gray-900">${esc(value)}</p>
                </div>
              `).join("")}
            </div>
            <div class="mt-5 flex flex-wrap gap-3">
              <button class="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm">Edit Profile</button>
              <button class="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium">Manage Team Access</button>
            </div>
          </section>
          <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 class="font-bold text-gray-900 mb-4">Notification Preferences</h2>
            <div class="space-y-4">
              ${[
                { label: "New matched need alerts", on: true },
                { label: "Proof of delivery received", on: true },
                { label: "Weekly portfolio digest", on: false },
                { label: "Monthly ESG summary", on: true },
              ].map((pref) => `
                <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span class="text-sm text-gray-700">${esc(pref.label)}</span>
                  <label class="flex items-center cursor-pointer">
                    <input type="checkbox" ${pref.on ? "checked" : ""} class="sr-only peer" />
                    <div class="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:bg-teal-600 transition-all relative">
                      <div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
                    </div>
                  </label>
                </div>
              `).join("")}
            </div>
          </section>
        </div>
        <div class="space-y-5">
          <aside class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 class="font-bold text-gray-900 mb-4">Quick Links</h2>
            <div class="space-y-2">
              ${quickLinks.map((link) => `
                <a href="${link.href}" class="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 hover:bg-teal-50 text-gray-700 hover:text-teal-700 transition-colors group">
                  <span class="text-lg">${link.icon}</span>
                  <span class="text-sm font-medium">${esc(link.label)}</span>
                  <svg class="w-4 h-4 ml-auto text-gray-400 group-hover:text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </a>
              `).join("")}
            </div>
          </aside>
          <aside class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 class="font-bold text-gray-900 mb-4">ESG Reports</h2>
            <div class="space-y-3">
              ${reports.map((report) => `
                <div class="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                  <div>
                    <p class="text-sm font-semibold text-gray-900">${esc(report.label)}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${esc(report.date)}</p>
                  </div>
                  ${report.ready ? `<button class="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-sm">Download</button>` : `<span class="text-xs text-gray-400">Generating…</span>`}
                </div>
              `).join("")}
            </div>
          </aside>
          <aside class="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white shadow-md">
            <h2 class="font-bold mb-1">Support &amp; Helpdesk</h2>
            <p class="text-sm text-teal-100 mb-4">Your dedicated CareBridge CSR manager is available Mon–Fri, 9am–5pm.</p>
            <button class="w-full py-2.5 bg-white text-teal-700 rounded-xl font-bold hover:bg-teal-50 transition-colors text-sm">Contact Partnership Team</button>
          </aside>
        </div>
      </div>
    </div>`;

  return renderShell("profile", content, "", state, data);
}

export { renderProfile };