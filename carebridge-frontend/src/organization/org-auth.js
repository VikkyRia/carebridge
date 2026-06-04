import { data, state } from "./org-state.js";
import { esc, fmt } from "./org-utils.js";

function renderAuthPage() {
  return state.authMode === "login" ? renderLogin() : renderSignup();
}

function renderLogin() {
  return `
    <div class="min-h-screen bg-gradient-to-br from-teal-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <a href="#/" class="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm mb-6">
            ← Back to CareBridge
          </a>
          <div class="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span class="text-white font-bold text-2xl">GT</span>
          </div>
          <h1 class="text-3xl font-bold text-gray-900">Organisation Sign In</h1>
          <p class="text-gray-500 mt-2">CSR partner portal · GTCo Foundation</p>
        </div>
        <div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div class="flex gap-2 bg-gray-100 rounded-xl p-1 mb-8">
            <button onclick="ORG._setAuthMode('login')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all bg-white text-gray-900 shadow-sm">Sign In</button>
            <button onclick="ORG._setAuthMode('signup')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all text-gray-500 hover:text-gray-700">Register Org</button>
          </div>
          <form onsubmit="ORG._loginSubmit(event)" class="space-y-5">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
              <input type="email" required placeholder="csr@yourorg.com" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 bg-gray-50" />
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <input type="password" required placeholder="••••••••" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
              <button type="button" class="text-sm text-teal-600 hover:text-teal-700 mt-2 font-medium">Forgot password?</button>
            </div>
            <button type="submit" class="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-base shadow-sm transition-colors">Sign In to Dashboard</button>
          </form>
          <div class="mt-6 pt-6 border-t border-gray-100 text-center">
            <p class="text-sm text-gray-600">No account? <button onclick="ORG._setAuthMode('signup')" class="text-teal-600 hover:text-teal-700 font-semibold ml-1">Register your organisation →</button></p>
          </div>
        </div>
        <p class="text-center text-xs text-gray-400 mt-6">Individual donors → <a href="#/donor/auth" class="text-teal-600 hover:underline">donor login</a></p>
      </div>
    </div>`;
}

function renderSignup() {
  const s = state.signup;
  const steps = [
    { label: "Organisation", icon: "🏢" },
    { label: "Support Setup", icon: "🎯" },
    { label: "Fund Wallet", icon: "💳" },
    { label: "Location", icon: "📍" },
  ];
  const pct = Math.round(((s.step + 1) / steps.length) * 100);

  function canProceed() {
    switch (s.step) {
      case 0:
        return s.orgName && s.email && s.password;
      case 1:
        return s.budget && s.categories.length > 0;
      case 2:
        return s.walletAmount && parseFloat(s.walletAmount) > 0;
      case 3:
        return s.country && (s.state_ || s.customLocation);
      default:
        return false;
    }
  }

  return `
    <div class="min-h-screen bg-gradient-to-br from-teal-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div class="w-full max-w-2xl">
        <div class="text-center mb-6">
          <a href="#/org/auth" class="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-4">← Back to sign in</a>
          <h1 class="text-3xl font-bold text-gray-900">Organisation Registration</h1>
          <p class="text-gray-500 mt-1">Set up your CareBridge CSR dashboard</p>
        </div>
        <div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div class="mb-8">
            <div class="flex items-center justify-between mb-4">
              ${steps.map((step, i) => `
                <div class="flex flex-col items-center gap-1 flex-1">
                  <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${i < s.step ? "bg-teal-600 text-white" : i === s.step ? "bg-teal-50 text-teal-700 border-2 border-teal-600" : "bg-gray-100 text-gray-400"}">${i < s.step ? "✓" : step.icon}</div>
                  <span class="text-xs font-medium ${i === s.step ? "text-teal-700" : "text-gray-400"} hidden sm:block">${step.label}</span>
                </div>
                ${i < steps.length - 1 ? `<div class="flex-1 max-w-[40px] h-px mx-1 mt-[-20px] ${i < s.step ? "bg-teal-600" : "bg-gray-200"}"></div>` : ""}
              `).join("")}
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-teal-600 rounded-full transition-all duration-300" style="width:${pct}%"></div>
            </div>
            <p class="text-right text-xs text-gray-400 mt-1">Step ${s.step + 1} of ${steps.length}</p>
          </div>
          ${renderSignupStep(s.step)}
          <div class="flex gap-3 mt-8">
            ${s.step > 0 ? `<button onclick="ORG._signupBack()" class="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold">← Back</button>` : ""}
            <button onclick="ORG._signupNext()" ${!canProceed() ? "disabled" : ""} class="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors">${s.step === steps.length - 1 ? "Complete Registration →" : "Continue →"}</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderSignupStep(step) {
  const s = state.signup;
  if (step === 0) {
    return `
      <div class="space-y-5">
        <div><h2 class="text-xl font-bold text-gray-900">Basic Information</h2><p class="text-sm text-gray-500 mt-1">Tell us about your organisation</p></div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Organisation Name</label>
          <input type="text" placeholder="e.g. GTCo Foundation" value="${esc(s.orgName)}" oninput="ORG._signupField('orgName',this.value)" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Work Email</label>
          <input type="email" placeholder="csr@yourorg.com" value="${esc(s.email)}" oninput="ORG._signupField('email',this.value)" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
          <input type="password" placeholder="Minimum 8 characters" value="${esc(s.password)}" oninput="ORG._signupField('password',this.value)" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
        </div>
      </div>`;
  }

  if (step === 1) {
    return `
      <div class="space-y-5">
        <div><h2 class="text-xl font-bold text-gray-900">Support Setup</h2><p class="text-sm text-gray-500 mt-1">Define your giving parameters</p></div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Monthly Budget (₦)</label>
          <input type="number" placeholder="500000" value="${esc(s.budget)}" oninput="ORG._signupField('budget',this.value)" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          <p class="text-xs text-gray-400 mt-1">How much do you want to allocate monthly?</p>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">Categories of Needs to Support</label>
          <div class="grid grid-cols-2 gap-3">
            ${data.categories.map((cat) => `
              <label class="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors ${s.categories.includes(cat.id) ? "border-teal-300 bg-teal-50" : ""}">
                <input type="checkbox" value="${cat.id}" ${s.categories.includes(cat.id) ? "checked" : ""} onchange="ORG._toggleCategory('${cat.id}')" class="w-4 h-4 text-teal-600 rounded focus:ring-teal-500" />
                <span class="text-sm font-medium text-gray-700">${esc(cat.label)}</span>
              </label>`).join("")}
          </div>
        </div>
      </div>`;
  }

  if (step === 2) {
    const walletAmt = parseFloat(s.walletAmount) || 0;
    const fee = walletAmt > 0 ? Math.round(walletAmt * 0.015) : 0;
    return `
      <div class="space-y-5">
        <div><h2 class="text-xl font-bold text-gray-900">Fund Your Wallet</h2><p class="text-sm text-gray-500 mt-1">Add initial funds to start supporting needs immediately</p></div>
        <div class="bg-teal-50 border border-teal-200 rounded-xl p-5">
          <div class="flex gap-3">
            <div class="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">ℹ️</div>
            <div>
              <p class="font-semibold text-teal-900">Why fund your wallet?</p>
              <p class="text-sm text-teal-700 mt-1">Pre-funded wallets let you instantly match and support needs without payment delays. Funds are secure and withdrawable anytime.</p>
            </div>
          </div>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Initial Wallet Amount (₦)</label>
          <div class="grid grid-cols-2 gap-2 mb-3">
            ${[500000,1000000,2500000,5000000].map((a) => `
              <button type="button" onclick="ORG._signupField('walletAmount','${a}'); ORG._rerender()" class="py-3 rounded-xl border-2 font-semibold text-sm transition-colors ${s.walletAmount == a ? "border-teal-600 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-700 hover:border-gray-300"}">₦${fmt(a)}</button>`).join("")}
          </div>
          <input type="number" placeholder="Or enter custom amount" value="${esc(s.walletAmount)}" oninput="ORG._signupField('walletAmount',this.value); ORG._rerender()" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          <p class="text-xs text-gray-400 mt-1">Minimum: ₦10,000</p>
        </div>
        ${walletAmt > 0 ? `
          <div class="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-200">
            <div class="flex justify-between text-sm"><span class="text-gray-600">Amount</span><span class="font-bold text-gray-900">₦${fmt(walletAmt)}</span></div>
            <div class="flex justify-between text-sm"><span class="text-gray-600">Transaction fee (1.5%)</span><span class="font-bold text-gray-900">₦${fmt(fee)}</span></div>
            <div class="border-t border-gray-200 pt-2 flex justify-between"><span class="font-bold text-gray-900">Total to pay</span><span class="text-lg font-bold text-teal-600">₦${fmt(walletAmt + fee)}</span></div>
          </div>` : ""}
      </div>`;
  }

  const cityList = data.citiesByState[s.state_] || [];
  return `
    <div class="space-y-5">
      <div><h2 class="text-xl font-bold text-gray-900">Location</h2><p class="text-sm text-gray-500 mt-1">Tell us where your CSR support should focus.</p></div>
      <div class="grid xl:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Country</label>
          <select onchange="ORG._signupField('country',this.value); ORG._signupField('state_',''); ORG._signupField('city',''); ORG._rerender()" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50">
            <option value="">Select Country</option>
            ${data.countries.map((country) => `<option value="${country}" ${s.country === country ? "selected" : ""}>${country}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">State / Region</label>
          <select onchange="ORG._signupField('state_',this.value); ORG._signupField('city',''); ORG._rerender()" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50">
            <option value="">Select State</option>
            ${(data.statesByCountry[s.country] || []).map((stateName) => `<option value="${stateName}" ${s.state_ === stateName ? "selected" : ""}>${stateName}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">City (optional)</label>
          <select onchange="ORG._signupField('city',this.value)" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50">
            <option value="">Select City</option>
            ${cityList.map((city) => `<option value="${city}" ${s.city === city ? "selected" : ""}>${city}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="relative flex items-center gap-3">
        <div class="flex-1 border-t border-gray-200"></div>
        <span class="text-xs text-gray-400 font-medium">OR</span>
        <div class="flex-1 border-t border-gray-200"></div>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Custom Location</label>
        <input type="text" placeholder="e.g. West Africa, Northern Nigeria" value="${esc(s.customLocation)}" oninput="ORG._signupField('customLocation',this.value)" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
      </div>
    </div>`;
}

export { renderAuthPage };