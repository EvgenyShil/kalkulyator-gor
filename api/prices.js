// Прокси к ленте цен Aviasales: браузер не может запросить её напрямую (нет CORS).
// GET /api/prices?dest=NOZ&from=2026-12-01&to=2027-02-28&tmin=7&tmax=10
// GET /api/prices?batch=[{"dest":"NOZ","from":…,"to":…,"tmin":7,"tmax":10}, …] — несколько курортов сразу,
//     история записывается одной записью (кнопка «Обновить цены по всем курортам»).
// Ответ: { prices: [{depart, ret, days, price}], history: { "<depart>|<ret>": [[время, цена]] }, fetchedAt }
//   для batch: { results: { NOZ: { prices, history } | { error } }, fetchedAt }
import { DESTS, prices, record } from "./_aviasales.js";

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

function parse(q) {
  const dest = String(q.dest || "NOZ").toUpperCase();
  const from = String(q.from || ""), to = String(q.to || "");
  const tmin = Math.max(2, Math.min(21, parseInt(q.tmin, 10) || 7));
  const tmax = Math.max(tmin, Math.min(tmin + 7, parseInt(q.tmax, 10) || 10));
  if (!DESTS.includes(dest)) return { error: "Неизвестное направление" };
  if (!isDate(from) || !isDate(to) || from > to) return { error: "Неверное окно дат" };
  return { dest, from, to, tmin, tmax };
}

/* История — дополнительно: если хранилище недоступно, цены всё равно отдаём */
async function withHistory(lists) {
  const out = {};
  for (const dest of Object.keys(lists)) out[dest] = { prices: lists[dest], history: {} };
  try {
    const h = await record(lists);
    for (const dest of Object.keys(lists)) {
      const d = h[dest] || {};
      for (const p of lists[dest]) { const k = p.depart + "|" + p.ret; if (d[k] && d[k].length) out[dest].history[k] = d[k]; }
    }
  } catch {}
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  if (q.batch) {
    let items;
    try { items = JSON.parse(q.batch); } catch { items = null; }
    if (!Array.isArray(items) || !items.length || items.length > 20) { res.status(400).json({ error: "Неверный список курортов" }); return; }
    const results = {}, lists = {};
    await Promise.all(items.map(async it => {
      const a = parse(it || {});
      if (a.error) { results[String(it && it.dest)] = { error: a.error }; return; }
      try { lists[a.dest] = await prices(a.dest, a.from, a.to, a.tmin, a.tmax); }
      catch (e) { results[a.dest] = { error: e.message || "Не удалось связаться с Aviasales" }; }
    }));
    Object.assign(results, await withHistory(lists));
    res.status(200).json({ results, fetchedAt: new Date().toISOString() });
    return;
  }
  const a = parse(q);
  if (a.error) { res.status(400).json({ error: a.error }); return; }
  let list;
  try { list = await prices(a.dest, a.from, a.to, a.tmin, a.tmax); }
  catch (e) { res.status(502).json({ error: e.message || "Не удалось связаться с Aviasales" }); return; }
  const r = (await withHistory({ [a.dest]: list }))[a.dest];
  res.status(200).json({ prices: list, history: r.history, fetchedAt: new Date().toISOString() });
}
