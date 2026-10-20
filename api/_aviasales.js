// Лента цен Aviasales и история цен. Общее для /api/prices и ежедневной проверки /api/cron.
// Самый дешёвый прямой рейс из Москвы туда-обратно, 1 взрослый, тариф без багажа.
// Это кэш Aviasales (цены из недавних поисков), поэтому только ориентир: авиакомпанию
// лента не отдаёт, а часть рейсов (например, S7 в Сочи) в ней не бывает вовсе.
import { FILES, update } from "./_store.js";

export const DESTS = ["NOZ", "KVK", "AER", "MRV"]; // Новокузнецк, Апатиты, Сочи, Минеральные Воды

export const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function ribbon(dest, dmin, dmax, t) {
  const params = new URLSearchParams({
    origin: "MOW", origin_type: "city",
    destination: dest, destination_type: "city",
    currency: "RUB", brand: "AS", market: "ru", trip_class: "Y",
    passengers_adults: "1", passengers_children: "0", passengers_infants: "0",
    is_one_way: "false",
    filters_state: JSON.stringify({ transfers_count: ["0"] }),
    depart_date_min: dmin, depart_date_max: dmax,
    trip_duration_min: String(t), trip_duration_max: String(t),
  });
  const r = await fetch("https://tickets-api.aviasales.ru/search/prices/ribbon?" + params, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Macintosh) kalkulyator-sheregesha" },
  });
  if (!r.ok) throw new Error("Aviasales ответил кодом " + r.status);
  const j = await r.json();
  return (j.prices || [])
    .filter(p => !p.no_directs)
    .map(p => ({ depart: p.depart_date, ret: p.return_date, days: t, price: Math.round(p.value) }));
}

/* Все варианты: вылет не раньше from, возвращение не позже to, длина tmin–tmax дней */
export async function prices(dest, from, to, tmin, tmax) {
  const dmax = addDays(to, -tmin);
  if (dmax < from) return [];
  const jobs = [];
  for (let t = tmin; t <= tmax; t++) jobs.push(ribbon(dest, from, dmax, t));
  return (await Promise.all(jobs)).flat().filter(x => x.ret <= to);
}

/* История: { NOZ: { "2027-02-08|2027-02-15": [[время, цена], ...] }, _lastRun }.
   Точку добавляем, если цена изменилась или прошло больше 20 часов; храним 40 последних.
   batch: { NOZ: [варианты], KVK: [...] } — всё одной записью, чтобы беречь лимит Blob. */
export async function record(batch, extra) {
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  return update(FILES.history, h => {
    for (const dest of Object.keys(batch)) {
      const d = h[dest] || (h[dest] = {});
      for (const p of batch[dest]) {
        const k = p.depart + "|" + p.ret, a = d[k] || (d[k] = []), last = a[a.length - 1];
        if (!last || last[1] !== p.price || now - last[0] > 20 * 3600e3) a.push([now, p.price]);
        if (a.length > 40) a.splice(0, a.length - 40);
      }
      for (const k of Object.keys(d)) if (k.slice(0, 10) < today) delete d[k];
    }
    return { ...h, ...(extra || {}) };
  }, () => ({}));
}
