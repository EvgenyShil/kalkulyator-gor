// Раз в день (vercel.json → crons): записать в историю цены на даты сохранённых расчётов
// (для их графиков) и по окнам дат из общего расчёта (для стрелок ↓↑ в таблице цен).
// Не чаще раза в 12 часов — лишние вызовы ничего не пишут.
import { FILES, readJSON } from "./_store.js";
import { prices, record, savedBatch, RESORT_DEST } from "./_aviasales.js";

const DEST = RESORT_DEST;
const DEF = { from: "2026-11-20", to: "2027-02-28", tmin: 7, tmax: 10 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [live, hist] = await Promise.all([readJSON(FILES.live), readJSON(FILES.history)]);
    if (hist && hist.data._lastRun && Date.now() - hist.data._lastRun < 12 * 3600e3) { res.status(200).json({ skipped: "уже проверяли сегодня" }); return; }
    const parts = live ? live.data.parts || {} : {};
    const g = parts.dates && parts.dates.v || {};
    const batch = {}, done = {};
    for (const [id, dest] of Object.entries(DEST)) {
      const r = parts["r:" + id] && parts["r:" + id].v || {};
      const d = { ...DEF, ...(g.shareDates === false ? r.dates : g.dates) };
      const tmin = +d.tmin || 7, tmax = Math.min(+d.tmax || 10, tmin + 7);
      try { batch[dest] = await prices(dest, d.from, d.to, tmin, tmax); done[id] = batch[dest].length; }
      catch (e) { done[id] = "ошибка: " + e.message; }
    }
    const saves = await readJSON(FILES.saves);
    const sb = await savedBatch(saves ? saves.data.items || [] : []);
    for (const d of Object.keys(sb)) { batch[d] = (batch[d] || []).concat(sb[d]); done["сохранения " + d] = sb[d].length; }
    await record(batch, { _lastRun: Date.now() });
    res.status(200).json({ recorded: done });
  } catch (e) {
    res.status(500).json({ error: e.message || "ошибка" });
  }
}
