'use strict';

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const md = fs.readFileSync(path.join(__dirname, 'MANUAL-v1.0.md'), 'utf8');

// ── Markdown → HTML (suficiente para este documento) ──────────────────────────
function mdToHtml(src) {
  return src
    // Escapar HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Código inline
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Negrita
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Cursiva
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Procesar línea a línea
    .split('\n')
    .reduce((acc, line, i, arr) => {
      acc.lines.push(line);
      return acc;
    }, { lines: [], out: [] })
    .lines
    .join('\n');
}

// Conversión completa en bloques
function convert(src) {
  const lines = src.split('\n');
  const out   = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H1
    if (/^# /.test(line)) {
      out.push(`<h1>${esc(line.slice(2))}</h1>`);
      i++; continue;
    }
    // H2
    if (/^## /.test(line)) {
      out.push(`<h2>${esc(line.slice(3))}</h2>`);
      i++; continue;
    }
    // H3
    if (/^### /.test(line)) {
      out.push(`<h3>${esc(line.slice(4))}</h3>`);
      i++; continue;
    }
    // H4
    if (/^#### /.test(line)) {
      out.push(`<h4>${esc(line.slice(5))}</h4>`);
      i++; continue;
    }
    // HR
    if (/^---+$/.test(line.trim())) {
      out.push('<hr>');
      i++; continue;
    }
    // Code block
    if (/^```/.test(line)) {
      const rows = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        rows.push(escRaw(lines[i]));
        i++;
      }
      out.push(`<pre><code>${rows.join('\n')}</code></pre>`);
      i++; continue;
    }
    // Tabla
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      out.push(buildTable(rows));
      continue;
    }
    // Lista
    if (/^[\-\*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[\-\*] /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    // Lista numerada
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    // Línea vacía
    if (line.trim() === '') {
      i++; continue;
    }
    // Párrafo
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return out.join('\n');
}

function esc(s)    { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escRaw(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,     '<em>$1</em>');
}

function buildTable(rows) {
  const html = ['<table>'];
  rows.forEach((row, idx) => {
    if (/^\|[-| :]+\|$/.test(row)) return; // separador
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    const tag   = idx === 0 ? 'th' : 'td';
    html.push('<tr>' + cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>');
  });
  html.push('</table>');
  return html.join('');
}

// ── HTML completo ──────────────────────────────────────────────────────────────
const body = convert(md);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green:      #1A6B3A;
    --green-light:#22a854;
    --green-bg:   #f0f7f3;
    --green-bd:   #b8d8c6;
    --text:       #1a1a1a;
    --muted:      #5a6a72;
    --border:     #dde4e0;
    --surface:    #f8faf9;
    --red:        #c0392b;
  }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 10pt;
    color: var(--text);
    line-height: 1.65;
    background: #fff;
  }

  /* ── COVER PAGE ─────────────────────────────── */
  .cover {
    width: 100%;
    height: 100vh;
    background: var(--green);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 60px 60px 60px;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }
  .cover::before {
    content: '';
    position: absolute;
    top: -120px; right: -120px;
    width: 480px; height: 480px;
    border-radius: 50%;
    background: rgba(255,255,255,0.05);
  }
  .cover::after {
    content: '';
    position: absolute;
    bottom: 80px; right: 60px;
    width: 220px; height: 220px;
    border-radius: 50%;
    background: rgba(255,255,255,0.04);
  }
  .cover-badge {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    margin-bottom: 20px;
  }
  .cover h1 {
    font-size: 42pt;
    font-weight: 800;
    color: #fff;
    letter-spacing: -2px;
    line-height: 1;
    margin-bottom: 8px;
  }
  .cover h1 span { color: rgba(255,255,255,0.4); }
  .cover-sub {
    font-size: 13pt;
    color: rgba(255,255,255,0.65);
    margin-bottom: 48px;
    font-weight: 400;
  }
  .cover-line {
    width: 60px; height: 3px;
    background: rgba(255,255,255,0.3);
    border-radius: 2px;
    margin-bottom: 32px;
  }
  .cover-meta {
    font-size: 9pt;
    color: rgba(255,255,255,0.5);
  }
  .cover-meta strong { color: rgba(255,255,255,0.85); }

  /* ── CONTENT ─────────────────────────────────── */
  .content {
    padding: 52px 64px;
  }

  h1 {
    font-size: 20pt;
    font-weight: 800;
    color: var(--green);
    letter-spacing: -0.5px;
    margin: 36px 0 14px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--green-bd);
    page-break-after: avoid;
  }
  h1:first-child { margin-top: 0; }

  h2 {
    font-size: 13pt;
    font-weight: 700;
    color: var(--text);
    margin: 28px 0 10px;
    padding: 8px 0 8px 14px;
    border-left: 3px solid var(--green);
    page-break-after: avoid;
  }

  h3 {
    font-size: 11pt;
    font-weight: 700;
    color: var(--green);
    margin: 20px 0 8px;
    page-break-after: avoid;
  }

  h4 {
    font-size: 10pt;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 16px 0 6px;
    page-break-after: avoid;
  }

  p {
    margin-bottom: 10px;
    color: var(--text);
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 18px;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th {
    background: var(--green);
    color: #fff;
    font-weight: 600;
    padding: 8px 12px;
    text-align: left;
    font-size: 9pt;
  }
  td {
    padding: 7px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tr:nth-child(even) td { background: var(--surface); }
  tr:last-child td { border-bottom: none; }

  /* Code */
  code {
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 8.5pt;
    background: var(--green-bg);
    color: var(--green);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid var(--green-bd);
  }
  pre {
    background: #1a1a1a;
    color: #d4e8da;
    border-radius: 8px;
    padding: 16px 18px;
    margin: 12px 0 16px;
    font-size: 8pt;
    line-height: 1.55;
    page-break-inside: avoid;
    overflow: hidden;
  }
  pre code {
    background: none;
    color: inherit;
    padding: 0;
    border: none;
    font-size: inherit;
  }

  /* Lists */
  ul, ol {
    margin: 8px 0 12px 22px;
  }
  li {
    margin-bottom: 5px;
  }
  li::marker { color: var(--green); }

  /* Blockquote → callout */
  blockquote, .callout {
    background: var(--green-bg);
    border-left: 4px solid var(--green);
    border-radius: 0 6px 6px 0;
    padding: 12px 16px;
    margin: 12px 0;
    color: var(--muted);
    font-size: 9.5pt;
    page-break-inside: avoid;
  }

  strong { color: var(--text); font-weight: 700; }
  em     { color: var(--muted); }

  /* ── TOC ──────────────────────────────────────── */
  .toc {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 24px 28px;
    margin: 20px 0 32px;
    page-break-inside: avoid;
  }
  .toc-title {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--muted);
    margin-bottom: 14px;
  }
  .toc ol {
    margin: 0 0 0 16px;
    counter-reset: toc;
  }
  .toc li {
    font-size: 10pt;
    color: var(--text);
    margin-bottom: 7px;
    font-weight: 500;
  }
  .toc li span {
    color: var(--muted);
    font-size: 9pt;
    font-weight: 400;
    margin-left: 4px;
  }

  /* ── FOOTER ──────────────────────────────────── */
  @page {
    margin: 18mm 18mm 22mm;
    @bottom-center {
      content: "SEO Report Generator v1.0 · Mentalidad Web · " counter(page);
      font-size: 8pt;
      color: #aaa;
    }
  }
</style>
</head>
<body>

<!-- PORTADA -->
<div class="cover">
  <div class="cover-badge">Mentalidad Web · Sistema Interno</div>
  <h1>SEO<br><span>REPORT</span></h1>
  <div class="cover-sub">Manual de Uso — Versión 1.0</div>
  <div class="cover-line"></div>
  <div class="cover-meta">
    <strong>SEO Report Generator</strong><br>
    Generador de reportes de prospectos · Julio 2026
  </div>
</div>

<!-- CONTENIDO -->
<div class="content">

<!-- TOC manual -->
<div class="toc">
  <div class="toc-title">Contenido</div>
  <ol>
    <li>¿Qué hace esta herramienta? <span>— Descripción general y fuentes de datos</span></li>
    <li>Acceso al sistema <span>— Login con email/contraseña y Google OAuth</span></li>
    <li>Pantalla principal <span>— Lista de prospectos e indicadores</span></li>
    <li>Seleccionar un prospecto <span>— Panel de detalle y métricas</span></li>
    <li>Generar PDF directo <span>— Flujo express paso a paso</span></li>
    <li>Modo Editor avanzado <span>— Inf. Inicial, Análisis IA, Inf. Final, secciones</span></li>
    <li>Contenido del PDF generado <span>— Qué aparece en cada página</span></li>
    <li>Cerrar sesión <span>— Cierre seguro de sesión</span></li>
    <li>Preguntas frecuentes <span>— Problemas comunes y soluciones</span></li>
  </ol>
</div>

${body}

</div>
</body>
</html>`;

// ── Generar PDF con Puppeteer ──────────────────────────────────────────────────
(async () => {
  const outPath = path.join(__dirname, 'output', 'MANUAL-SEO-Report-Generator-v1.0.pdf');
  fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });

  console.log('Iniciando Puppeteer…');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page    = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.pdf({
    path:   outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '18mm', bottom: '22mm', left: '18mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%;font-size:8px;color:#aaa;padding:0 18mm;display:flex;justify-content:space-between;align-items:center;">
        <span>SEO Report Generator v1.0 &nbsp;·&nbsp; Mentalidad Web Ltda</span>
        <span>Pág. <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>`,
  });

  await browser.close();
  console.log(`PDF generado: ${outPath}`);
})();
