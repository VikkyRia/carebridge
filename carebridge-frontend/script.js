const pages = Array.from(document.querySelectorAll('.page'));

function showPage(pageId) {
  pages.forEach(page => {
    page.classList.toggle('active', page.id === pageId);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
}

function switchTab(tab) {
  const fundTab = document.getElementById('tab-fund');
  const deliverTab = document.getElementById('tab-deliver');
  const fundPanel = document.getElementById('fund-panel');
  const deliverPanel = document.getElementById('deliver-panel');

  if (fundTab && deliverTab) {
    fundTab.classList.toggle('active', tab === 'fund');
    deliverTab.classList.toggle('active', tab === 'deliver');
  }
  if (fundPanel && deliverPanel) {
    fundPanel.style.display = tab === 'fund' ? 'block' : 'none';
    deliverPanel.style.display = tab === 'deliver' ? 'block' : 'none';
  }
}

function updateSummary() {
  const amount = Number(document.getElementById('custom-amount')?.value) || 0;
  const fee = Math.round(amount * 0.015);
  const total = amount + fee;

  const facilityEl = document.getElementById('sum-facility');
  const feeEl = document.getElementById('sum-fee');
  const donationEl = document.getElementById('sum-donation');

  if (facilityEl) facilityEl.textContent = `₦${amount.toLocaleString()}`;
  if (feeEl) feeEl.textContent = `₦${fee.toLocaleString()}`;
  if (donationEl) donationEl.textContent = `₦${total.toLocaleString()}`;
}

function handleDeliverCommit() {
  const step1 = document.getElementById('deliver-step-1');
  const step2 = document.getElementById('deliver-step-2');
  if (step1 && step2) {
    step1.style.display = 'none';
    step2.style.display = 'block';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateSummary();
  switchTab('fund');
});
