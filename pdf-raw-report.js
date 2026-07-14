'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  white:     '#FFFFFF',
  green:     '#1A6B3A',
  greenMid:  '#2E8B57',
  greenBg:   '#EBF5EE',
  greenBd:   '#A8D5B5',
  darkGreen: '#0C3A20',
  text:      '#1A1A1A',
  muted:     '#5A6472',
  border:    '#DDE3E0',
  rowAlt:    '#F4F9F5',
  red:       '#C0392B',
  orange:    '#D68910',
};

const PAGE = { w: 595, h: 842, ml: 45, mr: 45, mt: 50, mb: 45 };
const COL  = PAGE.w - PAGE.ml - PAGE.mr;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fill(doc, color, x, y, w, h, r = 0) {
  doc.save().fillColor(rgb(color));
  r ? doc.roundedRect(x, y, w, h, r).fill() : doc.rect(x, y, w, h).fill();
  doc.restore();
}

function stroke(doc, color, x, y, w, h, r = 0, lw = 0.8) {
  doc.save().strokeColor(rgb(color)).lineWidth(lw);
  r ? doc.roundedRect(x, y, w, h, r).stroke() : doc.rect(x, y, w, h).stroke();
  doc.restore();
}

function hline(doc, y, x0 = PAGE.ml, x1 = PAGE.w - PAGE.mr, color = C.border) {
  doc.save().strokeColor(rgb(color)).lineWidth(0.4)
     .moveTo(x0, y).lineTo(x1, y).stroke().restore();
}

function posColor(pos) {
  if (!pos || pos === 0) return C.muted;
  if (pos <= 3)  return C.green;
  if (pos <= 10) return C.greenMid;
  if (pos <= 20) return C.orange;
  return C.red;
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function pageSetup(doc) {
  fill(doc, C.white, 0, 0, PAGE.w, PAGE.h);
  doc.page.margins.bottom = 0;
}

function topBar(doc) {
  fill(doc, C.green, 0, 0, PAGE.w, 5);
}

function pageHeader(doc, domain, scanDate) {
  fill(doc, C.darkGreen, 0, 5, PAGE.w, 28);
  fill(doc, C.green, 0, 5, 5, 28);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(rgb(C.white))
     .text('MentalidadWeb', PAGE.ml + 4, 12, { lineBreak: false });
  doc.fontSize(8).font('Helvetica').fillColor([160, 215, 180])
     .text('  ·  Informe SEO  ·  ' + domain, PAGE.ml + 82, 12, { lineBreak: false });
  doc.fontSize(7.5).font('Helvetica').fillColor([140, 195, 165])
     .text(scanDate, PAGE.w - PAGE.mr - 112, 13, { width: 112, align: 'right', lineBreak: false });
  return 42;
}

function sectionTitle(doc, y, title) {
  fill(doc, C.greenBg, PAGE.ml, y, COL, 23, 4);
  fill(doc, C.green, PAGE.ml, y, 4, 23, 2);
  doc.save().strokeColor(rgb(C.greenBd)).lineWidth(0.5)
     .roundedRect(PAGE.ml, y, COL, 23, 4).stroke().restore();
  doc.fontSize(9).font('Helvetica-Bold').fillColor(rgb(C.green))
     .text(title, PAGE.ml + 12, y + 6, { width: COL - 16, lineBreak: false });
  return y + 30;
}

function tHead(doc, y, cols) {
  fill(doc, C.green, PAGE.ml, y, COL, 18);
  let x = PAGE.ml;
  for (const col of cols) {
    doc.fontSize(7).font('Helvetica-Bold').fillColor(rgb(C.white))
       .text(col.label, x + 4, y + 5, { width: col.w - 6, align: col.align || 'left' });
    x += col.w;
  }
  return y + 18;
}

function tRow(doc, y, cols, vals, shade) {
  if (shade) fill(doc, C.rowAlt, PAGE.ml, y, COL, 17);
  hline(doc, y + 17, PAGE.ml, PAGE.ml + COL, C.border);
  let x = PAGE.ml;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const raw = vals[i];
    const str = String(raw ?? '—');
    const color = col.color ? col.color(raw) : C.text;
    doc.fontSize(7.5).font('Helvetica').fillColor(rgb(color))
       .text(str, x + 4, y + 4, { width: col.w - 6, align: col.align || 'left', lineBreak: false });
    x += col.w;
  }
  return y + 17;
}

function tRowFaded(doc, y, cols, vals, shade) {
  if (shade) fill(doc, C.rowAlt, PAGE.ml, y, COL, 17);
  hline(doc, y + 17, PAGE.ml, PAGE.ml + COL, '#EEEEEE');
  const fc = [210, 210, 210];
  let x = PAGE.ml;
  for (let i = 0; i < cols.length; i++) {
    doc.fontSize(7.5).font('Helvetica').fillColor(fc)
       .text(String(vals[i] ?? '—'), x + 4, y + 4,
             { width: cols[i].w - 6, align: cols[i].align || 'left', lineBreak: false });
    x += cols[i].w;
  }
  return y + 17;
}

function applyFadeOverlay(doc, top, bottom) {
  const fadeH = bottom - top;
  if (fadeH <= 0) return;
  const strips = 10;
  for (let s = 0; s < strips; s++) {
    const alpha = 0.12 + (s / (strips - 1)) * 0.86;
    doc.save().fillOpacity(alpha)
       .rect(PAGE.ml, top + (fadeH * s) / strips, COL, fadeH / strips + 1)
       .fill('#FFFFFF').restore();
  }
}

function drawGauge(doc, cx, cy, r, score, lbl) {
  const col = score >= 70 ? C.green : score >= 50 ? C.orange : C.red;
  const lw  = 8;
  doc.save().strokeColor(rgb(C.border)).lineWidth(lw).circle(cx, cy, r).stroke().restore();
  if (score > 0) {
    const startA = -Math.PI / 2;
    const endA   = startA + (Math.min(score, 100) / 100) * 2 * Math.PI;
    doc.save().strokeColor(rgb(col)).lineWidth(lw).lineCap('round');
    let first = true;
    for (let s = 0; s <= 72; s++) {
      const a  = startA + (endA - startA) * (s / 72);
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      if (first) { doc.moveTo(px, py); first = false; }
      else        { doc.lineTo(px, py); }
    }
    doc.stroke().restore();
  }
  doc.save().fillColor(rgb(C.white)).circle(cx, cy, r - lw + 0.5).fill().restore();
  doc.fontSize(18).font('Helvetica-Bold').fillColor(rgb(score >= 70 ? C.green : score >= 50 ? C.orange : C.red))
     .text(String(score) + '%', cx - r, cy - 13, { width: r * 2, align: 'center', lineBreak: false });
  doc.fontSize(6).font('Helvetica').fillColor(rgb(C.muted))
     .text(lbl || 'Performance', cx - r, cy + 9, { width: r * 2, align: 'center', lineBreak: false });
}

// Fila de problema/issue estilo WebCEO
function drawIssueRow(doc, y, status, title, value, desc) {
  const colMap = { ok: C.green, warn: C.orange, bad: C.red, info: C.muted };
  const bgMap  = { ok: '#F5FDF7', warn: '#FEFDF0', bad: '#FEF5F4', info: C.white };
  const col = colMap[status] || C.muted;
  const bg  = bgMap[status]  || C.white;
  const rH  = 32;

  fill(doc, bg, PAGE.ml, y, COL, rH);
  hline(doc, y + rH, PAGE.ml, PAGE.ml + COL, C.border);

  // Círculo de estado
  doc.save().fillColor(rgb(col)).circle(PAGE.ml + 14, y + rH / 2, 7).fill().restore();
  const icon = status === 'ok' ? '✓' : status === 'bad' ? '✗' : '!';
  doc.fontSize(8).font('Helvetica-Bold').fillColor(rgb(C.white))
     .text(icon, PAGE.ml + 10, y + rH / 2 - 5, { width: 9, align: 'center', lineBreak: false });

  // Título
  doc.fontSize(8).font('Helvetica-Bold').fillColor(rgb(C.text))
     .text(title, PAGE.ml + 28, y + 5, { width: COL - 150, lineBreak: false });

  // Descripción
  if (desc) {
    doc.fontSize(6.5).font('Helvetica').fillColor(rgb(C.muted))
       .text(desc, PAGE.ml + 28, y + 18, { width: COL - 150, lineBreak: false });
  }

  // Badge valor
  const vW = 110;
  fill(doc, col, PAGE.ml + COL - vW, y + 7, vW, 18, 3);
  doc.fontSize(7).font('Helvetica-Bold').fillColor(rgb(C.white))
     .text(value, PAGE.ml + COL - vW, y + 11, { width: vW, align: 'center', lineBreak: false });

  return y + rH;
}

// Card factor SEO — layout rediseñado con texto totalmente visible
function drawFactorGoogleCard(doc, cx, cy, cw, ch, status, category, title, value, desc) {
  const colMap = { good: C.green, warn: C.orange, bad: C.red, info: C.greenMid };
  const bgMap  = { good: '#F0FBF5', warn: '#FDF8EE', bad: '#FDF0EE', info: C.greenBg };
  const col = colMap[status] || C.muted;
  const bg  = bgMap[status]  || C.white;

  fill(doc, bg, cx, cy, cw, ch, 4);
  stroke(doc, C.border, cx, cy, cw, ch, 4, 0.5);
  fill(doc, col, cx, cy, 3, ch, 2);

  const pad  = 10;
  const textX = cx + pad;
  const textW = cw - pad * 2;

  // Fila superior: pill categoría (izquierda) + badge valor (derecha)
  const catW = 54;
  fill(doc, col, textX, cy + 7, catW, 12, 3);
  doc.fontSize(5.5).font('Helvetica-Bold').fillColor(rgb(C.white))
     .text(category.toUpperCase(), textX, cy + 10.5, { width: catW, align: 'center', lineBreak: false });

  const vW = 68;
  fill(doc, col, cx + cw - vW - pad, cy + 7, vW, 12, 3);
  doc.fontSize(6.5).font('Helvetica-Bold').fillColor(rgb(C.white))
     .text(value, cx + cw - vW - pad, cy + 10, { width: vW, align: 'center', lineBreak: false });

  // Título (con salto de línea)
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(rgb(C.text))
     .text(title, textX, cy + 25, { width: textW, lineBreak: true });

  // Descripción debajo del título
  const titleH = doc.heightOfString(title, { width: textW, fontSize: 7.5 });
  doc.fontSize(6.2).font('Helvetica').fillColor(rgb(C.muted))
     .text(desc, textX, cy + 25 + titleH + 2, { width: textW, lineBreak: true });
}

function footerLine(doc, pageNum, total, domain) {
  fill(doc, C.greenBg, 0, PAGE.h - 26, PAGE.w, 26);
  doc.save().strokeColor(rgb(C.greenBd)).lineWidth(0.5)
     .moveTo(0, PAGE.h - 26).lineTo(PAGE.w, PAGE.h - 26).stroke().restore();
  doc.fontSize(6.5).font('Helvetica-Bold').fillColor(rgb(C.green))
     .text('Mentalidad Web', PAGE.ml, PAGE.h - 18, { lineBreak: false });
  doc.fontSize(6.5).font('Helvetica').fillColor(rgb(C.muted))
     .text(`  ·  Reporte SEO  ·  ${domain}`, PAGE.ml + 66, PAGE.h - 18, { lineBreak: false });
  // Page badge
  fill(doc, C.green, PAGE.w - PAGE.mr - 34, PAGE.h - 22, 34, 16, 4);
  doc.fontSize(7).font('Helvetica-Bold').fillColor(rgb(C.white))
     .text(`${pageNum} / ${total}`, PAGE.w - PAGE.mr - 34, PAGE.h - 18, { width: 34, align: 'center', lineBreak: false });
}

// ─── Markdown / Rich-text renderer (shared by AI analysis + cover letter) ────

function renderMarkdownContent(doc, startY, domain, scanDate, mdLines) {
  let y = startY;
  for (const rawLine of mdLines) {
    if (y > PAGE.h - PAGE.mb - 50) {
      doc.addPage(); pageSetup(doc); topBar(doc);
      y = pageHeader(doc, domain, scanDate);
    }
    const line = rawLine.trim();
    if (!line) { y += 7; continue; }

    // Imagen embebida desde el editor: [IMG:data:image/...;base64,...]
    if (line.startsWith('[IMG:') && line.endsWith(']')) {
      const dataUrl = line.slice(5, -1);
      if (dataUrl.startsWith('data:')) {
        try {
          const b64 = dataUrl.split(',')[1];
          if (b64) {
            const imgBuf = Buffer.from(b64, 'base64');
            const maxW   = COL;
            const maxH   = 260;
            // Saltar de página si no cabe un mínimo razonable
            if (y + 80 > PAGE.h - PAGE.mb - 20) {
              doc.addPage(); pageSetup(doc); topBar(doc);
              y = pageHeader(doc, domain, scanDate);
            }
            // Renderizar centrada con fit para mantener proporción
            doc.image(imgBuf, PAGE.ml, y, { fit: [maxW, maxH], align: 'center', valign: 'top' });
            // Avanzar maxH (si la imagen es más pequeña habrá espacio extra — aceptable)
            y += maxH + 10;
          }
        } catch (_) { /* imagen inválida, ignorar */ }
      }
      continue;
    }

    // Heading (#, ##, ###)
    if (line.startsWith('#')) {
      const heading = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');
      if (y > PAGE.h - PAGE.mb - 60) {
        doc.addPage(); pageSetup(doc); topBar(doc);
        y = pageHeader(doc, domain, scanDate);
      }
      y += 4;
      fill(doc, C.greenBg, PAGE.ml, y, COL, 20, 4);
      stroke(doc, C.greenBd, PAGE.ml, y, COL, 20, 4, 0.5);
      fill(doc, C.green, PAGE.ml, y, 3, 20, 2);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(rgb(C.green))
         .text(heading, PAGE.ml + 10, y + 4, { width: COL - 16, lineBreak: false });
      y += 26;
      continue;
    }

    // List item (- / • / 1. / 2.)
    if (line.match(/^(\d+\.|[-•*])\s+/)) {
      const content  = line.replace(/^(\d+\.|[-•*])\s+/, '').replace(/\*\*/g, '');
      const numMatch = line.match(/^(\d+)\./);
      const prefix   = numMatch ? numMatch[1] + '.' : '•';
      const textH    = doc.heightOfString(content, { width: COL - 22, fontSize: 8 });
      if (y + textH + 6 > PAGE.h - PAGE.mb - 20) {
        doc.addPage(); pageSetup(doc); topBar(doc);
        y = pageHeader(doc, domain, scanDate);
      }
      doc.fontSize(8).font('Helvetica-Bold').fillColor(rgb(C.green))
         .text(prefix, PAGE.ml + 2, y, { width: 14, align: 'right', lineBreak: false });
      doc.fontSize(8).font('Helvetica').fillColor(rgb(C.text))
         .text(content, PAGE.ml + 18, y, { width: COL - 20, lineBreak: true });
      y += textH + 6;
      continue;
    }

    // Bold-only line (**text**)
    if (line.startsWith('**') && line.endsWith('**')) {
      const bold = line.replace(/^\*\*|\*\*$/g, '');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(rgb(C.text))
         .text(bold, PAGE.ml, y, { width: COL, lineBreak: false });
      y += 14;
      continue;
    }

    // Normal paragraph
    const cleaned = line.replace(/\*\*/g, '');
    const textH   = doc.heightOfString(cleaned, { width: COL, fontSize: 8.5 });
    if (y + textH + 6 > PAGE.h - PAGE.mb - 20) {
      doc.addPage(); pageSetup(doc); topBar(doc);
      y = pageHeader(doc, domain, scanDate);
    }
    doc.fontSize(8.5).font('Helvetica').fillColor(rgb(C.text))
       .text(cleaned, PAGE.ml, y, { width: COL, lineBreak: true });
    y += textH + 6;
  }
  return y;
}

// ─── Generador ────────────────────────────────────────────────────────────────

async function generateRawReport(raw, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.w, PAGE.h],
      margins: { top: PAGE.mt, bottom: PAGE.mb, left: PAGE.ml, right: PAGE.mr },
      bufferPages: true,
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.on('error', reject);
    stream.on('finish', resolve);
    stream.on('error', reject);

    const { domain, scanDate } = raw.meta;
    const { siteInfo, leadInfo, keywords, ses, rankingData, avgRankings, competitors, socialMetrics, backlinks } = raw;

    const sec = Object.assign(
      { incidencias: true, problemas: true, factores: true, posicionamiento: true, ai: true },
      raw.sections || {}
    );

    // ── Pre-cálculos ──────────────────────────────────────────────────────────
    const dofollow  = backlinks.filter(b => !b.link_nofollow).length;
    const nofollow  = backlinks.length - dofollow;
    const newLinks  = backlinks.filter(b => b.is_new).length;
    const dfRatio   = backlinks.length > 0 ? Math.round((dofollow / backlinks.length) * 100) : 0;

    const avgTF = backlinks.length
      ? Math.round(backlinks.reduce((s, b) => s + (b.domain_trusted_flow || 0), 0) / backlinks.length) : 0;
    const avgCF = backlinks.length
      ? Math.round(backlinks.reduce((s, b) => s + (b.domain_citation_flow || 0), 0) / backlinks.length) : 0;

    const toxBLs    = backlinks.filter(b => (b.domain_trusted_flow || 0) < 10 && (b.domain_citation_flow || 0) < 10);
    const toxCnt    = toxBLs.length;

    const sinPosicion = rankingData.filter(kw => kw.positions?.every(p => !p.scan_history?.slice(-1)[0]?.pos));
    const top10cnt    = rankingData.filter(kw => (kw.positions || []).some(p => {
      const pos = p.scan_history?.slice(-1)[0]?.pos;
      return pos && pos <= 10;
    })).length;

    const rankedPages = [];
    for (const kw of rankingData) {
      for (const pos of kw.positions || []) {
        const last = pos.scan_history?.slice(-1)[0];
        if (last?.pos > 0 && last?.url) {
          const path = last.url.replace(/^https?:\/\/[^/]+/, '') || '/';
          const existing = rankedPages.find(p => p.url === path);
          if (!existing) rankedPages.push({ url: path, keyword: kw.kw, pos: last.pos });
          else if (last.pos < existing.pos) { existing.pos = last.pos; existing.keyword = kw.kw; }
        }
      }
    }
    rankedPages.sort((a, b) => a.pos - b.pos);
    const top15 = rankedPages.slice(0, 15);

    const perf = Number((leadInfo && leadInfo.site_performance) || 0);
    const da   = Number((leadInfo && leadInfo.moz_domain_authority) || 0);
    const orgV = Number((leadInfo && leadInfo.organic_visits) || 0);

    // ── Datos para issues ─────────────────────────────────────────────────────
    const usabilityIssues = [
      {
        status: perf >= 70 ? 'ok' : perf >= 50 ? 'warn' : (perf > 0 ? 'bad' : 'info'),
        title:  'Velocidad de carga y rendimiento del sitio web',
        value:  perf > 0 ? `${perf}/100` : 'No analizado',
        desc:   perf >= 70 ? 'El sitio web carga rápido — buen rendimiento' : perf >= 50 ? 'Velocidad aceptable pero mejorable' : perf > 0 ? 'Sitio lento — afecta directamente al SEO y conversión' : 'Score de rendimiento no disponible',
      },
      {
        status: (siteInfo && siteInfo.title) ? 'ok' : 'bad',
        title:  'Etiqueta de título (Title Tag) en la página de inicio',
        value:  (siteInfo && siteInfo.title) ? 'Detectada' : 'No encontrada',
        desc:   (siteInfo && siteInfo.title) ? (siteInfo.title.slice(0, 60)) : 'Sin título — problema crítico: Google penaliza páginas sin título',
      },
      {
        status: (siteInfo && siteInfo.description) ? 'ok' : 'warn',
        title:  'Meta descripción configurada en la página de inicio',
        value:  (siteInfo && siteInfo.description) ? 'Detectada' : 'No encontrada',
        desc:   (siteInfo && siteInfo.description) ? (siteInfo.description.slice(0, 60) + (siteInfo.description.length > 60 ? '…' : '')) : 'Falta meta descripción — reduce el CTR en resultados de Google',
      },
      {
        status: (siteInfo && siteInfo.phone) ? 'ok' : 'warn',
        title:  'Número de teléfono visible en la página de inicio',
        value:  (siteInfo && siteInfo.phone) ? 'Visible' : 'No detectado',
        desc:   (siteInfo && siteInfo.phone) ? siteInfo.phone : 'Añadir teléfono aumenta la confianza del usuario y el SEO local',
      },
      {
        status: (siteInfo && siteInfo.email) ? 'ok' : 'warn',
        title:  'Email de contacto visible en la página de inicio',
        value:  (siteInfo && siteInfo.email) ? 'Visible' : 'No detectado',
        desc:   (siteInfo && siteInfo.email) ? siteInfo.email : 'Email de contacto no encontrado — afecta la señal E-E-A-T de Google',
      },
      {
        status: (siteInfo && siteInfo.address) ? 'ok' : 'warn',
        title:  'Dirección o ubicación física en la página de inicio',
        value:  (siteInfo && siteInfo.address) ? 'Visible' : 'No detectada',
        desc:   (siteInfo && siteInfo.address) ? (siteInfo.address.slice(0, 60)) : 'Dirección no encontrada — esencial para SEO local y confianza',
      },
      {
        status: top10cnt > 0 ? 'ok' : (keywords.length > 0 ? 'bad' : 'info'),
        title:  'Palabras clave objetivo posicionadas en los primeros 10 resultados',
        value:  top10cnt > 0 ? `${top10cnt} en Top 10` : 'Ninguna en Top 10',
        desc:   top10cnt > 0 ? `${top10cnt} de ${keywords.length} keywords en primeros 10 resultados de Google` : 'Ninguna keyword objetivo aparece en los primeros 10 resultados',
      },
      {
        status: orgV >= 500 ? 'ok' : (orgV >= 50 ? 'warn' : 'bad'),
        title:  'Tráfico orgánico mensual estimado del sitio web',
        value:  orgV > 0 ? `${orgV.toLocaleString()} vis/mes` : 'Sin datos',
        desc:   orgV >= 500 ? 'Buen volumen de tráfico orgánico mensual' : orgV >= 50 ? 'Bajo volumen de tráfico — hay potencial de mejora' : 'Tráfico orgánico muy bajo o no disponible',
      },
    ];

    const techIssues = [
      {
        status: da >= 30 ? 'ok' : (da >= 15 ? 'warn' : (da > 0 ? 'bad' : 'info')),
        title:  'Autoridad de dominio (Domain Authority — Moz)',
        value:  da > 0 ? `DA ${da}` : 'No disponible',
        desc:   da >= 30 ? 'Buena autoridad de dominio para competir en los buscadores' : da >= 15 ? 'Autoridad moderada — se puede mejorar con link building' : da > 0 ? 'DA muy bajo — dificulta el posicionamiento en términos competidos' : 'Sin datos de Domain Authority disponibles',
      },
      {
        status: backlinks.length >= 50 ? 'ok' : (backlinks.length > 0 ? 'warn' : 'bad'),
        title:  'Perfil de backlinks y enlaces entrantes al sitio',
        value:  backlinks.length >= 1000 ? '1.000+ backlinks' : `${backlinks.length} backlinks`,
        desc:   backlinks.length >= 50 ? `${dofollow} dofollow · ${nofollow} nofollow · ${newLinks} nuevos` : backlinks.length > 0 ? 'Pocos backlinks — necesita estrategia de link building' : 'Sin backlinks detectados — muy vulnerable en posicionamiento',
      },
      {
        status: avgTF >= 20 ? 'ok' : (avgTF >= 10 ? 'warn' : (backlinks.length > 0 ? 'bad' : 'info')),
        title:  'Trust Flow promedio de los backlinks (Majestic)',
        value:  backlinks.length > 0 ? `TF ${avgTF}` : 'Sin datos',
        desc:   avgTF >= 20 ? 'Buena calidad promedio de los sitios que enlazan' : avgTF >= 10 ? 'Calidad moderada de backlinks — priorizar enlaces de sitios relevantes' : 'Baja confianza en los backlinks — riesgo de penalización',
      },
      {
        status: dfRatio >= 60 ? 'ok' : (dfRatio >= 40 ? 'warn' : (backlinks.length > 0 ? 'bad' : 'info')),
        title:  'Ratio de enlaces Dofollow que transmiten PageRank',
        value:  backlinks.length > 0 ? `${dfRatio}% dofollow` : 'Sin datos',
        desc:   dfRatio >= 60 ? 'Buen ratio de enlaces que transmiten autoridad' : 'Mejorar la proporción de enlaces dofollow vs nofollow',
      },
      {
        status: toxCnt === 0 ? 'ok' : (toxCnt < 5 ? 'warn' : 'bad'),
        title:  'Posibles enlaces tóxicos detectados que apuntan al dominio',
        value:  toxCnt === 0 ? 'Ninguno' : `${toxCnt} detectados`,
        desc:   toxCnt === 0 ? 'No se encontraron enlaces tóxicos — perfil de backlinks limpio' : `${toxCnt} posibles enlaces con baja calidad — considerar lista de desavow`,
      },
      {
        status: sinPosicion.length === 0 ? 'ok' : (sinPosicion.length < keywords.length / 2 ? 'warn' : 'bad'),
        title:  'Palabras clave objetivo sin posición en ningún buscador',
        value:  sinPosicion.length === 0 ? 'Todas posicionadas' : `${sinPosicion.length} sin posición`,
        desc:   sinPosicion.length === 0 ? 'Todas las palabras clave tienen alguna posición detectada' : `${sinPosicion.length} keywords no aparecen en resultados — requieren optimización`,
      },
      {
        status: competitors.length >= 5 ? 'ok' : (competitors.length > 0 ? 'warn' : 'bad'),
        title:  'Competidores orgánicos identificados en los buscadores',
        value:  `${competitors.length} competidores`,
        desc:   competitors.length >= 5 ? `${competitors.length} competidores detectados en búsquedas orgánicas` : competitors.length > 0 ? 'Pocos competidores — ampliar análisis de competencia' : 'Sin competidores identificados — revisar keywords objetivo',
      },
      {
        status: newLinks > 0 ? 'ok' : 'warn',
        title:  'Nuevos backlinks adquiridos recientemente',
        value:  newLinks > 0 ? `${newLinks} nuevos` : 'Sin nuevos',
        desc:   newLinks > 0 ? `${newLinks} nuevos enlaces detectados en el último período` : 'Sin nuevos backlinks recientes — mantener actividad de link building',
      },
    ];

    const googleFactors = [
      {
        cat: 'CONTENIDO', status: 'good',
        title: 'Contenido original, útil y de calidad (Helpful Content)',
        value: 'Requerido',
        desc:  'Google penaliza el contenido creado para buscadores — debe estar orientado al usuario real',
      },
      {
        cat: 'E-E-A-T', status: da >= 30 && avgTF >= 15 ? 'good' : (da >= 15 ? 'warn' : 'bad'),
        title: 'Experiencia, Expertise, Autoridad y Confianza (E-E-A-T)',
        value: da >= 30 ? 'Alta' : da >= 15 ? 'Media' : 'Baja',
        desc:  'Autores identificables, sobre nosotros, premios, menciones externas y testimonios',
      },
      {
        cat: 'TÉCNICO', status: perf >= 70 ? 'good' : (perf >= 50 ? 'warn' : 'bad'),
        title: 'Core Web Vitals: LCP, INP y CLS (experiencia del usuario)',
        value: perf > 0 ? `${perf}/100` : '—',
        desc:  'Velocidad de carga, interactividad y estabilidad visual son factores de ranking confirmados',
      },
      {
        cat: 'TÉCNICO', status: perf >= 60 ? 'good' : 'warn',
        title: 'Optimización para dispositivos móviles (Mobile-First)',
        value: perf >= 60 ? 'Correcta' : 'Mejorable',
        desc:  'Google indexa y rankea la versión móvil — diseño responsive es obligatorio',
      },
      {
        cat: 'SEGURIDAD', status: 'good',
        title: 'Seguridad web (HTTPS y certificado SSL activo)',
        value: 'HTTPS',
        desc:  'HTTPS es factor de posicionamiento confirmado y genera confianza en los usuarios',
      },
      {
        cat: 'ON-PAGE', status: (siteInfo && siteInfo.title && siteInfo.description) ? 'good' : (siteInfo && siteInfo.title ? 'warn' : 'bad'),
        title: 'Optimización de Title Tag y Meta Description',
        value: (siteInfo && siteInfo.title && siteInfo.description) ? 'Completa' : 'Incompleta',
        desc:  'Title único con keyword principal + meta description atractiva aumentan el CTR orgánico',
      },
      {
        cat: 'ON-PAGE', status: 'warn',
        title: 'Datos estructurados y Schema.org (rich snippets)',
        value: 'Pendiente',
        desc:  'Schema de organización, producto, FAQ y reseñas mejoran la visibilidad en Google',
      },
      {
        cat: 'AUTORIDAD', status: da >= 30 && backlinks.length >= 50 ? 'good' : (da >= 15 ? 'warn' : 'bad'),
        title: 'Perfil de backlinks con autoridad y relevancia',
        value: `DA ${da || '—'}`,
        desc:  'Los backlinks de calidad son uno de los 3 factores más importantes de ranking en Google',
      },
      {
        cat: 'AUTORIDAD', status: toxCnt === 0 ? 'good' : (toxCnt < 5 ? 'warn' : 'bad'),
        title: 'Ausencia de penalizaciones y backlinks tóxicos',
        value: toxCnt === 0 ? 'Limpio' : `${toxCnt} tóxicos`,
        desc:  'Los enlaces tóxicos pueden causar penalizaciones manuales o algorítmicas de Google',
      },
      {
        cat: 'KEYWORDS', status: top10cnt > 0 ? 'good' : (keywords.length > 0 ? 'bad' : 'info'),
        title: 'Palabras clave posicionadas en el Top 10 de Google',
        value: top10cnt > 0 ? `${top10cnt} keywords` : 'Ninguna',
        desc:  'El Top 10 concentra el 90% del tráfico — estar fuera es prácticamente invisible',
      },
      {
        cat: 'LOCAL', status: (siteInfo && (siteInfo.phone || siteInfo.address)) ? 'good' : 'warn',
        title: 'Información NAP (Nombre, Dirección, Teléfono) visible',
        value: (siteInfo && siteInfo.phone && siteInfo.address) ? 'Completa' : 'Incompleta',
        desc:  'NAP consistente en web, Google Business y directorios es esencial para SEO local',
      },
      {
        cat: 'VISIBILIDAD', status: orgV >= 500 ? 'good' : (orgV >= 50 ? 'warn' : 'bad'),
        title: 'Tráfico orgánico y visibilidad en buscadores',
        value: orgV > 0 ? `${orgV.toLocaleString()}/mes` : '—',
        desc:  'El tráfico orgánico mensual es el indicador real de visibilidad en Google y otros buscadores',
      },
    ];

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG 1: PORTADA
    // ══════════════════════════════════════════════════════════════════════════
    pageSetup(doc);

    // ── Hero: fondo oscuro full-width ─────────────────────────────────────────
    const heroH = 280;
    fill(doc, C.darkGreen, 0, 0, PAGE.w, heroH);

    // Acento izquierdo (barra verde más brillante)
    fill(doc, C.green, 0, 0, 6, heroH);

    // Círculos decorativos (bajo opacidad, blancos)
    doc.save().fillOpacity(0.05).fillColor([255, 255, 255])
       .circle(PAGE.w - 20, 55, 135).fill().restore();
    doc.save().fillOpacity(0.04).fillColor([255, 255, 255])
       .circle(PAGE.w + 35, 220, 175).fill().restore();
    doc.save().fillOpacity(0.07).fillColor([255, 255, 255])
       .circle(PAGE.w - 80, 260, 80).fill().restore();
    doc.save().fillOpacity(0.03).fillColor([255, 255, 255])
       .circle(PAGE.ml + 30, heroH - 20, 90).fill().restore();

    // Nombre empresa (arriba izquierda)
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor([160, 215, 180])
       .text('MENTALIDAD WEB', PAGE.ml + 8, 22, { lineBreak: false });
    doc.fontSize(7).font('Helvetica').fillColor([100, 165, 130])
       .text('Agencia de Posicionamiento Web', PAGE.ml + 8, 34, { lineBreak: false });

    // Línea separadora sutil bajo la empresa
    doc.save().strokeColor([255, 255, 255]).strokeOpacity(0.08).lineWidth(0.5)
       .moveTo(PAGE.ml + 8, 48).lineTo(PAGE.w - PAGE.mr, 48).stroke().restore();

    // Títulos principales
    doc.fontSize(62).font('Helvetica-Bold').fillColor([255, 255, 255])
       .text('REPORTE', PAGE.ml + 8, 64, { lineBreak: false });
    doc.fontSize(62).font('Helvetica-Bold').fillColor([90, 210, 140])
       .text('SEO', PAGE.ml + 8, 134, { lineBreak: false });

    // Tagline + fecha
    doc.save().strokeColor([255, 255, 255]).strokeOpacity(0.12).lineWidth(0.5)
       .moveTo(PAGE.ml + 8, 218).lineTo(PAGE.w - PAGE.mr, 218).stroke().restore();
    doc.fontSize(9).font('Helvetica').fillColor([180, 225, 200])
       .text('Análisis completo de posicionamiento web', PAGE.ml + 8, 226, { lineBreak: false });
    doc.fontSize(8).font('Helvetica').fillColor([120, 175, 148])
       .text(`Generado el ${scanDate}`, PAGE.w - PAGE.mr - 130, 227, { width: 130, align: 'right', lineBreak: false });

    // ── Contenido bajo el hero ────────────────────────────────────────────────
    let y = heroH + 22;

    // Tarjeta de dominio
    fill(doc, C.greenBg, PAGE.ml, y, COL, 72, 8);
    doc.save().strokeColor(rgb(C.greenBd)).lineWidth(0.7)
       .roundedRect(PAGE.ml, y, COL, 72, 8).stroke().restore();
    fill(doc, C.green, PAGE.ml, y, 5, 72, 2);

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(rgb(C.muted))
       .text('DOMINIO ANALIZADO', PAGE.ml + 18, y + 12, { lineBreak: false });
    doc.fontSize(20).font('Helvetica-Bold').fillColor(rgb(C.text))
       .text(domain, PAGE.ml + 18, y + 28, { lineBreak: false });
    doc.fontSize(7).font('Helvetica').fillColor(rgb(C.muted))
       .text('Datos: WebCEO  ·  Moz  ·  Majestic', PAGE.ml + 18, y + 54, { lineBreak: false });

    // Badge "Informe SEO" en esquina derecha del card
    fill(doc, C.green, PAGE.ml + COL - 90, y + 24, 78, 18, 4);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(rgb(C.white))
       .text('INFORME SEO', PAGE.ml + COL - 90, y + 29, { width: 78, align: 'center', lineBreak: false });

    y += 84;

    // Título sección "contenido"
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(rgb(C.muted))
       .text('CONTENIDO DEL INFORME', PAGE.ml, y, { lineBreak: false });
    y += 14;

    // Tarjetas de secciones (5 en fila)
    const pages = [
      { num: '2', label: 'Incidencias SEO del sitio' },
      { num: '3', label: 'Usabilidad y técnico' },
      { num: '4', label: 'Factores Google' },
      { num: '5', label: 'Posicionamiento / Tóxicos' },
      { num: '6', label: 'Análisis IA — Gemini' },
    ];
    const pgW = Math.floor((COL - 5 * 4) / 5);
    pages.forEach((p, i) => {
      const px = PAGE.ml + i * (pgW + 5);
      fill(doc, C.white, px, y, pgW, 76, 6);
      doc.save().strokeColor(rgb(C.greenBd)).lineWidth(0.6)
         .roundedRect(px, y, pgW, 76, 6).stroke().restore();
      fill(doc, C.green, px, y, pgW, 4, 2);          // barra top
      fill(doc, C.darkGreen, px, y + 4, pgW, 3);     // sombra bajo barra

      // Número de página en círculo
      doc.save().fillColor(rgb(C.greenBg)).circle(px + pgW / 2, y + 28, 18).fill().restore();
      doc.save().strokeColor(rgb(C.greenBd)).lineWidth(0.6).circle(px + pgW / 2, y + 28, 18).stroke().restore();
      doc.fontSize(18).font('Helvetica-Bold').fillColor(rgb(C.green))
         .text(p.num, px, y + 19, { width: pgW, align: 'center', lineBreak: false });

      doc.fontSize(6.5).font('Helvetica').fillColor(rgb(C.muted))
         .text(p.label, px + 4, y + 54, { width: pgW - 8, align: 'center', lineBreak: true });
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG OPCIONAL: CARTA DE PRESENTACIÓN (desde el editor)
    // ══════════════════════════════════════════════════════════════════════════
    if (raw.coverLetter && raw.coverLetter.trim()) {
      doc.addPage(); pageSetup(doc); topBar(doc);
      let cy = pageHeader(doc, domain, scanDate);
      cy = sectionTitle(doc, cy, 'Informe Inicial');
      cy += 8;
      cy = renderMarkdownContent(doc, cy, domain, scanDate, raw.coverLetter.split('\n'));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG 2: INCIDENCIAS SEO
    // ══════════════════════════════════════════════════════════════════════════
    if (sec.incidencias) {
    doc.addPage(); pageSetup(doc); topBar(doc);
    y = pageHeader(doc, domain, scanDate);

    // Título sección
    fill(doc, C.greenBg, PAGE.ml, y, COL, 36, 5);
    stroke(doc, C.greenBd, PAGE.ml, y, COL, 36, 5);
    fill(doc, C.green, PAGE.ml, y, 4, 36, 2);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(rgb(C.text))
       .text('Incidencias SEO encontradas en la Web para:', PAGE.ml + 12, y + 6);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(rgb(C.green))
       .text(domain, PAGE.ml + 12, y + 21);
    y += 44;

    // Screenshot con browser chrome + barra de métricas
    // La imagen llega pre-procesada por Sharp: 970px ancho, crop a 700px de viewport
    // → al mostrarla en 485px (COL) queda a 2× → nitidez retina en PDF
    {
      const imgW  = COL;                              // 485px en PDF
      const imgH  = Math.round(imgW * 700 / 1280);   // ≈265px (prop. del crop de Sharp)
      const barH  = 24;
      const cardR = 7;

      // Card completo (chrome + imagen) con bordes redondeados
      doc.save().roundedRect(PAGE.ml, y, imgW, barH + imgH, cardR).clip();

      // Chrome bar
      fill(doc, '#1e1e1e', PAGE.ml, y, imgW, barH);

      // Traffic-light dots
      const dotY = y + barH / 2;
      doc.save().fillColor([255, 95, 87]).circle(PAGE.ml + 14, dotY, 4.5).fill().restore();
      doc.save().fillColor([255, 189, 46]).circle(PAGE.ml + 27, dotY, 4.5).fill().restore();
      doc.save().fillColor([40, 200, 80]).circle(PAGE.ml + 40, dotY, 4.5).fill().restore();

      // URL bar centrada
      const urlW = Math.round(imgW * 0.52);
      const urlX = PAGE.ml + Math.round((imgW - urlW) / 2);
      fill(doc, '#3a3a3a', urlX, y + 5, urlW, 14, 4);
      doc.fontSize(6).font('Helvetica').fillColor([180, 180, 180])
         .text('https://' + domain, urlX, y + 8, { width: urlW, align: 'center', lineBreak: false });

      // Imagen del sitio (pre-recortada y procesada por Sharp)
      if (siteInfo && siteInfo.screenshot) {
        try {
          doc.image(siteInfo.screenshot, PAGE.ml, y + barH, { width: imgW });
        } catch (_) {
          fill(doc, C.greenBg, PAGE.ml, y + barH, imgW, imgH);
          doc.fontSize(9).font('Helvetica').fillColor(rgb(C.muted))
             .text('Vista previa no disponible', PAGE.ml, y + barH + imgH / 2 - 5, { width: imgW, align: 'center', lineBreak: false });
        }
      } else {
        fill(doc, C.greenBg, PAGE.ml, y + barH, imgW, imgH);
        doc.fontSize(9).font('Helvetica').fillColor(rgb(C.muted))
           .text('Vista previa no disponible', PAGE.ml, y + barH + imgH / 2 - 5, { width: imgW, align: 'center', lineBreak: false });
      }

      doc.restore(); // fin clip del card

      // Borde exterior
      doc.save().strokeColor(rgb(C.border)).lineWidth(0.7)
         .roundedRect(PAGE.ml, y, imgW, barH + imgH, cardR).stroke().restore();

      y += barH + imgH + 8;
    }

    // Barra de métricas
    {
      const statItems = [
        { label: 'Performance', val: perf > 0 ? `${perf}/100` : '—',
          col: perf >= 70 ? C.green : perf >= 50 ? C.orange : perf > 0 ? C.red : C.muted },
        { label: 'Visitas / mes', val: orgV > 0 ? orgV.toLocaleString() : '—', col: C.green },
        { label: 'Keywords', val: String(keywords.length), col: C.greenMid },
        { label: 'Competidores', val: String(competitors.length), col: C.muted },
        { label: 'Backlinks', val: backlinks.length >= 1000 ? '1k+' : String(backlinks.length), col: C.muted },
      ];
      const sBarH = 46;
      const statW = Math.floor(COL / statItems.length);

      fill(doc, C.darkGreen, PAGE.ml, y, COL, sBarH, 6);

      statItems.forEach((s, i) => {
        const sx = PAGE.ml + i * statW;
        if (i > 0) {
          doc.save().strokeColor([255, 255, 255]).strokeOpacity(0.08).lineWidth(0.5)
             .moveTo(sx, y + 8).lineTo(sx, y + sBarH - 8).stroke().restore();
        }
        doc.fontSize(15).font('Helvetica-Bold').fillColor(rgb(s.col === C.muted ? C.greenBd : s.col))
           .text(s.val, sx, y + 8, { width: statW, align: 'center', lineBreak: false });
        doc.fontSize(5.5).font('Helvetica-Bold').fillColor([140, 195, 165])
           .text(s.label.toUpperCase(), sx, y + 29, { width: statW, align: 'center', lineBreak: false });
      });
      y += sBarH + 10;
    }

    // Páginas mejor posicionadas
    y = sectionTitle(doc, y, 'Páginas mejor posicionadas por los términos de búsqueda elegidos');
    {
      const ppCols = [
        { label: 'Página / URL',   w: 230, align: 'left' },
        { label: 'Palabra clave',  w: 155, align: 'left' },
        { label: 'Posición',       w: 55,  align: 'center', color: v => posColor(parseInt(String(v).replace('#', '')) || 0) },
        { label: 'Motor',          w: 65,  align: 'center' },
      ];
      const ppData = top15.map(p => [
        (p.url || '—').slice(0, 40),
        (p.keyword || '—').slice(0, 28),
        p.pos ? '#' + p.pos : '—',
        'Google',
      ]);
      y = tHead(doc, y, ppCols);
      ppData.slice(0, 6).forEach((r, i) => { y = tRow(doc, y, ppCols, r, i % 2 === 1); });
      if (ppData.length > 6) {
        const fadedTop = y;
        const maxFade  = Math.min(ppData.length - 6, Math.floor((PAGE.h - PAGE.mb - 90 - y) / 17));
        ppData.slice(6, 6 + maxFade).forEach((r, i) => { y = tRowFaded(doc, y, ppCols, r, i % 2 === 1); });
        applyFadeOverlay(doc, fadedTop, y);
      }
      y += 10;
    }

    // Tráfico orgánico comparativo
    y = sectionTitle(doc, y, 'Tráfico orgánico de los principales competidores y del sitio analizado');
    {
      const chartH = 98;
      const items  = [
        { label: domain.replace(/^www\./, '').slice(0, 22), visits: orgV, isOurs: true },
        ...competitors.slice(0, 5).map(c => ({
          label: (c.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '').slice(0, 22),
          visits: c.organic_visits || 0,
          isOurs: false,
        })),
      ];
      const maxV = Math.max(...items.map(i => i.visits), 1);
      const PL   = 110;
      const bW   = COL - PL - 8;
      const bH   = 11;
      const rowH = Math.floor((chartH - 16) / Math.max(items.length, 1));

      fill(doc, '#F7FAF8', PAGE.ml, y, COL, chartH, 5);
      stroke(doc, C.border, PAGE.ml, y, COL, chartH, 5, 0.5);

      items.forEach((item, i) => {
        const by   = y + 8 + i * rowH;
        const bLen = Math.max(3, Math.round((item.visits / maxV) * bW));
        const col3 = item.isOurs ? C.green : '#6BB8A0';
        doc.fontSize(6.5).font(item.isOurs ? 'Helvetica-Bold' : 'Helvetica').fillColor(rgb(C.text))
           .text(item.label, PAGE.ml + 4, by + Math.floor(bH / 2) - 3, { width: PL - 8, align: 'right', lineBreak: false });
        fill(doc, '#DDE8E2', PAGE.ml + PL, by, bW, bH, 2);
        fill(doc, col3, PAGE.ml + PL, by, bLen, bH, 2);
        if (item.visits > 0) {
          doc.fontSize(6).font('Helvetica').fillColor(rgb(C.white))
             .text(item.visits.toLocaleString(), PAGE.ml + PL + 3, by + 2, { lineBreak: false });
        }
      });

      y += chartH + 10;
    }
    } // end if (sec.incidencias)

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG 3: PROBLEMAS DE USABILIDAD + PROBLEMAS TÉCNICOS
    // ══════════════════════════════════════════════════════════════════════════
    if (sec.problemas) {
    doc.addPage(); pageSetup(doc); topBar(doc);
    y = pageHeader(doc, domain, scanDate);

    // ── Problemas de usabilidad ───────────────────────────────────────────────
    y = sectionTitle(doc, y, 'Problemas de usabilidad de la página de inicio');
    hline(doc, y, PAGE.ml, PAGE.ml + COL, C.greenBd);
    usabilityIssues.forEach(issue => {
      y = drawIssueRow(doc, y, issue.status, issue.title, issue.value, issue.desc);
    });
    y += 18;

    // ── Problemas técnicos ────────────────────────────────────────────────────
    y = sectionTitle(doc, y, 'Problemas técnicos que afectan el posicionamiento web');
    hline(doc, y, PAGE.ml, PAGE.ml + COL, C.greenBd);
    techIssues.forEach(issue => {
      y = drawIssueRow(doc, y, issue.status, issue.title, issue.value, issue.desc);
    });
    } // end if (sec.problemas)

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG 4: FACTORES SEO PRINCIPALES (DIRECTRICES DE CALIDAD DE GOOGLE)
    // ══════════════════════════════════════════════════════════════════════════
    if (sec.factores) {
    doc.addPage(); pageSetup(doc); topBar(doc);
    y = pageHeader(doc, domain, scanDate);

    y = sectionTitle(doc, y, 'Factores SEO principales — Directrices de calidad de Google');

    // Leyenda de colores
    {
      const legItems = [
        { col: C.green, label: 'Cumple' },
        { col: C.orange, label: 'Mejorable' },
        { col: C.red, label: 'Problema' },
      ];
      let lx = PAGE.ml + COL - 220;
      legItems.forEach(l => {
        doc.save().fillColor(rgb(l.col)).circle(lx + 5, y - 14, 4).fill().restore();
        doc.fontSize(7).font('Helvetica').fillColor(rgb(C.muted)).text(l.label, lx + 13, y - 18);
        lx += 70;
      });
    }

    {
      const fcCols = 2;
      const fcGap  = 8;
      const fcW    = Math.floor((COL - fcGap) / fcCols);
      const textW  = fcW - 20;

      // Calcular el alto real de cada tarjeta según su contenido
      function cardHeight(f) {
        const titleH = doc.heightOfString(f.title, { width: textW, fontSize: 7.5 });
        const descH  = doc.heightOfString(f.desc,  { width: textW, fontSize: 6.2 });
        return Math.max(58, 25 + titleH + 2 + descH + 8);
      }

      // Agrupar en filas y calcular altura de cada fila (máx de las dos columnas)
      const nRows = Math.ceil(googleFactors.length / fcCols);
      const rowHeights = [];
      for (let r = 0; r < nRows; r++) {
        const a = googleFactors[r * fcCols];
        const b = googleFactors[r * fcCols + 1];
        rowHeights.push(Math.max(a ? cardHeight(a) : 0, b ? cardHeight(b) : 0));
      }

      googleFactors.forEach((f, i) => {
        const col4 = i % fcCols;
        const row4 = Math.floor(i / fcCols);
        const fx   = PAGE.ml + col4 * (fcW + fcGap);
        const fy   = y + rowHeights.slice(0, row4).reduce((s, h) => s + h + 6, 0);
        drawFactorGoogleCard(doc, fx, fy, fcW, rowHeights[row4], f.status, f.cat, f.title, f.value, f.desc);
      });

      const totalH = rowHeights.reduce((s, h) => s + h + 6, 0);
      y += totalH + 10;
    }
    } // end if (sec.factores)

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG 5: POSICIONAMIENTO EN BUSCADORES + TÓXICOS
    // ══════════════════════════════════════════════════════════════════════════
    if (sec.posicionamiento) {
    doc.addPage(); pageSetup(doc); topBar(doc);
    y = pageHeader(doc, domain, scanDate);

    // Posicionamiento
    y = sectionTitle(doc, y, 'Posicionamiento de su web en los motores de búsqueda');
    {
      const rkSes  = ses.slice(0, 4);
      const seColW = rkSes.length > 0 ? Math.floor((COL - 185) / rkSes.length) : COL - 185;
      const rCols  = [
        { label: 'Palabra clave', w: 185, align: 'left' },
        ...(rkSes.length > 0
          ? rkSes.map(se => ({
              label: (se.label || se.name || ('SE' + se.se)).slice(0, 18),
              w: seColW,
              align: 'center',
              color: v => posColor(parseInt(String(v).replace('#', '')) || 0),
            }))
          : [{ label: 'Google', w: COL - 185, align: 'center', color: () => C.muted }]),
      ];

      y = tHead(doc, y, rCols);

      const rkRows = rankingData.map(kw => {
        const row = [(kw.kw || '—').slice(0, 32)];
        if (rkSes.length > 0) {
          rkSes.forEach(se => {
            const sePos = (kw.positions || []).find(p => p.se === se.se);
            const last  = sePos && sePos.scan_history && sePos.scan_history.slice(-1)[0];
            row.push(last && last.pos ? '#' + last.pos : '—');
          });
        } else {
          row.push('—');
        }
        return row;
      });

      rkRows.slice(0, 7).forEach((r, i) => { y = tRow(doc, y, rCols, r, i % 2 === 1); });
      if (rkRows.length > 7) {
        const fadedTop = y;
        const maxFade  = Math.min(rkRows.length - 7, Math.floor((PAGE.h - PAGE.mb - 150 - y) / 17));
        rkRows.slice(7, 7 + maxFade).forEach((r, i) => { y = tRowFaded(doc, y, rCols, r, i % 2 === 1); });
        applyFadeOverlay(doc, fadedTop, y);
      }
      y += 14;
    }

    // Tóxicos
    y = sectionTitle(doc, y, 'Posibles enlaces tóxicos que apuntan a la Web');
    {
      const toxCol = toxCnt > 0 ? C.red : C.green;
      const toxBg  = toxCnt > 0 ? '#FDECEA' : C.greenBg;
      const toxBd  = toxCnt > 0 ? '#E8B0A0' : C.greenBd;

      fill(doc, toxBg, PAGE.ml, y, COL, 44, 5);
      stroke(doc, toxBd, PAGE.ml, y, COL, 44, 5);
      fill(doc, toxCol, PAGE.ml, y, 4, 44, 2);
      doc.fontSize(28).font('Helvetica-Bold').fillColor(rgb(toxCol))
         .text(String(toxCnt), PAGE.ml + 8, y + 6, { width: 60, align: 'center', lineBreak: false });
      doc.fontSize(9).font('Helvetica-Bold').fillColor(rgb(toxCol))
         .text(toxCnt > 0 ? 'Posibles enlaces tóxicos detectados' : 'No se detectaron enlaces tóxicos',
               PAGE.ml + 74, y + 8);
      doc.fontSize(7.5).font('Helvetica').fillColor(rgb(C.muted))
         .text('Se consideran tóxicos: Trust Flow < 10 y Citation Flow < 10',
               PAGE.ml + 74, y + 22);
      y += 56;

      if (toxCnt > 0) {
        const tCols = [
          { label: 'Dominio origen',  w: 190, align: 'left' },
          { label: 'Trust Flow',      w: 72,  align: 'center', color: () => C.red },
          { label: 'Cit. Flow',       w: 62,  align: 'center' },
          { label: 'Nofollow',        w: 58,  align: 'center' },
          { label: 'URL destino',     w: 123, align: 'left' },
        ];
        y = tHead(doc, y, tCols);
        toxBLs.slice(0, 7).forEach((b, i) => {
          y = tRow(doc, y, tCols, [
            (b.source_domain || b.source_url || '—').replace(/^https?:\/\//, '').slice(0, 30),
            b.domain_trusted_flow || 0,
            b.domain_citation_flow || 0,
            b.link_nofollow ? 'Sí' : 'No',
            (b.target_url || domain).replace(/^https?:\/\/[^/]+/, '').slice(0, 20) || '/',
          ], i % 2 === 1);
        });
        if (toxBLs.length > 7) {
          const fadedTop = y;
          const maxFade  = Math.min(toxBLs.length - 7, Math.floor((PAGE.h - PAGE.mb - y) / 17));
          toxBLs.slice(7, 7 + maxFade).forEach((b, i) => {
            y = tRowFaded(doc, y, tCols, [
              (b.source_domain || b.source_url || '—').replace(/^https?:\/\//, '').slice(0, 30),
              b.domain_trusted_flow || 0, b.domain_citation_flow || 0,
              b.link_nofollow ? 'Sí' : 'No',
              (b.target_url || domain).replace(/^https?:\/\/[^/]+/, '').slice(0, 20) || '/',
            ], i % 2 === 1);
          });
          applyFadeOverlay(doc, fadedTop, y);
        }
      }
    }
    } // end if (sec.posicionamiento)

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG 6: ANÁLISIS IA (Gemini / editado por usuario)
    // ══════════════════════════════════════════════════════════════════════════
    if (sec.ai && raw.geminiAnalysis) {
      doc.addPage(); pageSetup(doc); topBar(doc);
      y = pageHeader(doc, domain, scanDate);

      y = sectionTitle(doc, y, 'Análisis IA — Diagnóstico generado por Inteligencia Artificial');
      y += 6;

      y = renderMarkdownContent(doc, y, domain, scanDate, raw.geminiAnalysis.split('\n'));

      y += 10;
      hline(doc, y);
      y += 8;
      doc.fontSize(6.5).font('Helvetica').fillColor(rgb(C.muted))
         .text(
           'Este análisis fue generado automáticamente por Google Gemini 2.5 Flash a partir de datos de WebCEO, Moz y Majestic. ' +
           'Las recomendaciones son orientativas y deben ser validadas por un especialista SEO antes de implementarse.',
           PAGE.ml, y, { width: COL }
         );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PÁG OPCIONAL: INFORME FINAL (desde el editor — al final del documento)
    // ══════════════════════════════════════════════════════════════════════════
    if (raw.finalReport && raw.finalReport.trim()) {
      doc.addPage(); pageSetup(doc); topBar(doc);
      let cy = pageHeader(doc, domain, scanDate);
      cy = sectionTitle(doc, cy, 'Informe Final');
      cy += 8;
      cy = renderMarkdownContent(doc, cy, domain, scanDate, raw.finalReport.split('\n'));
    }

    // ── Numeración de páginas ─────────────────────────────────────────────────
    const range      = doc.bufferedPageRange();
    const totalPages = range.count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;
      footerLine(doc, i + 1, totalPages, domain);
    }

    doc.end();
  });
}

module.exports = { generateRawReport };
