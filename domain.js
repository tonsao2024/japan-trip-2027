/** Pure domain logic. All money is integer minor units (JPY = yen, THB = satang). */
export const CATEGORIES = { food: 'อาหารและเครื่องดื่ม', transport: 'การเดินทาง', stay: 'ที่พัก', activity: 'กิจกรรม', shopping: 'ช้อปปิ้ง', other: 'อื่น ๆ' };
export const digits = currency => currency === 'JPY' ? 0 : 2;
export function minor(value, currency) {
  if (!['JPY', 'THB'].includes(currency) || String(value).trim() === '') throw Error('ระบุจำนวนเงิน');
  const n = Number(value), factor = 10 ** digits(currency);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * factor)) || Math.abs(n * factor - Math.round(n * factor)) > 1e-6) throw Error('จำนวนเงินหรือทศนิยมไม่ถูกต้อง');
  return Math.round(n * factor);
}
export function feeTotal(base, percent) {
  const rate = Number(percent);
  if (!Number.isSafeInteger(base) || base <= 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) throw Error('ยอดบิลต้องมากกว่า 0 และค่าธรรมเนียม 0–100%');
  const fee = Math.round(base * rate / 100);
  if (!Number.isSafeInteger(base + fee)) throw Error('ยอดเงินสูงเกินไป');
  return { fee, total: base + fee };
}
export function splitBill(total, ids, fixed = {}) {
  if (!Number.isSafeInteger(total) || total <= 0 || !ids.length || new Set(ids).size !== ids.length) throw Error('เลือกผู้ร่วมจ่ายอย่างน้อย 1 คน');
  let used = 0;
  for (const [id, value] of Object.entries(fixed)) {
    if (!ids.includes(id) || !Number.isSafeInteger(value) || value < 0) throw Error('ยอดหารไม่ถูกต้อง');
    used += value;
  }
  if (used > total) throw Error('ยอดที่ระบุรวมกันเกินบิล');
  const rest = ids.filter(id => !(id in fixed)), remainder = total - used;
  if (!rest.length && remainder !== 0) throw Error('ยอดหารรวมต้องเท่ากับบิล หรือเว้นช่องให้คำนวณอัตโนมัติ');
  const result = { ...fixed };
  rest.forEach((id, i) => { Object.defineProperty(result, id, { value: Math.floor(remainder / rest.length) + (i < remainder % rest.length ? 1 : 0), enumerable: true, writable: true, configurable: true }); });
  return result;
}
export function tokyoMillis(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('วันหรือเวลาไม่ถูกต้อง');
  const ms = Date.parse(`${day}T${time}:00+09:00`);
  if (!Number.isFinite(ms) || new Date(ms + 9 * 3600000).toISOString().slice(0, 10) !== day) throw Error('วันที่ไม่ถูกต้อง');
  return ms;
}
export function schedule(rows, anchorMs, startIndex = 0) {
  if (!Number.isFinite(anchorMs)) throw Error('เวลาเริ่มไม่ถูกต้อง');
  let cursor = anchorMs;
  return rows.map((row, i) => {
    if (i < startIndex) return { ...row };
    if (!Number.isInteger(row.durationMin) || row.durationMin < 1 || row.durationMin > 1440 || !Number.isInteger(row.travelMin) || row.travelMin < 0 || row.travelMin > 1440) throw Error('ระยะเวลาต้องเป็นนาทีจำนวนเต็ม 1–1440 (เวลาเดินทางเริ่มที่ 0)');
    const startMs = cursor, endMs = startMs + row.durationMin * 60000;
    cursor = endMs + row.travelMin * 60000;
    return { ...row, order: i, startMs, endMs };
  });
}
export function toTHB(amount, currency, rate) { return currency === 'THB' ? amount : Math.round(amount * rate * 100); }
export function summary(costs, members) {
  const people = Object.fromEntries(members.map(m => [m.id, { paid: 0, owed: 0 }])), categories = {}, cards = {};
  let total = 0;
  for (const c of costs) {
    const converted = toTHB(c.totalMinor, c.currency, c.exchangeRate);
    total += converted;
    people[c.payerId] ??= { paid: 0, owed: 0 };
    people[c.payerId].paid += converted;
    const entries = Object.entries(c.shares).sort(([a], [b]) => a.localeCompare(b));
    // Largest-remainder conversion preserves totals without giving rounding debt to one member.
    const convertedShares = entries.map(([id, amount]) => {
      const exact = amount * converted / c.totalMinor;
      return { id, value: Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    let extra = converted - convertedShares.reduce((n, s) => n + s.value, 0);
    convertedShares.sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id));
    for (const s of convertedShares) { people[s.id] ??= { paid: 0, owed: 0 }; people[s.id].owed += s.value + (extra-- > 0 ? 1 : 0); }
    categories[c.category] = (categories[c.category] || 0) + converted;
    if (c.paymentMethod === 'card') {
      const key = `${c.payerId}::${c.cardName}`;
      cards[key] ??= { payerId: c.payerId, name: c.cardName, thb: 0, JPY: 0, THB: 0 };
      cards[key].thb += converted; cards[key][c.currency] += c.totalMinor;
    }
  }
  const debtors = [], creditors = [];
  for (const [id, p] of Object.entries(people)) { p.balance = p.paid - p.owed; if (p.balance < 0) debtors.push({ id, amount: -p.balance }); if (p.balance > 0) creditors.push({ id, amount: p.balance }); }
  const transfers = []; let a = 0, b = 0;
  while (a < debtors.length && b < creditors.length) {
    const amount = Math.min(debtors[a].amount, creditors[b].amount);
    transfers.push({ from: debtors[a].id, to: creditors[b].id, amount });
    debtors[a].amount -= amount; creditors[b].amount -= amount;
    if (!debtors[a].amount) a++; if (!creditors[b].amount) b++;
  }
  return { total, people, categories, cards: Object.values(cards), transfers };
}
export function safeURL(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
