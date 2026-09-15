import { CATEGORIES, digits, minor, feeTotal, splitBill, tokyoMillis, schedule, summary, safeURL } from './domain.js';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const demo = new URLSearchParams(location.search).get('demo') === '1';
let service, user, role = 'none', editing = false, unsubs = [], epoch = 0;
let plans = [], costs = [], settings = null, filter = 'next', selectedDays = new Set(), map, markers, charts = [], editorState, secondaryResolve;
let ready = new Set(), toastTimer, draggingId, busy = false;
const name = id => settings?.members.find(m => m.id === id)?.name || id;
const money = (amount, currency = 'THB') => new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: digits(currency), maximumFractionDigits: digits(currency) }).format(amount / 10 ** digits(currency));
const time = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(ms);
const dayLabel = day => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(day + 'T12:00:00+09:00'));
const sorted = () => [...plans].sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order);
const canEdit = () => !!settings && editing && ['editor', 'admin'].includes(role);
function requireEdit() { if (!canEdit()) throw Error('กรุณาปลดล็อกโหมดแก้ไข'); }
function toast(message, loading = false, error = false) {
  clearTimeout(toastTimer); $('#toast').hidden = false; $('#toast').classList.toggle('loading', loading); $('#toast').classList.toggle('error', error); $('#toast-message').textContent = message;
  if (!loading) toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 8000 : 3500);
}
function errorMessage(error) {
  console.error(error);
  const code = error.code || '';
  if (code.includes('permission-denied') || code.includes('unauthorized')) return 'ไม่มีสิทธิ์เข้าถึง ตรวจสอบสมาชิกและ Firebase Rules';
  if (code.includes('auth/')) return 'เข้าสู่ระบบไม่สำเร็จ ตรวจสอบบัญชี รหัสผ่าน และการตั้งค่า Authentication';
  if (code.includes('unavailable') || code.includes('network')) return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}
async function action(fn) {
  if (busy) return;
  busy = true; toast('ฟูจิกำลังบันทึก…', true);
  try { await fn(); toast('บันทึกเรียบร้อยแล้ว'); } catch (e) { toast(errorMessage(e), false, true); } finally { busy = false; }
}
function updateAccess() {
  $$('.edit-only').forEach(el => { el.disabled = !canEdit(); });
  $('#mode-badge').textContent = editing ? 'โหมดแก้ไข' : 'อ่านอย่างเดียว';
  $('#edit-toggle').textContent = editing ? 'ล็อกการแก้ไข' : 'ปลดล็อกแก้ไข';
  $('#logout').hidden = !user; $('#welcome').hidden = !!user;
  $('#admin-nav').hidden = !canEdit(); $('#admin-open').hidden = !canEdit();
  if (!canEdit() && !$('#view-admin').hidden) showTab('plans');
}
function showTab(tab) {
  if (tab === 'admin' && !canEdit()) return;
  $$('.view').forEach(v => { v.hidden = v.id !== `view-${tab}`; });
  $$('.nav').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'plans') setTimeout(() => { ensureMap(); map?.invalidateSize(); updateMap(); }, 30);
}
$$('[data-tab]').forEach(button => button.onclick = () => showTab(button.dataset.tab));
$('#admin-open').onclick = () => showTab('admin');
$$('[data-close]').forEach(button => button.onclick = () => document.getElementById(button.dataset.close).close());
$('#demo-banner').hidden = !demo;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let snowOn = localStorage.getItem('fuji:snow') !== 'off' && !reducedMotion;
function paintSnow() {
  $('#snow').hidden = !snowOn; $('#snow-toggle').setAttribute('aria-pressed', String(snowOn));
  if (!$('#snow').children.length) for (let i = 0; i < 28; i++) { const flake = document.createElement('i'); flake.className = 'snowflake'; flake.style.cssText = `left:${Math.random() * 100}%;width:${2 + Math.random() * 4}px;height:${2 + Math.random() * 4}px;animation-duration:${12 + Math.random() * 15}s;animation-delay:-${Math.random() * 25}s`; $('#snow').append(flake); }
}
paintSnow();
$('#snow-toggle').onclick = () => { snowOn = !snowOn; localStorage.setItem('fuji:snow', snowOn ? 'on' : 'off'); paintSnow(); };
let dark = localStorage.getItem('fuji:theme') === 'dark';
function paintTheme() { document.body.dataset.theme = dark ? 'dark' : 'light'; $('#theme-toggle').setAttribute('aria-pressed', String(dark)); if (!$('#view-dashboard').hidden) renderDashboard(); }
paintTheme(); $('#theme-toggle').onclick = () => { dark = !dark; localStorage.setItem('fuji:theme', dark ? 'dark' : 'light'); paintTheme(); };
$('#login-open').onclick = () => $('#auth-dialog').showModal();
$('#auth-form').onsubmit = async event => {
  event.preventDefault(); const form = event.target, submit = form.querySelector('[type=submit]'); submit.disabled = true; $('#auth-error').textContent = '';
  try { if (!service) throw Error('โหลด Firebase SDK ไม่สำเร็จ กรุณารีเฟรช'); await service.login(form.email.value.trim(), form.password.value); form.reset(); $('#auth-dialog').close(); } catch (e) { $('#auth-error').textContent = errorMessage(e); } finally { submit.disabled = false; }
};
$('#logout').onclick = () => action(async () => { localStorage.removeItem(`fuji:unlocked:${user?.uid}`); editing = false; await service.logout(); });
const pinKey = () => `fuji:pin:${user?.uid}`;
$('#edit-toggle').onclick = () => {
  if (!user) { $('#auth-dialog').showModal(); return; }
  if (!['editor', 'admin'].includes(role)) { toast('บัญชีนี้อ่านข้อมูลได้อย่างเดียว', false, true); return; }
  if (editing) { localStorage.removeItem(`fuji:unlocked:${user.uid}`); editing = false; renderAll(); return; }
  $('#pin-title').textContent = localStorage.getItem(pinKey()) ? 'ปลดล็อกโหมดแก้ไข' : 'ตั้ง PIN สำหรับอุปกรณ์นี้';
  $('#pin-form').reset(); $('#pin-error').textContent = ''; $('#pin-dialog').showModal();
};
$('#pin-form').onsubmit = event => {
  event.preventDefault(); const pin = event.target.pin.value, saved = localStorage.getItem(pinKey());
  if (saved && pin !== saved) { $('#pin-error').textContent = 'PIN ไม่ถูกต้อง'; return; }
  localStorage.setItem(pinKey(), pin); localStorage.setItem(`fuji:unlocked:${user.uid}`, 'yes'); editing = true; $('#pin-dialog').close(); renderAll(); toast('เปิดโหมดแก้ไขแล้ว');
};
function confirmSensitive(reason) {
  if (role !== 'admin') { toast('รายการนี้ต้องใช้บัญชีผู้ดูแล', false, true); return Promise.resolve(false); }
  $('#security-reason').textContent = reason; $('#security-form').reset(); $('#security-error').textContent = ''; $('#security-dialog').showModal();
  return new Promise(resolve => { secondaryResolve = resolve; });
}
$('#security-dialog').addEventListener('close', () => { secondaryResolve?.(false); secondaryResolve = null; });
$('#security-form').onsubmit = async event => {
  event.preventDefault(); const submit = event.target.querySelector('[type=submit]'); submit.disabled = true;
  try { await service.secondary(event.target.password.value); secondaryResolve?.(true); secondaryResolve = null; $('#security-dialog').close(); } catch (e) { $('#security-error').textContent = errorMessage(e); } finally { submit.disabled = false; }
};
function visiblePlans() {
  const all = sorted();
  if (filter === 'all') return all;
  if (filter === 'days') return all.filter(p => selectedDays.has(p.day));
  const upcoming = all.filter(p => p.endMs > Date.now());
  return upcoming.length ? upcoming.filter(p => p.day === upcoming[0].day) : [];
}
$$('[data-filter]').forEach(button => button.onclick = () => {
  filter = button.dataset.filter;
  if (filter === 'days' && !selectedDays.size) selectedDays.add(sorted()[0]?.day);
  renderPlans();
});
function renderPlans() {
  $$('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  $('#day-filters').hidden = filter !== 'days';
  $('#day-filters').innerHTML = [...new Set(sorted().map(p => p.day))].map(day => `<label><input type="checkbox" value="${esc(day)}" ${selectedDays.has(day) ? 'checked' : ''}>${esc(dayLabel(day))}</label>`).join('');
  $$('#day-filters input').forEach(input => input.onchange = () => { input.checked ? selectedDays.add(input.value) : selectedDays.delete(input.value); renderPlans(); });
  const shown = visiblePlans(); $('#plan-count').textContent = `${shown.length} สถานที่${filter === 'next' ? ' · วันเดินทางถัดไป' : ''}`;
  $('#plan-list').innerHTML = shown.length ? shown.map(p => `<article class="plan-card" data-id="${esc(p.id)}" draggable="${canEdit()}"><div class="plan-top"><span aria-hidden="true">◷</span><span class="time">${time(p.startMs)} — ${time(p.endMs)}</span><span class="day">${esc(dayLabel(p.day))}${new Date(p.endMs + 32400000).toISOString().slice(0, 10) !== p.day ? ' (+1 วัน)' : ''}</span></div><div class="plan-body">${safeURL(p.imageUrl) ? `<img class="place-thumb" src="${esc(safeURL(p.imageUrl))}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="place-fallback"><span class="fuji" aria-hidden="true"><i></i></span></div>'}<div><h3>${esc(p.title)}</h3><p class="location">⌖ ${esc(p.location)}</p><p class="muted">${esc(p.notes)}</p><p class="muted">พัก ${p.durationMin} นาที · เดินทางต่อ ${p.travelMin} นาที</p></div></div><div class="plan-actions"><button class="expense-link" data-op="expense" ${canEdit() ? '' : 'disabled'}>＋ เพิ่มค่าใช้จ่าย</button><button data-op="edit" ${canEdit() ? '' : 'disabled'}>แก้ไข</button><button data-op="up" aria-label="เลื่อนขึ้น" ${canEdit() ? '' : 'disabled'}>↑</button><button data-op="down" aria-label="เลื่อนลง" ${canEdit() ? '' : 'disabled'}>↓</button><button data-op="map">⌖ แผนที่</button></div></article>`).join('') : `<div class="empty">${user ? 'ยังไม่มีสถานที่ในช่วงที่เลือก' : 'เข้าสู่ระบบ หรือเปิดโหมดทดลองเพื่อเริ่มดูแผน'}${filter === 'next' && plans.length ? '<br>ทริปจบแล้ว เลือก “ทั้งหมด” เพื่อดูย้อนหลัง' : ''}</div>`;
  $$('.place-thumb').forEach(img => img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'place-fallback', textContent: '🗻' })); });
  $$('.plan-card').forEach(card => {
    const p = plans.find(row => row.id === card.dataset.id);
    card.querySelectorAll('[data-op]').forEach(b => b.onclick = () => {
      if (b.dataset.op === 'expense') openCost(null, p.id);
      if (b.dataset.op === 'edit') openPlan(p);
      if (b.dataset.op === 'up') movePlan(p.id, -1);
      if (b.dataset.op === 'down') movePlan(p.id, 1);
      if (b.dataset.op === 'map') { ensureMap(); if (map && Number.isFinite(p.lat) && Number.isFinite(p.lng)) { map.setView([p.lat, p.lng], 14); $('#map').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }); } else toast('สถานที่นี้ยังไม่มีพิกัด'); }
    });
    card.ondragstart = e => { if (!canEdit()) { e.preventDefault(); return; } draggingId = p.id; e.dataTransfer.setData('text/plain', p.id); card.classList.add('dragging'); };
    card.ondragend = () => { draggingId = null; card.classList.remove('dragging'); $$('.drag-over').forEach(c => c.classList.remove('drag-over')); };
    card.ondragover = e => { if (canEdit()) { e.preventDefault(); card.classList.add('drag-over'); } };
    card.ondragleave = () => card.classList.remove('drag-over');
    card.ondrop = e => { e.preventDefault(); card.classList.remove('drag-over'); if (draggingId) reorderTo(draggingId, p.id); };
  });
  ensureMap(); updateMap(); tick();
}
function ensureMap() {
  if (map || !window.L || $('#view-plans').hidden) return;
  map = L.map('map').setView([35.52, 138.77], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  markers = L.featureGroup().addTo(map);
}
function updateMap() {
  if (!map) return; markers.clearLayers();
  visiblePlans().forEach(p => { if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) { const content = document.createElement('span'); content.textContent = `${time(p.startMs)} · ${p.title}`; L.marker([p.lat, p.lng]).bindPopup(content).addTo(markers); } });
  if (markers.getLayers().length) map.fitBounds(markers.getBounds(), { padding: [25, 25], maxZoom: 13 });
}
function tick() {
  for (const [id, zone] of [['bkk', 'Asia/Bangkok'], ['tokyo', 'Asia/Tokyo']]) { $(`#${id}`).textContent = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()); $(`#${id}-date`).textContent = new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: '2-digit', month: 'short' }).format(new Date()); }
  const current = sorted().find(p => p.startMs <= Date.now() && p.endMs > Date.now());
  $('#current-stop').hidden = !current;
  if (current) {
    const seconds = Math.max(0, Math.ceil((current.endMs - Date.now()) / 1000));
    $('#current-stop').innerHTML = `<small>ตอนนี้ · ${esc(current.title)}</small><b>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} นาที</b><span>ก่อนออกเดินทางไปต่อ</span>`;
    const alertKey = `fuji:alert:${current.id}:${current.endMs}`;
    if (seconds <= 900 && !sessionStorage.getItem(alertKey) && !document.querySelector('dialog[open]')) { sessionStorage.setItem(alertKey, '1'); $('#alert-message').textContent = `${current.title} สิ้นสุดเวลา ${time(current.endMs)} น. (ญี่ปุ่น)`; $('#alert-dialog').showModal(); }
  }
}
setInterval(tick, 1000); tick();
setInterval(() => { if (filter === 'next' && plans.length && !document.querySelector('dialog[open]') && !draggingId) renderPlans(); }, 30000);
function renderCosts() {
  const open = new Set($$('#cost-list details[open]').map(d => d.dataset.category));
  $('#cost-list').innerHTML = Object.entries(CATEGORIES).map(([category, label]) => {
    const rows = costs.filter(c => c.category === category);
    return `<details class="category" data-category="${category}" ${open.has(category) ? 'open' : ''}><summary>${label}<span>${rows.length} รายการ</span></summary><div>${rows.length ? rows.map(c => `<div class="expense-row"><div><b>${esc(c.title)}</b><p class="muted">${esc(name(c.payerId))} จ่าย · ${c.paymentMethod === 'card' ? esc(c.cardName) : 'เงินสด'}${c.planId ? ` · ${esc(plans.find(p => p.id === c.planId)?.title || 'สถานที่ถูกลบแล้ว')}` : ''}</p><p>${money(c.totalMinor, c.currency)} <small class="muted">รวมค่าธรรมเนียม ${money(c.feeMinor, c.currency)}</small></p></div><div class="actions">${safeURL(c.receiptUrl) ? `<a href="${esc(safeURL(c.receiptUrl))}" target="_blank" rel="noopener noreferrer">ดูสลิป ↗</a>` : ''}<button data-cost="${esc(c.id)}" ${canEdit() ? '' : 'disabled'}>แก้ไข</button><button class="danger" data-delete-cost="${esc(c.id)}" ${canEdit() && role === 'admin' ? '' : 'disabled'}>ลบ</button></div></div>`).join('') : '<p class="muted">ยังไม่มีค่าใช้จ่ายในหมวดนี้</p>'}</div></details>`;
  }).join('');
  $$('[data-cost]').forEach(b => b.onclick = () => openCost(costs.find(c => c.id === b.dataset.cost)));
  $$('[data-delete-cost]').forEach(b => b.onclick = async () => { const row = structuredClone(costs.find(c => c.id === b.dataset.deleteCost)); if (await confirmSensitive(`ลบ “${row.title}” ถาวร?`)) action(async () => { requireEdit(); await service.removeCost(row); }); });
}
function renderDashboard() {
  if (!settings) return;
  const data = summary(costs, settings.members);
  $('#stats').innerHTML = `<div class="stat"><span>ค่าใช้จ่ายทั้งหมด</span><b>${money(data.total)}</b></div><div class="stat"><span>บิลในทริป</span><b>${costs.length} <small>รายการ</small></b></div><div class="stat"><span>เพื่อนร่วมทาง</span><b>${settings.members.length} <small>คน</small></b></div>`;
  charts.forEach(c => c.destroy()); charts = [];
  if (window.Chart) {
    Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--muted');
    const options = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Noto Sans Thai' } } } } };
    charts.push(new Chart($('#category-chart'), { type: 'doughnut', data: { labels: Object.keys(data.categories).map(k => CATEGORIES[k]), datasets: [{ data: Object.values(data.categories).map(v => v / 100), backgroundColor: ['#276671', '#e98663', '#75b1ac', '#deb667', '#899ab9', '#b9d8d2'], borderWidth: 0 }] }, options }));
    charts.push(new Chart($('#people-chart'), { type: 'bar', data: { labels: Object.keys(data.people).map(name), datasets: [{ label: 'ยอดใช้ส่วนตัว (บาท)', data: Object.values(data.people).map(p => p.owed / 100), backgroundColor: '#40808a', borderRadius: 6 }, { label: 'จ่ายไปแล้ว (บาท)', data: Object.values(data.people).map(p => p.paid / 100), backgroundColor: '#e98663', borderRadius: 6 }] }, options: { ...options, scales: { y: { beginAtZero: true } } } }));
  }
  $('#card-summary').innerHTML = data.cards.length ? data.cards.map(c => `<div class="summary-row"><span>${esc(c.name)} <small class="muted">${esc(name(c.payerId))}</small></span><span>${money(c.thb)}<br><small class="muted">${money(c.JPY, 'JPY')} / ${money(c.THB)}</small></span></div>`).join('') : '<p class="muted">ยังไม่มียอดบัตรเครดิต</p>';
  $('#settlements').innerHTML = data.transfers.length ? data.transfers.map(t => `<div class="summary-row"><span>${esc(name(t.from))} → ${esc(name(t.to))}</span><b>${money(t.amount)}</b></div>`).join('') : '<p class="muted">ไม่มียอดค้างระหว่างเพื่อน</p>';
  const selected = $('#person-select').value;
  $('#person-select').innerHTML = Object.keys(data.people).map(id => `<option value="${esc(id)}">${esc(name(id))}</option>`).join('');
  if (data.people[selected]) $('#person-select').value = selected;
  renderPerson();
}
function renderPerson() {
  if (!settings) return;
  const id = $('#person-select').value, data = summary(costs, settings.members), p = data.people[id];
  if (!p) { $('#person-export').innerHTML = ''; return; }
  $('#person-export').innerHTML = `<h3>Japan 2027 · ${esc(name(id))}</h3><div class="stats"><div class="stat"><span>ส่วนที่ใช้</span><b>${money(p.owed)}</b></div><div class="stat"><span>จ่ายไปแล้ว</span><b>${money(p.paid)}</b></div><div class="stat"><span>${p.balance >= 0 ? 'ต้องได้รับคืน' : 'ต้องจ่ายเพิ่ม'}</span><b>${money(Math.abs(p.balance))}</b></div></div><div class="chart-box"><canvas id="individual-chart"></canvas></div>${costs.filter(c => id in c.shares).map(c => `<div class="summary-row"><span>${esc(c.title)}</span><span>${money(c.shares[id], c.currency)}</span></div>`).join('')}`;
  if (window.Chart) { const categories = {}; costs.filter(c => id in c.shares).forEach(c => { categories[c.category] = (categories[c.category] || 0) + (c.currency === 'JPY' ? c.shares[id] * c.exchangeRate : c.shares[id] / 100); }); const old = charts.find(c => c.canvas?.id === 'individual-chart'); if (old) { old.destroy(); charts = charts.filter(c => c !== old); } charts.push(new Chart($('#individual-chart'), { type: 'bar', data: { labels: Object.keys(categories).map(k => CATEGORIES[k]), datasets: [{ label: 'ค่าใช้จ่ายแยกหมวด (บาท)', data: Object.values(categories), backgroundColor: '#40808a', borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { y: { beginAtZero: true } } } })); }
}
$('#person-select').onchange = renderPerson;
async function exportPNG(selector, filename) {
  if (!settings || !window.html2canvas) { toast('ยังไม่พร้อมส่งออก ตรวจสอบการเชื่อมต่อ', false, true); return; }
  try { toast('กำลังสร้างภาพสรุป…', true); await document.fonts.ready; const canvas = await html2canvas($(selector), { scale: 2, backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg').trim(), useCORS: true }); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw Error('สร้าง PNG ไม่สำเร็จ'); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('บันทึกภาพเรียบร้อย'); } catch (e) { toast(errorMessage(e), false, true); }
}
$('#export-overview').onclick = () => exportPNG('#overview-export', 'fuji-overview.png');
$('#export-person').onclick = () => exportPNG('#person-export', `fuji-person-${$('#person-select').value}.png`);
function renderAdmin() {
  $('#admin-rows').innerHTML = sorted().map(p => `<tr><td>${esc(p.day)} / ${p.order + 1}</td><td>${esc(p.title)}</td><td>${time(p.startMs)}</td><td>${p.durationMin} / ${p.travelMin} นาที</td><td><button data-admin-edit="${esc(p.id)}">แก้ไข</button><button data-admin-up="${esc(p.id)}">↑</button><button data-admin-down="${esc(p.id)}">↓</button><button class="danger" data-admin-delete="${esc(p.id)}" ${role === 'admin' ? '' : 'disabled'}>ลบ</button></td></tr>`).join('');
  $$('[data-admin-edit]').forEach(b => b.onclick = () => openPlan(plans.find(p => p.id === b.dataset.adminEdit)));
  $$('[data-admin-up]').forEach(b => b.onclick = () => movePlan(b.dataset.adminUp, -1));
  $$('[data-admin-down]').forEach(b => b.onclick = () => movePlan(b.dataset.adminDown, 1));
  $$('[data-admin-delete]').forEach(b => b.onclick = async () => {
    const p = plans.find(row => row.id === b.dataset.adminDelete), version = settings.scheduleVersion, snapshot = structuredClone(sorted());
    if (await confirmSensitive(`ลบ “${p.title}” และปรับเวลาที่เหลือในวันนี้? บิลเดิมจะยังเก็บไว้`)) action(async () => { requireEdit(); const dayRows = snapshot.filter(r => r.day === p.day), left = dayRows.filter(r => r.id !== p.id); const updated = left.length ? schedule(left, dayRows[0].startMs) : []; await service.saveSchedule([...snapshot.filter(r => r.day !== p.day), ...updated], [p.id], version); });
  });
  if (settings && !$('#settings-form').contains(document.activeElement)) { const f = $('#settings-form'); f.elements.namedItem('title').value = settings.title; f.exchangeRate.value = settings.exchangeRate; f.members.value = settings.members.map(m => `${m.id}:${m.name}`).join('\n'); }
}
function renderAll() { renderPlans(); renderCosts(); renderAdmin(); updateAccess(); if (!$('#view-dashboard').hidden) renderDashboard(); }
function movePlan(id, delta) { const p = plans.find(r => r.id === id), rows = sorted().filter(r => r.day === p.day), i = rows.findIndex(r => r.id === id); if (rows[i + delta]) reorderTo(id, rows[i + delta].id); }
function reorderTo(id, target) {
  if (id === target) return;
  action(async () => { requireEdit(); const rows = sorted(), p = rows.find(r => r.id === id), other = rows.find(r => r.id === target); if (!p || !other || p.day !== other.day) throw Error('ลากย้ายได้ภายในวันเดียวกัน เปลี่ยนวันผ่านฟอร์มแก้ไข'); const dayRows = rows.filter(r => r.day === p.day), start = dayRows[0].startMs, from = dayRows.findIndex(r => r.id === id), to = dayRows.findIndex(r => r.id === target); dayRows.splice(to, 0, dayRows.splice(from, 1)[0]); await service.saveSchedule([...rows.filter(r => r.day !== p.day), ...schedule(dayRows, start)], [], settings.scheduleVersion); });
}
const input = (label, field, value = '', type = 'text', attrs = '') => `<label>${label}<input name="${field}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
function openPlan(row = null) {
  if (!canEdit()) return;
  editorState = { kind: 'plan', row: row ? structuredClone(row) : null, version: settings.scheduleVersion, snapshot: structuredClone(sorted()) };
  const p = row || { day: '2027-02-12', durationMin: 60, travelMin: 15 };
  $('#editor-title').textContent = row ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่';
  $('#editor-fields').innerHTML = input('ชื่อสถานที่', 'title', p.title, 'text', 'required maxlength="120"') + input('ตำแหน่ง / ย่าน', 'location', p.location, 'text', 'maxlength="160"') + `<div class="form-grid">${input('วันเดินทาง', 'day', p.day, 'date', 'required')}${input('เวลาเริ่ม (Tokyo)', 'start', p.startMs ? time(p.startMs) : '09:00', 'time', 'required')}${input('ใช้เวลา (นาที)', 'durationMin', p.durationMin, 'number', 'min="1" max="1440" step="1" required')}${input('เดินทางต่อ (นาที)', 'travelMin', p.travelMin, 'number', 'min="0" max="1440" step="1" required')}${input('ละติจูด', 'lat', p.lat, 'number', 'min="-90" max="90" step="any"')}${input('ลองจิจูด', 'lng', p.lng, 'number', 'min="-180" max="180" step="any"')}</div>` + input('URL รูปภาพ (HTTPS)', 'imageUrl', p.imageUrl, 'url') + input('หรืออัปโหลดรูป (ไม่เกิน 5 MB)', 'image', '', 'file', 'accept="image/jpeg,image/png,image/webp"') + `<label>โน้ต<textarea name="notes" maxlength="2000">${esc(p.notes)}</textarea></label><p class="muted">เมื่อแก้เวลา สถานที่ถัดไปในวันเดียวกันจะเลื่อนตาม • รายการใหม่เพิ่มท้ายวัน</p>`;
  $('#form-error').textContent = ''; $('#editor').showModal();
}
function openCost(row = null, planId = '') {
  if (!canEdit()) return;
  editorState = { kind: 'cost', row: row ? structuredClone(row) : null, members: structuredClone(settings.members), rate: row?.exchangeRate ?? settings.exchangeRate };
  const c = row || { currency: 'JPY', paymentMethod: 'cash', feePercent: 0, category: 'food', planId, shares: Object.fromEntries(settings.members.map(m => [m.id, 0])), fixedShares: {} };
  $('#editor-title').textContent = row ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย';
  $('#editor-fields').innerHTML = input('ชื่อรายการ', 'title', c.title, 'text', 'required maxlength="120"') + `<label>สถานที่<select name="planId"><option value="">ไม่ผูกสถานที่</option>${c.planId && !plans.some(p => p.id === c.planId) ? `<option value="${esc(c.planId)}">สถานที่ถูกลบแล้ว</option>` : ''}${sorted().map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label><details class="category-picker" open><summary>หมวดหมู่ · ย่อ / ขยาย</summary><div class="category-options">${Object.entries(CATEGORIES).map(([id, label]) => `<label><input type="radio" name="category" value="${id}" ${c.category === id ? 'checked' : ''}>${label}</label>`).join('')}</div></details><div class="form-grid">${input('ยอดบิลก่อนค่าธรรมเนียม', 'amount', row ? c.baseMinor / 10 ** digits(c.currency) : '', 'number', 'min="0.01" step="any" required')}<label>สกุลเงิน<select name="currency"><option>JPY</option><option>THB</option></select></label><label>ผู้จ่ายเงิน<select name="payerId">${settings.members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label><label>วิธีชำระ<select name="paymentMethod"><option value="cash">เงินสด</option><option value="card">บัตรเครดิต</option></select></label></div><div id="card-fields" class="form-grid">${input('ชื่อบัตร', 'cardName', c.cardName, 'text', 'maxlength="80"')}${input('ค่าธรรมเนียมบัตร (%)', 'feePercent', c.feePercent, 'number', 'min="0" max="100" step="0.01"')}</div><p class="muted">เรทบิลนี้ 1 JPY = ${editorState.rate} THB${row ? ' (คงเรทเดิม)' : ''}</p><h3>หารกับใครบ้าง</h3><p class="muted">กรอกยอดเฉพาะคนที่ต้องการ ที่เหลือเว้นว่างเพื่อหารอัตโนมัติ รวมค่าธรรมเนียมแล้ว</p>${settings.members.map(m => `<div class="split-row"><input type="checkbox" name="participant" value="${esc(m.id)}" id="member-${esc(m.id)}" ${m.id in c.shares ? 'checked' : ''}><label for="member-${esc(m.id)}">${esc(m.name)}</label><input type="number" data-share="${esc(m.id)}" value="${m.id in (c.fixedShares || {}) ? c.fixedShares[m.id] / 10 ** digits(c.currency) : ''}" min="0" step="any" placeholder="อัตโนมัติ" aria-label="ยอดของ ${esc(m.name)}"><output data-result="${esc(m.id)}"></output></div>`).join('')}<p id="split-preview" class="split-preview" aria-live="polite"></p>${input('แนบสลิป / ใบเสร็จ (ไม่เกิน 5 MB)', 'receipt', '', 'file', 'accept="image/jpeg,image/png,image/webp"')}${safeURL(c.receiptUrl) ? `<a href="${esc(safeURL(c.receiptUrl))}" target="_blank" rel="noopener noreferrer">ดูสลิปเดิม ↗</a>` : ''}`;
  const f = $('#editor-form'); for (const key of ['currency', 'paymentMethod', 'payerId', 'planId']) if (c[key]) f.elements.namedItem(key).value = c[key];
  f.oninput = () => { if (editorState?.kind === 'cost') previewSplit(); }; previewSplit(); $('#form-error').textContent = ''; $('#editor').showModal();
}
function readBill() {
  const f = $('#editor-form'), currency = f.currency.value, baseMinor = minor(f.amount.value, currency), feePercent = f.paymentMethod.value === 'card' ? Number(f.feePercent.value) : 0;
  const { fee, total } = feeTotal(baseMinor, feePercent), ids = $$('#editor-form [name=participant]:checked').map(i => i.value), fixedShares = Object.create(null);
  $$('[data-share]').forEach(i => { if (ids.includes(i.dataset.share) && i.value.trim() !== '') fixedShares[i.dataset.share] = minor(i.value, currency); });
  return { currency, baseMinor, feePercent, feeMinor: fee, totalMinor: total, fixedShares, shares: splitBill(total, ids, fixedShares) };
}
function previewSplit() {
  const f = $('#editor-form'), card = f.paymentMethod.value === 'card'; $('#card-fields').hidden = !card; f.cardName.required = card;
  try { const b = readBill(); $('#split-preview').textContent = `ยอดรวม ${money(b.totalMinor, b.currency)} · ค่าธรรมเนียม ${money(b.feeMinor, b.currency)}`; $$('[data-result]').forEach(o => { o.textContent = o.dataset.result in b.shares ? money(b.shares[o.dataset.result], b.currency) : '—'; }); }
  catch (e) { $('#split-preview').textContent = e.message; $$('[data-result]').forEach(o => { o.textContent = '—'; }); }
}
$('#add-plan').onclick = () => openPlan(); $('#admin-add').onclick = () => openPlan(); $('#add-cost').onclick = () => openCost();
$('#editor-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true; const f = event.target; $('#save-button').disabled = true; $('#form-error').textContent = ''; let uploaded = null;
  try {
    requireEdit(); toast('ฟูจิกำลังบันทึก…', true);
    if (editorState.kind === 'cost') {
      const bill = readBill(), old = editorState.row;
      const row = { ...bill, id: old?.id || service.newId('costs'), revision: old?.revision || 0, title: f.elements.namedItem('title').value.trim(), planId: f.planId.value || null, category: f.category.value, payerId: f.payerId.value, paymentMethod: f.paymentMethod.value, cardName: f.paymentMethod.value === 'card' ? f.cardName.value.trim() : '', exchangeRate: editorState.rate, receiptUrl: old?.receiptUrl || '', receiptPath: old?.receiptPath || '' };
      if (!row.title || (row.paymentMethod === 'card' && !row.cardName)) throw Error('กรอกชื่อรายการและชื่อบัตร');
      if (f.receipt.files[0]) { uploaded = await service.uploadImage(f.receipt.files[0]); row.receiptUrl = uploaded.url; row.receiptPath = uploaded.path; }
      await service.saveCost(row);
    } else {
      const old = editorState.row, rows = editorState.snapshot, day = f.day.value;
      if ((f.lat.value === '') !== (f.lng.value === '')) throw Error('กรอกพิกัดทั้งละติจูดและลองจิจูด');
      const row = { id: old?.id || service.newId('plans'), revision: old?.revision || 0, title: f.elements.namedItem('title').value.trim(), location: f.location.value.trim(), day, durationMin: Number(f.durationMin.value), travelMin: Number(f.travelMin.value), lat: f.lat.value === '' ? null : Number(f.lat.value), lng: f.lng.value === '' ? null : Number(f.lng.value), notes: f.notes.value.trim(), imageUrl: f.imageUrl.value.trim(), imagePath: old?.imagePath || '' };
      if (!row.title) throw Error('กรอกชื่อสถานที่'); if (row.imageUrl && !safeURL(row.imageUrl)) throw Error('รูปภาพต้องเป็น URL แบบ HTTPS');
      let dayRows = rows.filter(p => p.day === day && p.id !== row.id), index = old?.day === day ? rows.filter(p => p.day === day).findIndex(p => p.id === old.id) : dayRows.length;
      dayRows.splice(index, 0, row);
      const anchor = tokyoMillis(day, f.start.value);
      if (index > 0 && anchor < dayRows[index - 1].endMs + dayRows[index - 1].travelMin * 60000) throw Error('เวลาเริ่มทับช่วงก่อนหน้า รวมเวลาเดินทาง กรุณาปรับเวลา หรือลำดับก่อน');
      dayRows = schedule(dayRows, anchor, index);
      let otherRows = rows.filter(p => p.day !== day && p.id !== row.id);
      if (old && old.day !== day) { const oldDay = rows.filter(p => p.day === old.day), remaining = oldDay.filter(p => p.id !== row.id); otherRows = [...otherRows.filter(p => p.day !== old.day), ...schedule(remaining, oldDay[0].startMs)]; }
      if (f.image.files[0]) { uploaded = await service.uploadImage(f.image.files[0]); dayRows[index].imageUrl = uploaded.url; dayRows[index].imagePath = uploaded.path; }
      await service.saveSchedule([...otherRows, ...dayRows], [], editorState.version);
    }
    uploaded = null; $('#editor').close(); toast('บันทึกและซิงก์เรียบร้อยแล้ว');
  } catch (e) { if (uploaded) await service.discardUpload(uploaded.path).catch(() => {}); $('#form-error').textContent = errorMessage(e); toast('บันทึกไม่สำเร็จ ตรวจสอบข้อความในฟอร์ม', false, true); }
  finally { busy = false; $('#save-button').disabled = false; }
};
$('#settings-form').onsubmit = async event => {
  event.preventDefault(); const f = event.target, revision = settings.revision;
  try {
    requireEdit(); const members = f.members.value.split('\n').filter(l => l.trim()).map(l => { const [id, ...rest] = l.split(':'); return { id: id.trim(), name: rest.join(':').trim() }; });
    if (!members.length || members.length > 20 || members.some(m => !/^[a-zA-Z0-9_-]{1,32}$/.test(m.id) || !m.name || m.name.length > 80) || new Set(members.map(m => m.id)).size !== members.length) throw Error('สมาชิก 1–20 คน ใช้ id ภาษาอังกฤษ/ตัวเลขไม่ซ้ำ และระบุชื่อ');
    const referenced = new Set(settings.members.map(m => m.id));
    if ([...referenced].some(id => !members.some(m => m.id === id))) throw Error('เก็บ id สมาชิกเดิมไว้เพื่อรักษาประวัติ สามารถแก้ชื่อหรือเพิ่มคนได้');
    const patch = { memberIds: members.map(m => m.id), title: f.elements.namedItem('title').value.trim(), exchangeRate: Number(f.exchangeRate.value), members };
    if (!patch.title || !Number.isFinite(patch.exchangeRate) || patch.exchangeRate <= 0 || patch.exchangeRate > 100) throw Error('ชื่อทริปหรือเรทไม่ถูกต้อง');
    if (await confirmSensitive('บันทึกชื่อทริป สมาชิก และเรทสำหรับบิลใหม่?')) action(() => service.saveSettings(patch, revision));
  } catch (e) { toast(errorMessage(e), false, true); }
};
async function start() {
  try {
    service = await import(demo ? './demo-services.js' : './services.js');
    service.watchAuth(async nextUser => {
      const token = ++epoch; unsubs.forEach(stop => stop()); unsubs = []; plans = []; costs = []; settings = null; ready = new Set(); user = nextUser; role = 'none'; editing = false; charts.forEach(c => c.destroy()); charts = [];
      $('#editor-fields').innerHTML = ''; editorState = null; $('#settings-form').reset(); $('#person-export').innerHTML = ''; $('#stats').innerHTML = ''; $('#card-summary').innerHTML = ''; $('#settlements').innerHTML = ''; $('#person-select').innerHTML = ''; $('#trip-title').textContent = 'Japan, together.'; $$('dialog[open]').forEach(d => d.close());
      renderAll(); $('#sync-status').textContent = nextUser ? 'กำลังเชื่อมต่อ' : 'ยังไม่เข้าสู่ระบบ';
      if (!nextUser) return;
      try {
        role = await service.roleFor(nextUser); if (token !== epoch) return;
        editing = ['editor', 'admin'].includes(role) && !!localStorage.getItem(pinKey()) && localStorage.getItem(`fuji:unlocked:${user.uid}`) === 'yes';
        if (role === 'none') throw Error('บัญชีนี้ยังไม่ได้รับเชิญ ผู้ดูแลต้องเพิ่ม members/{uid} ใน Firebase');
        toast('ฟูจิกำลังโหลดข้อมูล…', true);
        const mark = (kind, metadata) => { ready.add(kind); $('#sync-status').textContent = metadata?.fromCache ? 'ข้อมูลจากแคช' : demo ? 'ข้อมูลทดลอง' : 'ซิงก์แล้ว'; if (ready.size === 3) toast('ข้อมูลทริปพร้อมแล้ว'); };
        unsubs = service.subscribe({
          plans: (rows, metadata) => { if (token !== epoch) return; plans = rows; mark('plans', metadata); renderAll(); },
          costs: (rows, metadata) => { if (token !== epoch) return; costs = rows; mark('costs', metadata); renderAll(); },
          settings: value => { if (token !== epoch) return; settings = value; if (!value) { toast('ยังไม่มี settings/trip กรุณาทำตาม README', false, true); updateAccess(); return; } $('#trip-title').textContent = value.title; mark('settings'); renderAll(); },
          error: e => { if (token !== epoch) return; $('#sync-status').textContent = 'ซิงก์ไม่สำเร็จ'; toast(errorMessage(e), false, true); }
        });
      } catch (e) { toast(errorMessage(e), false, true); updateAccess(); }
    });
  } catch (e) { $('#sync-status').textContent = 'โหลด SDK ไม่สำเร็จ'; toast('โหลด Firebase ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรช หรือเปิดโหมดทดลอง', false, true); }
}
window.addEventListener('offline', () => { $('#sync-status').textContent = 'ออฟไลน์'; toast('ออฟไลน์ ข้อมูลอาจยังไม่เป็นปัจจุบัน', false, true); });
window.addEventListener('online', () => { $('#sync-status').textContent = 'กำลังเชื่อมต่อใหม่'; });
window.addEventListener('pagehide', () => unsubs.forEach(stop => stop()));
start();
