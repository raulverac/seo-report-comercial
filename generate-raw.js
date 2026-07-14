'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { generateRawReport } = require('./pdf-raw-report');
const { scrapeSite } = require('./scrape-site');

const KEY = process.env.WEBCEO_API_KEY;
const API = 'https://online.webceo.com/api/';
let _id = Date.now();

async function call(method, data = {}) {
  const r = await axios.post(API, { method, key: KEY, id: String(++_id), data }, { timeout: 30000 });
  const res = Array.isArray(r.data) ? r.data[0] : r.data;
  if (res.errormsg) throw new Error(`[${method}] ${res.errormsg}`);
  return res.data;
}

async function collectData(siteUrl) {
  const domain = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  console.log('  Buscando proyecto...');
  const projects = await call('get_projects');
  let project = projects.find(p => {
    const d = (p.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    return d === domain.toLowerCase() || d.endsWith(domain.toLowerCase()) || domain.toLowerCase().endsWith(d);
  });

  if (!project) {
    console.log('  Creando proyecto...');
    const created = await call('add_project', { domain });
    project = { project: created?.project || created?.id };
  }

  const projectId = project.project || project.id;
  console.log(`  Proyecto: ${projectId}`);

  console.log('  Recopilando datos en paralelo...');
  const [siteInfo, kwData, sesData, rankData, avgData, compData, socialData, blData] = await Promise.all([
    scrapeSite(siteUrl),
    call('get_rankings_keywords', { project: projectId }).catch(() => ({ keywords: [] })),
    call('get_rankings_ses',      { project: projectId }).catch(() => ({ ses: [] })),
    call('get_rankings',          { project: projectId }).catch(() => ({ ranking_data: [] })),
    call('get_average_rankings',  { project: projectId }).catch(() => ({ avg_rankings: [] })),
    call('get_dangerous_competitors', { project: projectId }).catch(() => ({ competitors: [] })),
    call('get_social_metrics',    { project: projectId }).catch(() => ({ metrics: [] })),
    call('get_backlinks',         { project: projectId }).catch(() => ({ data: [] })),
  ]);

  return {
    siteInfo,
    meta: {
      domain,
      url: siteUrl,
      projectId,
      scanDate: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    keywords:     kwData?.keywords || [],
    ses:          sesData?.ses || [],
    rankingData:  rankData?.ranking_data || [],
    avgRankings:  avgData?.avg_rankings || [],
    competitors:  compData?.competitors || [],
    socialMetrics: socialData?.metrics || [],
    backlinks:    blData?.data || [],
  };
}

async function main() {
  if (!KEY) { console.error('Falta WEBCEO_API_KEY en .env'); process.exit(1); }

  const url = process.argv[2] || 'https://www.mentalidadweb.com';
  const domain = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const dateStr = new Date().toISOString().split('T')[0];
  const outDir = process.env.OUTPUT_DIR || './output';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `raw-data-${domain.replace(/[^a-z0-9]/gi, '_')}-${dateStr}.pdf`);

  console.log(`\n  SEO Raw Data Report`);
  console.log(`  Sitio  : ${url}`);
  console.log(`  Salida : ${outPath}\n`);

  const raw = await collectData(url);

  console.log(`  Keywords    : ${raw.keywords.length}`);
  console.log(`  Motores SE  : ${raw.ses.length}`);
  console.log(`  Rankings    : ${raw.rankingData.length}`);
  console.log(`  Avg history : ${raw.avgRankings.length} fechas`);
  console.log(`  Competidores: ${raw.competitors.length}`);
  console.log(`  Social pages: ${raw.socialMetrics.length}`);
  console.log(`  Backlinks   : ${raw.backlinks.length}`);

  console.log('\n  Generando PDF...');
  await generateRawReport(raw, outPath);

  console.log(`\n  ✓ PDF generado: ${path.resolve(outPath)}\n`);
  return outPath;
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
