// Прокси к ленте цен Aviasales: браузер не может запросить её напрямую (нет CORS).
// GET /api/prices?dest=NOZ&from=2026-12-01&to=2027-02-28&tmin=7&tmax=10&trip=2027-02-08|2027-02-15
// Ответ: { prices: [{depart, ret, days, price}], history: { "<depart>|<ret>": [[время, цена]] }, fetchedAt }
// Каждый запрос пополняет историю цен; в ответе история по всем вариантам окна.
import { DESTS, prices, record } from "./_aviasales.js";

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  const dest = String(q.dest || "NOZ").toUpperCase();
  const from = String(q.from || ""), to = String(q.to || "");
  const tmin = Math.max(2, Math.min(21, parseInt(q.tmin, 10) || 7));
  const tmax = Math.max(tmin, Math.min(tmin + 7, parseInt(q.tmax, 10) || 10));
  if (!DESTS.includes(dest)) { res.status(400).json({ error: "Неизвестное направление" }); return; }
  if (!isDate(from) || !isDate(to) || from > to) { res.status(400).json({ error: "Неверное окно дат" }); return; }
  let list;
  try { list = await prices(dest, from, to, tmin, tmax); }
  catch (e) { res.status(502).json({ error: e.message || "Не удалось связаться с Aviasales" }); return; }
  /* История — дополнительно: если хранилище недоступно, цены всё равно отдаём */
  let history = {};
  try {
    const h = await record({ [dest]: list });
    const d = h[dest] || {};
    for (const p of list) { const k = p.depart + "|" + p.ret; if (d[k] && d[k].length > 1) history[k] = d[k]; }
  } catch {}
  res.status(200).json({ prices: list, history, fetchedAt: new Date().toISOString() });
}
