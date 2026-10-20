// Прокси к ленте цен Aviasales: браузер не может запросить её напрямую (нет CORS).
// GET /api/prices — прямые рейсы Аэрофлота и S7 Москва ⇄ Новокузнецк,
// все варианты 7–10 дней: 20.11–31.12 и 25.01–28.02 (1 взрослый, тариф без багажа).
const RANGES = [
  { id: "dec", dmin: "2026-11-20", dmax: "2026-12-31" },
  { id: "feb", dmin: "2027-01-25", dmax: "2027-02-28" },
];
const AIRLINES = ["SU", "S7"];
const TMIN = 7, TMAX = 10;

async function ribbon(dmin, dmax, t, airline) {
  const params = new URLSearchParams({
    origin: "MOW", origin_type: "city",
    destination: "NOZ", destination_type: "city",
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
  return (j.prices || []).map(p => ({ depart: p.depart_date, ret: p.return_date, days: t, price: Math.round(p.value) }));
}

export default async function handler(req, res) {
  try {
    const jobs = [];
    for (const g of RANGES) for (let t = TMIN; t <= TMAX; t++) for (const a of AIRLINES)
      jobs.push(ribbon(g.dmin, g.dmax, t, a).then(list => list.map(x => ({ ...x, group: g.id, airline: a }))));
    const flat = (await Promise.all(jobs)).flat();
    const map = new Map();
    for (const x of flat) {
      const k = x.depart + "|" + x.ret;
      if (!map.has(k)) map.set(k, { group: x.group, depart: x.depart, ret: x.ret, days: x.days, su: null, s7: null });
      map.get(k)[x.airline === "SU" ? "su" : "s7"] = x.price;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ prices: [...map.values()], fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: e.message || "Не удалось связаться с Aviasales" });
  }
}
