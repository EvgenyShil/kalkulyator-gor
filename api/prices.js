// Прокси к ленте цен Aviasales: браузер не может запросить её напрямую (нет CORS).
// GET /api/prices?dest=NOZ&from=2026-12-01&to=2027-02-28&tmin=7&tmax=10
// Прямые рейсы из Москвы туда-обратно, 1 взрослый, тариф без багажа.
// Лента не говорит, чья цена, поэтому спрашиваем по каждой авиакомпании отдельно.
// Ответ: { prices: [{depart, ret, days, fares: {SU: 26898, S7: 24362}}], airlines, fetchedAt }
const DESTS = {
  NOZ: ["SU", "S7"],              // Новокузнецк → Шерегеш
  KVK: ["SU"],                    // Апатиты → Кировск
  AER: ["SU", "DP", "U6", "UT"],  // Сочи → Красная Поляна
  MRV: ["SU", "DP", "U6", "UT"],  // Минеральные Воды → Эльбрус
};

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function ribbon(dest, dmin, dmax, t, airline) {
  const params = new URLSearchParams({
    origin: "MOW", origin_type: "city",
    destination: dest, destination_type: "city",
    currency: "RUB", brand: "AS", market: "ru", trip_class: "Y",
    passengers_adults: "1", passengers_children: "0", passengers_infants: "0",
    is_one_way: "false",
    filters_state: JSON.stringify({ airlines: [airline], transfers_count: ["0"] }),
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
    .map(p => ({ depart: p.depart_date, ret: p.return_date, days: t, price: Math.round(p.value), airline }));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  const dest = String(q.dest || "NOZ").toUpperCase();
  const airlines = DESTS[dest];
  const from = String(q.from || ""), to = String(q.to || "");
  const tmin = Math.max(2, Math.min(21, parseInt(q.tmin, 10) || 7));
  const tmax = Math.max(tmin, Math.min(tmin + 7, parseInt(q.tmax, 10) || 10));
  if (!airlines) { res.status(400).json({ error: "Неизвестное направление" }); return; }
  if (!isDate(from) || !isDate(to) || from > to) { res.status(400).json({ error: "Неверное окно дат" }); return; }
  // Вылет не раньше from, прилёт обратно не позже to.
  const dmax = addDays(to, -tmin);
  if (dmax < from) { res.status(400).json({ error: "Окно короче минимальной поездки" }); return; }
  try {
    const jobs = [];
    for (let t = tmin; t <= tmax; t++) for (const a of airlines) jobs.push(ribbon(dest, from, dmax, t, a));
    const flat = (await Promise.all(jobs)).flat().filter(x => x.ret <= to);
    const map = new Map();
    for (const x of flat) {
      const k = x.depart + "|" + x.ret;
      if (!map.has(k)) map.set(k, { depart: x.depart, ret: x.ret, days: x.days, fares: {} });
      map.get(k).fares[x.airline] = x.price;
    }
    res.status(200).json({ prices: [...map.values()], airlines, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: e.message || "Не удалось связаться с Aviasales" });
  }
}
