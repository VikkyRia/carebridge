function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value) {
  return Number(value).toLocaleString("en-NG");
}

function formatTransactionDate(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA");
}

function formatTransactionTime(value = new Date()) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(input) {
  if (!input) return "Just now";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  return date.toLocaleDateString();
}

function verifiedBadge(size = "w-5 h-5", color = "text-teal-600") {
  return `<svg class="${size} ${color} flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
  </svg>`;
}

function urgencyBadge(urgency) {
  const classMap = {
    critical: "bg-red-100 text-red-800 border-red-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  };
  return `<span class="px-3 py-1 rounded-full text-xs font-medium border ${classMap[urgency] || ""}">${(urgency || "").toUpperCase()}</span>`;
}

function normalizeUser(user = {}) {
  return {
    id: user.id || user.user_id || user.uuid || null,
    email: user.email || user.user_email || "",
    full_name: user.full_name || user.name || user.org_name || "",
    role: user.role || "organisation",
    ...user,
  };
}

function normalizeNeed(need = {}) {
  const normalizedItems = Array.isArray(need.items)
    ? need.items
    : typeof need.items === "string"
      ? need.items.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

  return {
    id: String(need.id ?? need.need_id ?? need.needId ?? ""),
    orphanageName: need.orphanageName || need.facility_name || need.name || "Verified Care Facility",
    verified: Boolean(need.verified ?? need.is_verified ?? false),
    category: need.category || need.need_category || need.type || "Other",
    items: normalizedItems,
    cashEquivalent: Number(need.cashEquivalent ?? need.cash_equivalent ?? need.amount ?? need.target_amount ?? 0) || 0,
    urgency: String(need.urgency || need.priority || "medium").toLowerCase(),
    childrenImpacted: Number(need.childrenImpacted ?? need.children_count ?? need.children_impacted ?? need.children ?? 0) || 0,
    createdAt: need.created_at || need.createdAt || need.time_posted || need.posted_at || null,
    timePosted: need.timePosted || null,
    description: need.description || need.details || "Community support request",
    location: need.location || need.city || need.country || "To be confirmed",
    deliveryAddress: need.deliveryAddress || need.address || "Delivery details pending",
    contactPerson: need.contactPerson || need.contact_name || "CareBridge team",
    contactPhone: need.contactPhone || need.contact_phone || "To be confirmed",
  };
}

function normalizeDonation(donation = {}) {
  const createdAt = donation.created_at || donation.createdAt || donation.date || new Date();
  const amount = Number(donation.amount ?? donation.total_amount ?? 0) || 0;
  const id = String(donation.id ?? donation.donation_id ?? donation.transaction_id ?? `don-${Date.now()}`);
  const needId = String(donation.need_id ?? donation.needId ?? donation.need ?? "");
  const category = donation.category || donation.need_category || donation.needCategory || donation.category_name || "Other";

  return {
    id,
    type: amount >= 0 ? "credit" : "debit",
    description: donation.description || donation.note || `Donation for need #${needId || "current"}`,
    amount,
    date: formatTransactionDate(createdAt),
    time: formatTransactionTime(createdAt),
    facility: donation.facility || donation.orphanage_name || donation.need_name || "CareBridge partner",
    needId,
    category,
    raw: donation,
  };
}

function normalizeFulfillment(fulfillment = {}) {
  const deliveredAt = fulfillment.delivered_at || fulfillment.deliveredAt || fulfillment.created_at || fulfillment.createdAt || new Date();
  return {
    id: String(fulfillment.id ?? fulfillment.fulfillment_id ?? fulfillment.uuid ?? `ful-${Date.now()}`),
    title: fulfillment.title || fulfillment.name || fulfillment.activity || fulfillment.description || "Fulfillment update",
    status: fulfillment.status || fulfillment.state || (fulfillment.verified ? "verified" : "pending"),
    verified: Boolean(fulfillment.verified ?? false),
    amount: Number(fulfillment.amount ?? fulfillment.value ?? 0) || 0,
    deliveredAt,
    details: fulfillment.details || fulfillment.note || "",
    facility: fulfillment.facility || fulfillment.orphanage_name || "",
  };
}

function normalizeFacility(facility = {}, index = 0) {
  const amount = Number(facility.amount ?? facility.allocated_amount ?? facility.target_amount ?? 0) || 0;
  const rawStatus = facility.status || facility.state || "Active";
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();

  return {
    id: String(facility.id ?? facility.facility_id ?? facility.uuid ?? `facility-${index}`),
    facility: facility.name || facility.facility_name || facility.organization_name || `Facility ${index + 1}`,
    category: facility.category || facility.support_type || facility.primary_need || "Other",
    amount,
    status,
    location: facility.location || facility.city || facility.country || "To be confirmed",
    verified: Boolean(facility.verified ?? facility.is_verified ?? false),
    description: facility.description || "Facility details synced from CareBridge.",
  };
}

const categoryColors = {
  Food: "from-teal-400 to-teal-500",
  Medical: "from-orange-400 to-orange-500",
  Education: "from-blue-400 to-blue-500",
  Shelter: "from-purple-400 to-purple-500",
  Clothing: "from-pink-400 to-pink-500",
};

const categoryIcons = {
  Food: "🍚",
  Medical: "❤️",
  Education: "📚",
  Shelter: "🏠",
  Clothing: "👕",
};

const statusBadgeClass = {
  Active: "bg-teal-50 text-teal-700",
  Matched: "bg-blue-50 text-blue-700",
  Fulfilled: "bg-gray-100 text-gray-600",
};

const urgencyOrder = {
  critical: 0,
  high: 1,
  medium: 2,
};

export {
  esc,
  fmt,
  formatTransactionDate,
  formatTransactionTime,
  timeAgo,
  verifiedBadge,
  urgencyBadge,
  normalizeUser,
  normalizeNeed,
  normalizeDonation,
  normalizeFulfillment,
  normalizeFacility,
  categoryColors,
  categoryIcons,
  statusBadgeClass,
  urgencyOrder,
};