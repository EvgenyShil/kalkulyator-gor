// Общие JSON-файлы в Vercel Blob (файлы с «_» Vercel не превращает в функции).
// Бесплатный тариф: 10 000 чтений и 2 000 записей в месяц, при превышении Blob
// блокируется на 30 дней. Поэтому всё хранится в нескольких файлах, без list().
import { get, put, head, BlobNotFoundError } from "@vercel/blob";

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
  return { data: JSON.parse(await new Response(r.stream).text()) };
}

export async function writeJSON(path, data, etag) {
  await put(path, JSON.stringify(data), etag ? { ...PUT, ifMatch: etag } : PUT);
}

/* Метка версии из API хранилища (у get() она в другом формате и для ifMatch не подходит) */
async function etagOf(path) {
  try { return (await head(path)).etag; } catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
}

/* Прочитать, изменить, записать. Если кто-то записал между чтением и записью — повторить;
   после трёх неудач записываем без проверки, чтобы правка не потерялась.
   change может вернуть null — «ничего не изменилось», тогда записи нет.
   dry: сначала просто прочитать и проверить, есть ли что менять (экономит запись и head). */
export async function update(path, change, empty, { dry = false } = {}) {
  if (dry) {
    const first = await readJSON(path);
    const base = first ? first.data : empty();
    if (change(base) === null) return base;
  }
  for (let i = 0; ; i++) {
    const etag = i < 3 ? await etagOf(path) : null;
    const cur = await readJSON(path);
    const base = cur ? cur.data : empty();
    const data = change(base);
    if (data === null) return base;
    try { await writeJSON(path, data, etag); return data; }
    catch (e) { if (i >= 3 || !/precondition|etag|412/i.test(String(e && e.message))) throw e; }
  }
}

export async function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  return b && typeof b === "object" ? b : null;
}
