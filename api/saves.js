// Общие сохранённые расчёты в Vercel Blob: их видят все, кто открывает сайт.
// GET    /api/saves          — список
// POST   /api/saves          — сохранить { name, summary, state } (весь расчёт по всем курортам)
// DELETE /api/saves?id=...   — удалить
import { put, list, del } from "@vercel/blob";

const PREFIX = "saves/";

async function readAll() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const blobs = await readAll();
      const items = await Promise.all(blobs.map(async b => {
        try {
          const r = await fetch(b.url, { cache: "no-store" });
          if (!r.ok) return null;
          const item = await r.json();
          return { ...item, id: b.pathname };
        } catch { return null; }
      }));
      res.status(200).json({ items: items.filter(Boolean).sort((a, b) => (b.at || 0) - (a.at || 0)) });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || typeof body !== "object" || typeof body.state !== "object") {
        res.status(400).json({ error: "Нет данных расчёта" });
        return;
      }
      const item = {
        name: String(body.name || "Без названия").slice(0, 80),
        summary: Array.isArray(body.summary) ? body.summary.slice(0, 8).map(x => ({
          r: String(x && x.r || "").slice(0, 30),
          pp: Math.round(Number(x && x.pp) || 0),
        })) : [],
        state: body.state,
        at: Date.now(),
      };
      const json = JSON.stringify(item);
      if (json.length > 100000) { res.status(413).json({ error: "Слишком большой расчёт" }); return; }
      const blob = await put(`${PREFIX}${item.at}.json`, json, {
        access: "public", contentType: "application/json", addRandomSuffix: true,
      });
      res.status(200).json({ item: { ...item, id: blob.pathname } });
      return;
    }

    if (req.method === "DELETE") {
      const id = String((req.query && req.query.id) || "");
      if (!id.startsWith(PREFIX) || id.includes("..")) { res.status(400).json({ error: "Неверный id" }); return; }
      const blobs = await readAll();
      const b = blobs.find(x => x.pathname === id);
      if (b) await del(b.url);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "Метод не поддерживается" });
  } catch (e) {
    res.status(500).json({ error: "Хранилище недоступно: " + (e.message || "ошибка") });
  }
}
