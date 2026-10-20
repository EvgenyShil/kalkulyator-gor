// Общие JSON-файлы в Vercel Blob (файлы с «_» Vercel не превращает в функции).
// Бесплатный тариф: 10 000 чтений и 2 000 записей в месяц, при превышении Blob
// блокируется на 30 дней. Поэтому всё хранится в нескольких файлах, без list().
import { get, put } from "@vercel/blob";

export const FILES = {
  saves: "data/saves.json",      // сохранённые расчёты
  live: "data/live.json",        // общий текущий расчёт
  history: "data/history.json",  // история цен Aviasales
  telegram: "data/telegram.json" // подписчики и последние уведомления
};

const PUT = { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 };

export async function readJSON(path) {
  const r = await get(path, { access: "public", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
}

export async function writeJSON(path, data, etag) {
  await put(path, JSON.stringify(data), etag ? { ...PUT, ifMatch: etag } : PUT);
}

/* Прочитать, изменить, записать. Если кто-то записал раньше нас — повторить. */
export async function update(path, change, empty) {
  for (let i = 0; ; i++) {
    const cur = await readJSON(path);
    const data = change(cur ? cur.data : empty());
    try { await writeJSON(path, data, cur && cur.etag); return data; }
    catch (e) { if (i >= 2 || !/precondition|etag|412/i.test(String(e && e.message))) throw e; }
  }
}

export async function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  return b && typeof b === "object" ? b : null;
}
