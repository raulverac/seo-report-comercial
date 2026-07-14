#!/usr/bin/env node
'use strict';

/**
 * index.js
 * ─────────────────────────────────────────────────────
 * SEO Report Generator — CLI principal
 *
 * Uso:
 *   node index.js <url> [opciones]
 *
 * Ejemplos:
 *   node index.js https://newfieldconsulting.com
 *   node index.js https://ejemplo.com --rescan
 *   node index.js https://ejemplo.com --output ./reportes/mi-reporte.pdf
 *
 * Variables de entorno (.env):
 *   WEBCEO_API_KEY   — obligatorio
 *   OUTPUT_DIR       — directorio de salida (default: ./output)
 *   COMPANY_NAME     — nombre de la empresa en el reporte
 *   COMPANY_PHONE    — teléfono en el reporte
 *   COMPANY_URL      — sitio web en el reporte
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');

const WebCEOClient = require('./webceo-client');
const { mapToReportData } = require('./data-mapper');
const SEOReportGenerator = require('./pdf-generator');

// ─── Colores ANSI simples (sin dependencias extra) ───────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};
const log = {
  info:  (msg) => console.log(`${c.cyan}ℹ${c.reset}  ${msg}`),
  ok:    (msg) => console.log(`${c.green}✓${c.reset}  ${msg}`),
  warn:  (msg) => console.log(`${c.yellow}⚠${c.reset}  ${msg}`),
  error: (msg) => console.error(`${c.red}✗${c.reset}  ${msg}`),
  step:  (n, t, msg) => console.log(`${c.gray}[${n}/${t}]${c.reset} ${msg}`),
  title: (msg) => console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}\n`),
};

// ─── Parseo de argumentos CLI ─────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    url: null,
    rescan: false,
    output: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a === '--rescan' || a === '-r') {
      opts.rescan = true;
    } else if ((a === '--output' || a === '-o') && args[i + 1]) {
      opts.output = args[++i];
    } else if (!a.startsWith('-')) {
      opts.url = a;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
${c.bold}SEO Report Generator${c.reset}
Genera un reporte PDF de SEO para cualquier URL usando la API de WebCEO.

${c.bold}Uso:${c.reset}
  node index.js <url> [opciones]

${c.bold}Opciones:${c.reset}
  --rescan, -r        Fuerza un re-escaneo completo en WebCEO
  --output, -o <ruta> Ruta de salida del PDF (default: ./output/<dominio>-YYYY-MM-DD.pdf)
  --help, -h          Muestra esta ayuda

${c.bold}Variables de entorno (.env):${c.reset}
  WEBCEO_API_KEY      API key de WebCEO ${c.red}(requerida)${c.reset}
  OUTPUT_DIR          Directorio de salida (default: ./output)
  COMPANY_NAME        Nombre empresa en el reporte
  COMPANY_PHONE       Teléfono en el reporte
  COMPANY_URL         URL empresa en el reporte

${c.bold}Ejemplos:${c.reset}
  node index.js https://newfieldconsulting.com
  node index.js https://ejemplo.com --rescan --output ./reportes/reporte.pdf
`);
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.url) {
    log.error('Debes proporcionar una URL. Ejemplo: node index.js https://ejemplo.com');
    printHelp();
    process.exit(1);
  }

  const apiKey = process.env.WEBCEO_API_KEY;
  if (!apiKey) {
    log.error('Falta la variable de entorno WEBCEO_API_KEY.');
    log.info('Copia .env.example a .env y agrega tu API key de WebCEO.');
    process.exit(1);
  }

  // Normalizar URL
  let siteUrl = opts.url;
  if (!siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
  const domain = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Configurar salida
  const outputDir = process.env.OUTPUT_DIR || './output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const outputPath = opts.output
    || path.join(outputDir, `seo-report-${domain.replace(/[^a-z0-9]/gi, '_')}-${dateStr}.pdf`);

  // Branding
  const branding = {
    companyName: process.env.COMPANY_NAME || 'Mentalidad Web Ltda',
    phone: process.env.COMPANY_PHONE || '+5626643163',
    url: process.env.COMPANY_URL || 'www.mentalidadweb.com',
  };

  log.title('SEO Report Generator — WebCEO + PDF');
  log.info(`Sitio a analizar : ${c.bold}${siteUrl}${c.reset}`);
  log.info(`Salida PDF       : ${c.bold}${outputPath}${c.reset}`);
  log.info(`Re-escaneo       : ${opts.rescan ? c.yellow + 'Sí' : c.gray + 'No (usa datos en caché)'}${c.reset}`);
  console.log();

  // ── PASO 1: Recopilar datos desde WebCEO ────────────────────────────────────
  const client = new WebCEOClient(apiKey);

  let rawData;
  try {
    rawData = await client.collectReportData(siteUrl, {
      forceRescan: opts.rescan,
      onProgress: (step, total, msg) => log.step(step, total, msg),
    });
  } catch (err) {
    log.error(`Error al obtener datos de WebCEO: ${err.message}`);
    if (err.message.includes('API key')) {
      log.warn('Verifica que tu WEBCEO_API_KEY sea válida y que tengas plan Agency Unlimited.');
    }
    process.exit(1);
  }

  console.log();
  log.ok(`Datos obtenidos para proyecto ID: ${c.bold}${rawData.meta.projectId}${c.reset}`);

  // ── PASO 2: Transformar datos ───────────────────────────────────────────────
  log.info('Mapeando datos al formato del reporte...');
  let reportData;
  try {
    reportData = mapToReportData(rawData);
  } catch (err) {
    log.error(`Error al procesar datos: ${err.message}`);
    process.exit(1);
  }

  // Mostrar resumen en consola
  const { summary } = reportData;
  console.log();
  console.log(`  ${c.bold}Rendimiento SEO:${c.reset} ${c.bold}${summary.seoScore}% — ${summary.scoreLabel}${c.reset}`);
  console.log(`  ${c.red}Errores:${c.reset}       ${summary.errorsTotal}`);
  console.log(`  ${c.yellow}Advertencias:${c.reset}  ${summary.warningsTotal}`);
  console.log(`  ${c.green}Están bien:${c.reset}    ${summary.okTotal}`);
  console.log();

  // ── PASO 3: Generar PDF ─────────────────────────────────────────────────────
  log.info('Generando PDF con diseño MentalidadWeb...');
  const generator = new SEOReportGenerator(branding);

  try {
    await generator.generate(reportData, outputPath);
  } catch (err) {
    log.error(`Error al generar el PDF: ${err.message}`);
    process.exit(1);
  }

  console.log();
  log.ok(`${c.bold}¡PDF generado exitosamente!${c.reset}`);
  log.ok(`Ruta: ${c.cyan}${path.resolve(outputPath)}${c.reset}`);
  console.log();
}

main().catch(err => {
  log.error(`Error inesperado: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
