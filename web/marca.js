/* ============================================================
   NEXUS ADS — marca.js · o logo da clínica (Ajustes do gestor)
   Carregado por import() dinâmico só quando o gestor escolhe um
   arquivo. Reduz o logo no próprio navegador (canvas), devolve um
   data URL PNG/WebP de no máximo 60 KB e as cores sugeridas.
   Nunca SVG: o painel só aceita imagem rasterizada, por img.src.
   ============================================================ */

export const LIMITE = 60 * 1024;   // caracteres do data URL (é o que vai no payload do nx_cliente_salvar)

/** PURO: as cores mais frequentes de uma imagem (RGBA), quantizadas em 4 bits por canal.
    Descarta transparente, quase branco, quase preto e cinza (saturação < .18). */
export function coresSugeridas(px, n = 5) {
  const cont = new Map();
  for (let i = 0; i + 3 < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
    if (a < 128) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
    const s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
    if (l > .92 || l < .08 || s < .18) continue;
    const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = cont.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    cont.set(k, e);
  }
  const hex = v => Math.round(v).toString(16).padStart(2, "0");
  return [...cont.values()].sort((a, b) => b.n - a.n).slice(0, n)
    .map(e => ("#" + hex(e.r / e.n) + hex(e.g / e.n) + hex(e.b / e.n)).toUpperCase());
}

function paraDataUrl(blob) {
  return new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => erro(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function reduzir(bmp, W, H, q = .9) {
  const k = Math.min(1, W / bmp.width, H / bmp.height);
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise(r => c.toBlob(r, "image/webp", q));
  // navegador sem WebP no canvas devolve PNG (ou nada): cai para PNG
  if (!blob || blob.type !== "image/webp") blob = await new Promise(r => c.toBlob(r, "image/png"));
  if (!blob) throw new Error("canvas");
  return paraDataUrl(blob);
}

function amostra(bmp) {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, 48, 48);
  return g.getImageData(0, 0, 48, 48).data;
}

/** Arquivo (PNG/JPEG/WebP) → { url: data URL ≤ 60 KB, cores: até 5 sugestões }. */
export async function processarLogo(arquivo, limite = LIMITE) {
  if (!arquivo || !/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw new Error("formato");
  const bmp = await createImageBitmap(arquivo);
  try {
    let url = await reduzir(bmp, 320, 160);
    if (url.length > limite) url = await reduzir(bmp, 240, 120);
    if (url.length > limite) url = await reduzir(bmp, 160, 80, .75);
    if (url.length > limite) throw new Error("grande");
    return { url, cores: coresSugeridas(amostra(bmp)) };
  } finally { if (bmp.close) bmp.close(); }
}
