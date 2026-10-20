// Общий текущий расчёт для всех, кто открывает сайт.
// Хранится по частям: «dates» (общие даты), «meta» (имена), «r:<курорт>». У каждой части
// время изменения и кто менял — так правки в разных курортах не затирают друг друга.
// GET  /api/live → { parts: { key: { v, at, by } } }
// POST /api/live   { parts: { key: v }, by } → то же, после слияния
import { FILES, readJSON, update, readBody } from "./_store.js";

const KEY = /^(dates|meta|r:[a-z]{2,20})$/;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const cur = await readJSON(FILES.live);
      res.status(200).json({ parts: cur ? cur.data.parts || {} : {} });
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const parts = body && body.parts;
      if (!parts || typeof parts !== "object") { res.status(400).json({ error: "Нет данных" }); return; }
      if (JSON.stringify(parts).length > 60000) { res.status(413).json({ error: "Слишком много данных" }); return; }
      const by = String(body.by || "").slice(0, 40);
      const at = Date.now();
      const data = await update(FILES.live, d => {
        const all = d.parts || {};
        for (const k of Object.keys(parts)) if (KEY.test(k)) all[k] = { v: parts[k], at, by };
        return { parts: all };
      }, () => ({ parts: {} }));
      res.status(200).json({ parts: data.parts });
      return;
    }
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Метод не поддерживается" });
  } catch (e) {
    res.status(500).json({ error: "Хранилище недоступно: " + (e.message || "ошибка") });
  }
}
