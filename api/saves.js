// Общие сохранённые расчёты: их видят все, кто открывает сайт. Все в одном файле data/saves.json.
// GET    /api/saves          — список
// POST   /api/saves          — сохранить { name, summary, state }; с { id } — обновить это сохранение
// DELETE /api/saves?id=...   — удалить
// К каждому сохранению в списке прикладываем историю цены билета на его даты по каждому курорту:
// hist: { sheregesh: { key, points: [[время, цена без багажа], ...] }, ... }
import { list } from "@vercel/blob";
import { FILES, readJSON, update, readBody } from "./_store.js";
import { tripsOf, savedBatch, record } from "./_aviasales.js";

const clean = body => ({
  name: String(body.name || "Без названия").slice(0, 80),
  summary: Array.isArray(body.summary) ? body.summary.slice(0, 20).map(x => ({
    r: String(x && x.r || "").slice(0, 30),
    pp: Math.round(Number(x && x.pp) || 0),
  })) : [],
  state: body.state,
});

/* Раньше каждое сохранение лежало отдельным файлом saves/*.json — один раз собираем их в общий файл */
async function legacy() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: "saves/", cursor, limit: 1000 });
    for (const b of page.blobs) {
      try { const r = await fetch(b.url, { cache: "no-store" }); if (r.ok) out.push({ ...(await r.json()), id: b.pathname }); } catch {}
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      let cur = await readJSON(FILES.saves);
      let items = cur ? cur.data.items : null;
      if (!items) { const old = await legacy(); items = (await update(FILES.saves, d => d.items ? d : { items: old }, () => ({}))).items; }
      let H = {};
      try { const h = await readJSON(FILES.history); H = h ? h.data : {}; } catch {}
      const withHist = items.map(it => {
        const hist = {};
        for (const t of tripsOf(it.state)) hist[t.id] = { key: t.key, points: (H[t.dest] || {})[t.key] || [] };
        return { ...it, hist };
      });
      res.status(200).json({ items: withHist.sort((a, b) => (b.at || 0) - (a.at || 0)) });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body || typeof body.state !== "object") { res.status(400).json({ error: "Нет данных расчёта" }); return; }
      const c = clean(body);
      if (JSON.stringify(c).length > 100000) { res.status(413).json({ error: "Слишком большой расчёт" }); return; }
      const id = body.id ? String(body.id).slice(0, 120) : `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      let item;
      await update(FILES.saves, d => {
        const items = d.items || [];
        const i = items.findIndex(x => x.id === id);
        item = { ...(i >= 0 ? items[i] : {}), ...c, id, at: Date.now() };
        if (body.id && body.keepName && i >= 0) item.name = items[i].name;
        if (i >= 0) items[i] = item; else items.push(item);
        return { items };
      }, () => ({ items: [] }));
      /* первая точка графика — сразу при сохранении; ошибка здесь не мешает сохранению */
      try { const b = await savedBatch([item]); if (Object.keys(b).length) await record(b); } catch {}
      res.status(200).json({ item });
      return;
    }

    if (req.method === "DELETE") {
      const id = String((req.query && req.query.id) || "");
      if (!id) { res.status(400).json({ error: "Нет id" }); return; }
      await update(FILES.saves, d => ({ items: (d.items || []).filter(x => x.id !== id) }), () => ({ items: [] }));
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "Метод не поддерживается" });
  } catch (e) {
    res.status(500).json({ error: "Хранилище недоступно: " + (e.message || "ошибка") });
  }
}
