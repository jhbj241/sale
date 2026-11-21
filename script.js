
// ─── DATA ───────────────────────────────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbwkf1eeR0U9Wg8PfkkrFMA8FwfamSPDfX6FKEOIcz08RgzE4yh9cCdL3rOBrbVM32R2/exec";

let customers = [];
let sales = [];


let currentCustomerFilter = 'all';
let currentExpiryDays = 3;

// ─── PLAN CONFIG ────────────────────────────────────────────
const PLANS = {
  '7days':  { label: '7 days',  days: 7,  price: 25 },
  '15days': { label: '15 days', days: 15, price: 50 },
  '30days': { label: '30 days', days: 30, price: 100 },
  '60days': { label: '60 days', days: 60, price: 190 },
  'custom': { label: 'Custom',  days: 0,  price: 0 }
};

function getPlanDays(plan, customDays) {
  if (plan === 'custom') return parseInt(customDays) || 30;
  return PLANS[plan]?.days || 30;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysLeft(expiryDate) {
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiryDate); exp.setHours(0,0,0,0);
  return Math.ceil((exp - today) / 86400000);
}

function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// One money format everywhere
function tk(n) { return '৳' + Math.round(n).toLocaleString(); }

// ─── NAVIGATION ─────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes(id)) n.classList.add('active');
  });
  if (id === 'dashboard') renderDashboard();
  if (id === 'customers') renderCustomers();
  if (id === 'sales') renderSales();
  if (id === 'revenue') renderRevenue();
  if (id === 'expiring') renderExpiry(currentExpiryDays);
}

// ─── MODAL ──────────────────────────────────────────────────
function openModal(type, id) {
  if (type === 'customer') {
    document.getElementById('edit-customer-id').value = id || '';
    document.getElementById('customer-modal-title').textContent = id ? 'Edit customer' : 'Add customer';
    if (id) {
      const c = customers.find(x => x.id === id);
      if (c) {
        document.getElementById('c-name').value = c.name;
        document.getElementById('c-contact').value = c.contact;
        document.getElementById('c-group').value = c.group || '';
        document.getElementById('c-group-id').value = c.groupId || '';
        document.getElementById('c-plan').value = c.plan;
        document.getElementById('c-price').value = c.price;
        document.getElementById('c-start').value = c.start;
        document.getElementById('c-expiry').value = c.expiry;
        document.getElementById('c-status').value = c.status;
        document.getElementById('c-payment').value = c.payment || 'bKash';
        document.getElementById('c-notes').value = c.notes || '';
        updatePlanPrice();
      }
    } else {
      document.getElementById('c-start').value = todayStr();
      updatePlanPrice();
    }
    document.getElementById('modal-customer').classList.add('open');
  }
  if (type === 'sale') {
    const sel = document.getElementById('s-customer');
    sel.innerHTML = customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    document.getElementById('s-date').value = todayStr();
    document.getElementById('modal-sale').classList.add('open');
  }
}

function closeModal(type) {
  document.getElementById('modal-' + type).classList.remove('open');
}

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

function updatePlanPrice() {
  const plan = document.getElementById('c-plan').value;
  const customRow = document.getElementById('custom-days-row');
  customRow.style.display = plan === 'custom' ? 'grid' : 'none';
  if (plan !== 'custom') document.getElementById('c-price').value = PLANS[plan].price;
  calcExpiry();
}

function calcExpiry() {
  const start = document.getElementById('c-start').value;
  const plan = document.getElementById('c-plan').value;
  const customDays = document.getElementById('c-custom-days').value;
  if (!start) return;
  const days = getPlanDays(plan, customDays);
  document.getElementById('c-expiry').value = addDays(start, days);
}

document.getElementById('c-start').addEventListener('input', calcExpiry);
document.getElementById('c-plan').addEventListener('change', calcExpiry);
document.getElementById('c-custom-days').addEventListener('input', calcExpiry);


// ─── SAVE CUSTOMER ───────────────────────────────────────────
async function saveCustomer() {
  const name = document.getElementById('c-name').value.trim();
  const contact = document.getElementById('c-contact').value.trim();
  const start = document.getElementById('c-start').value;

  if (!name || !contact || !start) {
    toast('Fill in the required fields', 'error');
    return;
  }

  const id = document.getElementById('edit-customer-id').value || Date.now().toString();

  const obj = {
    id,
    name,
    contact,
    group: document.getElementById('c-group').value.trim(),
    groupId: document.getElementById('c-group-id').value.trim(),
    plan: document.getElementById('c-plan').value,
    price: parseFloat(document.getElementById('c-price').value) || 0,
    start,
    expiry: document.getElementById('c-expiry').value,
    status: document.getElementById('c-status').value,
    payment: document.getElementById('c-payment').value,
    notes: document.getElementById('c-notes').value.trim(),
    customDays: document.getElementById('c-custom-days').value,
    createdAt: new Date().toISOString()
  };

  // ✅ FIX: define idx BEFORE using it
  const idx = customers.findIndex(x => x.id === id);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: new URLSearchParams({
        data: JSON.stringify({
          type: idx >= 0 ? "updateCustomer" : "addCustomer",
          data: obj
        })
      })
    });

    const result = await res.json();

    // update UI ONLY after success
    if (idx >= 0) customers[idx] = obj;
    else customers.push(obj);

    closeModal('customer');
    renderCustomers();
    renderDots();

    toast(idx >= 0 ? 'Customer updated' : 'Customer added', 'success');

  } catch (err) {
    console.error(err);
    toast('Failed to save customer', 'error');
  }
}

// ─── SAVE SALE ────────────────────────────────────────────────
async function saveSale() {
  const custId = document.getElementById('s-customer').value;
  const amount = parseFloat(document.getElementById('s-amount').value);
  const date = document.getElementById('s-date').value;

  if (!custId || !amount || !date) {
    toast('Fill in the required fields', 'error');
    return;
  }

  const saleData = {
    id: Date.now().toString(),
    custId,
    customerName: custName(custId),
    amount,
    date,
    month: date.slice(0, 7),
    method: document.getElementById('s-method').value,
    plan: document.getElementById('s-plan').value,
    txn: document.getElementById('s-txn').value.trim(),
    recordedAt: new Date().toISOString()
  };

  try {
    await fetch(API_URL, {
  method: "POST",
  body: new URLSearchParams({
    data: JSON.stringify({
      type: "addSale",
      data: saleData
    })
  })
});

    sales.push(saleData);

    closeModal('sale');
    renderSales();

    toast('Payment recorded', 'success');

  } catch (err) {
    console.error(err);
    toast('Failed to record sale', 'error');
  }
}

// ─── DELETE ───────────────────────────────────────────────────
async function deleteCustomer(id) {
  if (!confirm('Delete this customer?')) return;

  await fetch(API_URL, {
    method: "POST",
    body: new URLSearchParams({
      data: JSON.stringify({
        type: "deleteCustomer",
        data: { id }
      })
    })
  });

  customers = customers.filter(c => c.id !== id);
  renderCustomers();
  renderDots();
  toast('Customer deleted');
}

async function deleteSale(id) {
  if (!confirm('Delete this sale record?')) return;

  await fetch(API_URL, {
    method: "POST",
    body: new URLSearchParams({
      data: JSON.stringify({
        type: "deleteSale",
        data: { id }
      })
    })
  });

  sales = sales.filter(s => s.id !== id);
  renderSales();
  toast('Sale deleted');
}

function toggleApproval(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  if (c.status === 'Active') c.status = 'Pending';
  else if (c.status === 'Pending' || c.status === 'Approved') c.status = 'Active';
  save(); renderCustomers(); renderDots();
}

// ─── RENDER HELPERS ──────────────────────────────────────────
function statusBadge(s) {
  const map = { Active:'badge-active', Pending:'badge-pending', Expired:'badge-expired', Approved:'badge-approved' };
  return `<span class="badge ${map[s]||'badge-pending'}">${s}</span>`;
}

// Signature: days-left meter
function expiryBar(expiry) {
  if (!expiry) return '—';
  const dl = daysLeft(expiry);
  let color = 'var(--green)', pct = Math.min(100, Math.max(0, (dl/30)*100));
  if (dl <= 0) { color = 'var(--red)'; pct = 100; }
  else if (dl <= 3) color = 'var(--red)';
  else if (dl <= 7) color = 'var(--amber)';
  const label = dl < 0 ? 'Expired' : dl === 0 ? 'Today' : `${dl}d left`;
  return `<div class="expiry-bar-wrap"><div class="expiry-bar"><div class="expiry-fill" style="width:${pct}%;background:${color}"></div></div><span class="expiry-label">${label}</span></div>`;
}

function planPill(plan) {
  return `<span class="plan-pill">${PLANS[plan]?.label || plan}</span>`;
}

function custName(id) {
  return customers.find(c => c.id === id)?.name || 'Unknown';
}

const ICON_USERS = '<svg class="i" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const ICON_CLOCK = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const ICON_RECEIPT = '<svg class="i" viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>';

// ─── RENDER DASHBOARD ────────────────────────────────────────
function renderDashboard() {
  const active = customers.filter(c => c.status === 'Active').length;
  const pending = customers.filter(c => c.status === 'Pending').length;
  const expiring3 = customers.filter(c => c.status === 'Active' && daysLeft(c.expiry) <= 3 && daysLeft(c.expiry) >= 0).length;
  const thisMonth = new Date().toISOString().slice(0,7);
  const monthRev = sales.filter(s => s.month === thisMonth).reduce((a,b) => a + b.amount, 0);

  document.getElementById('dash-period').textContent = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-monthly').textContent = tk(monthRev);
  document.getElementById('stat-expiring').textContent = expiring3;
  document.getElementById('stat-pending').textContent = pending;

  // Revenue chart: current month in the accent, the rest neutral
  const months = {}; sales.forEach(s => { months[s.month] = (months[s.month]||0) + s.amount; });
  const sorted = Object.entries(months).sort().slice(-6);
  const chart = document.getElementById('revenue-chart');
  if (sorted.length === 0) { chart.innerHTML = `<div class="empty" style="width:100%;align-self:center">${ICON_RECEIPT}<p>No sales yet</p></div>`; }
  else {
    const max = Math.max(...sorted.map(x=>x[1]));
    const months2 = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    chart.innerHTML = sorted.map(([m, v]) => {
      const h = max > 0 ? Math.round((v/max)*100) : 0;
      return `<div class="bar-col"><div class="bar${m === thisMonth ? ' now' : ''}" style="height:${h}%" title="${tk(v)}"><span class="bar-val">${tk(v)}</span><span class="bar-label">${months2[parseInt(m.slice(5))]}</span></div></div>`;
    }).join('');
  }

  // Expiring list
  const expList = customers.filter(c => c.status === 'Active' && daysLeft(c.expiry) <= 7 && daysLeft(c.expiry) >= 0)
    .sort((a,b) => daysLeft(a.expiry) - daysLeft(b.expiry)).slice(0, 5);
  const expEl = document.getElementById('dash-expiring-list');
  if (expList.length === 0) expEl.innerHTML = `<div class="empty compact">${ICON_CLOCK}<p>Nobody expires this week</p></div>`;
  else expEl.innerHTML = expList.map(c => `<div class="mini-row">
      <div><div class="td-name">${c.name}</div><div class="td-muted">${c.group||c.contact}</div></div>
      ${expiryBar(c.expiry)}
    </div>`).join('');

  // Recent sales
  const recent = [...sales].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  const rsEl = document.getElementById('dash-recent-sales');
  if (recent.length === 0) rsEl.innerHTML = `<div class="empty">${ICON_RECEIPT}<p>No sales recorded yet</p></div>`;
  else rsEl.innerHTML = `<table><thead><tr><th>Customer</th><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>
    ${recent.map(s => `<tr><td class="td-name">${custName(s.custId)}</td><td class="td-meta">${fmtDate(s.date)}</td><td>${s.method}</td><td class="num">${tk(s.amount)}</td></tr>`).join('')}
  </tbody></table>`;
}

// ─── RENDER CUSTOMERS ────────────────────────────────────────
function renderCustomers() {
  let list = [...customers];
  if (currentCustomerFilter !== 'all') list = list.filter(c => c.status === currentCustomerFilter);
  const q = document.getElementById('customer-search')?.value?.toLowerCase() || '';
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.contact.includes(q) || (c.group||'').toLowerCase().includes(q));
  const el = document.getElementById('customers-table');
  if (list.length === 0) { el.innerHTML = `<div class="empty">${ICON_USERS}<p>No customers found</p></div>`; return; }
  el.innerHTML = `<table><thead><tr><th>Name</th><th>Group</th><th>Plan</th><th class="num">Price</th><th>Expiry</th><th>Status</th><th>Approved</th><th></th></tr></thead><tbody>
    ${list.map(c => `<tr>
      <td><div class="td-name">${c.name}</div><div class="td-muted mono">${c.contact}</div></td>
      <td>${c.group||'—'}</td>
      <td>${planPill(c.plan)}</td>
      <td class="num">${tk(c.price)}</td>
      <td>${expiryBar(c.expiry)}</td>
      <td>${statusBadge(c.status)}</td>
      <td><div class="toggle-wrap"><button class="toggle ${c.status==='Active'?'on':''}" onclick="toggleApproval('${c.id}')" aria-label="Approve ${c.name}" aria-pressed="${c.status==='Active'}"></button><span>${c.status==='Active'?'On':'Off'}</span></div></td>
      <td><div class="actions">
        <button class="btn btn-quiet btn-sm" onclick="openModal('customer','${c.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCustomer('${c.id}')">Delete</button>
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function filterCustomers(f) {
  currentCustomerFilter = f;
  document.querySelectorAll('#customer-tabs .tab').forEach((t,i) => {
    t.classList.toggle('active', ['all','Active','Pending','Expired'][i] === f);
  });
  renderCustomers();
}

// ─── RENDER SALES ────────────────────────────────────────────
function renderSales() {
  const list = [...sales].sort((a,b) => b.date.localeCompare(a.date));
  const el = document.getElementById('sales-table');
  if (list.length === 0) { el.innerHTML = `<div class="empty">${ICON_RECEIPT}<p>No sales yet. Use Record sale to add the first payment.</p></div>`; return; }
  el.innerHTML = `<table><thead><tr><th>Customer</th><th>Date</th><th>Plan</th><th>Method</th><th>Transaction ID</th><th class="num">Amount</th><th></th></tr></thead><tbody>
    ${list.map(s => `<tr>
      <td class="td-name">${custName(s.custId)}</td>
      <td class="td-meta">${fmtDate(s.date)}</td>
      <td>${planPill(s.plan)}</td>
      <td>${s.method}</td>
      <td class="td-meta">${s.txn||'—'}</td>
      <td class="num">${tk(s.amount)}</td>
      <td><div class="actions"><button class="btn btn-danger btn-sm" onclick="deleteSale('${s.id}')">Delete</button></div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

// ─── RENDER REVENUE ──────────────────────────────────────────
function renderRevenue() {
  const total = sales.reduce((a,b)=>a+b.amount,0);
  const thisMonth = new Date().toISOString().slice(0,7);
  const monthRev = sales.filter(s=>s.month===thisMonth).reduce((a,b)=>a+b.amount,0);
  const active = customers.filter(c=>c.status==='Active');
  const expected = active.reduce((a,c)=>{
    const days = getPlanDays(c.plan, c.customDays);
    return a + (c.price / days * 30);
  }, 0);
  const avg = active.length > 0 ? total / active.length : 0;
  document.getElementById('rev-total').textContent = tk(total);
  document.getElementById('rev-month').textContent = tk(monthRev);
  document.getElementById('rev-expected').textContent = tk(expected);
  document.getElementById('rev-avg').textContent = tk(avg);
  const months2 = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('rev-month-label').textContent = months2[parseInt(thisMonth.slice(5))] + ' ' + thisMonth.slice(0,4);

  const byMonth = {}; sales.forEach(s => {
    if (!byMonth[s.month]) byMonth[s.month] = {total:0, count:0};
    byMonth[s.month].total += s.amount; byMonth[s.month].count++;
  });
  const rows = Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0]));
  const el = document.getElementById('rev-table');
  if (rows.length === 0) { el.innerHTML = `<div class="empty">${ICON_RECEIPT}<p>No revenue yet</p></div>`; return; }
  el.innerHTML = `<table><thead><tr><th>Month</th><th class="num">Payments</th><th class="num">Avg per sale</th><th class="num">Revenue</th></tr></thead><tbody>
    ${rows.map(([m,v])=>{
      const [y,mo]=m.split('-');
      return `<tr><td>${months2[parseInt(mo)]} ${y}</td><td class="num">${v.count}</td><td class="num">${tk(v.total/v.count)}</td><td class="num">${tk(v.total)}</td></tr>`;
    }).join('')}
  </tbody></table>`;
}

// ─── RENDER EXPIRY ────────────────────────────────────────────
function renderExpiry(days) {
  currentExpiryDays = days;
  document.querySelectorAll('#expiry-tabs .tab').forEach((t,i)=>{
    t.classList.toggle('active', [3,7,30][i]===days);
  });
  const list = customers.filter(c => c.status==='Active' && daysLeft(c.expiry) <= days && daysLeft(c.expiry) >= 0)
    .sort((a,b) => daysLeft(a.expiry) - daysLeft(b.expiry));
  const el = document.getElementById('expiry-list');
  if (list.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty">${ICON_CLOCK}<p>Nobody expires in the next ${days} days</p></div></div>`;
    return;
  }
  el.innerHTML = list.map(c => {
    const dl = daysLeft(c.expiry);
    const urgency = dl <= 1 ? 'var(--red)' : dl <= 3 ? 'var(--amber)' : 'var(--text)';
    const count = dl === 0
      ? `<span class="cd-num" style="color:${urgency}">Today</span>`
      : `<span class="cd-num" style="color:${urgency}">${dl}</span><span class="cd-unit">${dl === 1 ? 'day' : 'days'} left</span>`;
    return `<div class="card renew-card${dl<=3?' urgent':''}">
      <div class="renew-top">
        <div class="renew-who">
          <div class="initial">${c.name[0]}</div>
          <div>
            <div class="renew-name">${c.name}</div>
            <div class="td-muted">${c.group||c.contact}</div>
          </div>
        </div>
        <div class="countdown">
          <div>${count}</div>
          <div class="td-meta">Expires ${fmtDate(c.expiry)}</div>
        </div>
      </div>
      <div class="renew-foot">
        ${planPill(c.plan)}
        <span class="mono">${tk(c.price)}</span>
        <span class="mono">${c.contact}</span>
        <div class="actions">
          <button class="btn btn-quiet btn-sm" onclick="openModal('customer','${c.id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="openModal('sale')">Record renewal</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterExpiry(days) { renderExpiry(days); }

// ─── DOTS & NOTIFICATIONS ────────────────────────────────────
function renderDots() {
  const pending = customers.filter(c=>c.status==='Pending').length;
  const expiring = customers.filter(c=>c.status==='Active' && daysLeft(c.expiry)<=3 && daysLeft(c.expiry)>=0).length;
  document.getElementById('pending-dot').style.display = pending > 0 ? 'inline-block' : 'none';
  document.getElementById('expiring-dot').style.display = expiring > 0 ? 'inline-block' : 'none';
}

// ─── TOAST ───────────────────────────────────────────────────
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type==='success'?' success':'');
  setTimeout(()=>el.classList.remove('show'), 2500);
}

// ─── SIDEBAR DATE ─────────────────────────────────────────────
function setDate() {
  const d = new Date();
  document.getElementById('sidebar-date').textContent = d.toLocaleDateString('en-BD', {weekday:'short',day:'numeric',month:'short',year:'numeric'});
}

// ─── AUTO EXPIRE ─────────────────────────────────────────────
function autoExpire() {
  customers.forEach(c => {
    if (c.status === 'Active' && daysLeft(c.expiry) < 0) c.status = 'Expired';
  });
}

// ─── INIT ────────────────────────────────────────────────────
async function loadData() {
  const res = await fetch(API_URL);
  const data = await res.json();

  // ✅ FIXED MAPPING HERE
  customers = (data.customers || []).map(c => ({
    id: String(c.ID),
    name: c.FullName,
    contact: String(c.Phone),
    group: c.GroupChatName,
    groupId: String(c.GroupChatID),
    plan: c.Plan,
    price: Number(c.Price),
    start: c.StartDate?.split('T')[0],
    expiry: c.ExpiryDate?.split('T')[0],
    status: c.Status,
    payment: c.PaymentMethod,
    notes: c.Notes,
    createdAt: c.CreatedAt,
    customDays: null
  }));

  sales = (data.sales || []).map(s => {
    const cust = customers.find(c => c.name === s.CustomerName);
    return {
      id: String(s.ID),
      custId: cust?.id || null,
      customerName: s.CustomerName,
      amount: Number(s.Amount),
      date: s.PaymentDate?.split('T')[0],
      month: s.PaymentDate?.slice(0,7),
      method: s.PaymentMethod,
      plan: s.PlanPeriod,
      txn: s.TransactionID,
      recordedAt: s.RecordedAt
    };
  });

  renderDashboard();
  renderCustomers();
  renderSales();
  renderDots();
}

setDate();
loadData();
