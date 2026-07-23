'use strict';

require('dotenv').config();

const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const crypto    = require('crypto');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const session     = require('express-session');
const { OAuth2Client } = require('google-auth-library');

const googleClient = (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  : null;

const WebCEOClient  = require('./webceo-client');
const { mapToReportData } = require('./data-mapper');
const SEOReportGenerator  = require('./pdf-generator');
const { generateRawReport } = require('./pdf-raw-report');
const { scrapeSite } = require('./scrape-site');
const axios = require('axios');

// ─── SSRF protection ──────────────────────────────────────────────────────────
function isAllowedUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const host = parsed.hostname.toLowerCase();
  const BLOCKED = [/^localhost$/i, /^127\./, /^0\.0\.0/, /^10\./, /^192\.168\./, /^169\.254\./, /^::1$/, /^\[::1\]/];
  if (BLOCKED.some(re => re.test(host))) return false;
  const m = host.match(/^172\.(\d+)\./);
  if (m && parseInt(m[1]) >= 16 && parseInt(m[1]) <= 31) return false;
  if (!host.includes('.')) return false;
  return true;
}

const app  = express();
const PORT = process.env.PORT || 3000;

// Confiar en el proxy de Railway/cloud para que req.protocol sea https
app.set('trust proxy', 1);

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intente de nuevo en un minuto.' },
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espere 15 minutos.' },
});

app.use(express.json({ limit: '5mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'mw-seo-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (req.path === '/login.html' || req.path.startsWith('/auth/')) return next();
  if (req.session && req.session.user) return next();
  if (req.accepts('html')) return res.redirect('/login.html');
  return res.status(401).json({ error: 'Sesión expirada. Por favor recarga la página.' });
}
app.use(requireAuth);

// ─── Auth endpoints (antes de express.static para garantizar prioridad) ──────
const authRouter = express.Router();

authRouter.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string' || !email.toLowerCase().endsWith('@mentalidadweb.com'))
    return res.status(401).json({ error: 'Solo se permiten correos @mentalidadweb.com' });
  const adminPass = process.env.ADMIN_PASS;
  if (!adminPass || password !== adminPass)
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  req.session.user = email.toLowerCase();
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'No autenticado.' });
  res.json({ email: req.session.user });
});

authRouter.get('/config', (req, res) => {
  res.json({ googleEnabled: !!googleClient });
});

// Inicia el flujo OAuth 2.0 → redirige a Google
authRouter.get('/google/init', (req, res) => {
  if (!googleClient)
    return res.redirect('/login.html?error=' + encodeURIComponent('Google Sign-In no configurado. Agrega GOOGLE_CLIENT_SECRET en .env'));
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
  const url = googleClient.generateAuthUrl({
    access_type: 'online',
    scope: ['email', 'profile'],
    hd: 'mentalidadweb.com',
    redirect_uri: redirectUri,
  });
  res.redirect(url);
});

// Callback de Google → valida email y crea sesión
authRouter.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error)
    return res.redirect('/login.html?error=' + encodeURIComponent(error === 'access_denied' ? 'Acceso cancelado.' : 'Error de Google.'));
  if (!code)
    return res.redirect('/login.html?error=' + encodeURIComponent('No se recibió código de autorización.'));
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
    const { tokens }  = await googleClient.getToken({ code, redirect_uri: redirectUri });
    const ticket      = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload     = ticket.getPayload();
    const email       = (payload.email || '').toLowerCase();
    if (!payload.email_verified || !email.endsWith('@mentalidadweb.com'))
      return res.redirect('/login.html?error=' + encodeURIComponent('Solo se permiten correos @mentalidadweb.com'));
    req.session.user = email;
    res.redirect('/');
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect('/login.html?error=' + encodeURIComponent('Error al autenticar. Intenta de nuevo.'));
  }
});

app.use('/auth', authRouter);
app.use(express.static(path.join(__dirname, 'public')));

// ─── Cache de sesiones (TTL 30 min) ──────────────────────────────────────────
const reportCache = new Map();

// ─── Gemini AI Analysis ───────────────────────────────────────────────────────

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const https = require('https');
  const body  = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.75, maxOutputTokens: 8192 },
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path:     '/v1beta/models/gemini-2.5-flash:generateContent',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-goog-api-key': apiKey },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.candidates?.[0]?.content?.parts?.[0]?.text || null);
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

function buildGeminiPrompt(raw) {
  const { domain } = raw.meta;
  const { siteInfo, leadInfo, keywords, backlinks, competitors, rankingData } = raw;

  const perf     = Number((leadInfo && leadInfo.site_performance) || 0);
  const da       = Number((leadInfo && leadInfo.moz_domain_authority) || 0);
  const orgV     = Number((leadInfo && leadInfo.organic_visits) || 0);
  const dofollow = backlinks.filter(b => !b.link_nofollow).length;
  const nofollow = backlinks.length - dofollow;
  const newLinks = backlinks.filter(b => b.is_new).length;
  const dfRatio  = backlinks.length > 0 ? Math.round((dofollow / backlinks.length) * 100) : 0;
  const avgTF    = backlinks.length ? Math.round(backlinks.reduce((s, b) => s + (b.domain_trusted_flow  || 0), 0) / backlinks.length) : 0;
  const avgCF    = backlinks.length ? Math.round(backlinks.reduce((s, b) => s + (b.domain_citation_flow || 0), 0) / backlinks.length) : 0;
  const toxCnt   = backlinks.filter(b => (b.domain_trusted_flow || 0) < 10 && (b.domain_citation_flow || 0) < 10).length;
  const top10cnt = rankingData.filter(kw => (kw.positions || []).some(p => {
    const pos = p.scan_history?.slice(-1)[0]?.pos; return pos && pos <= 10;
  })).length;
  const top3cnt  = rankingData.filter(kw => (kw.positions || []).some(p => {
    const pos = p.scan_history?.slice(-1)[0]?.pos; return pos && pos <= 3;
  })).length;
  const sinPos   = rankingData.filter(kw => kw.positions?.every(p => !p.scan_history?.slice(-1)[0]?.pos)).length;

  const usab = [
    { item: 'Velocidad de carga (Performance score)',
      estado: perf >= 70 ? '✓ BUENO' : perf >= 50 ? '⚠ MEJORABLE' : perf > 0 ? '✗ CRÍTICO' : '? SIN DATOS',
      valor: perf > 0 ? `${perf}/100` : 'No analizado',
      detalle: perf >= 70 ? 'El sitio carga correctamente' : perf >= 50 ? 'Velocidad aceptable pero mejorable — impacta CTR y conversión' : perf > 0 ? 'Sitio MUY LENTO — Google penaliza y los usuarios abandonan' : '' },
    { item: 'Title Tag en la página de inicio',
      estado: (siteInfo && siteInfo.title) ? '✓ PRESENTE' : '✗ AUSENTE',
      valor: siteInfo && siteInfo.title ? `"${siteInfo.title.slice(0, 70)}"` : 'No encontrado',
      detalle: siteInfo && siteInfo.title ? `Longitud: ${siteInfo.title.length} caracteres` : 'Sin título — error SEO crítico que impide la indexación correcta' },
    { item: 'Meta descripción',
      estado: (siteInfo && siteInfo.description) ? '✓ PRESENTE' : '⚠ AUSENTE',
      valor: siteInfo && siteInfo.description ? `"${siteInfo.description.slice(0, 80)}…"` : 'No encontrada',
      detalle: siteInfo && siteInfo.description ? `Longitud: ${siteInfo.description.length} caracteres` : 'Sin meta description — reduce CTR en resultados de búsqueda hasta un 30%' },
    { item: 'Teléfono visible en homepage',
      estado: (siteInfo && siteInfo.phone) ? '✓ VISIBLE' : '⚠ NO ENCONTRADO',
      valor: siteInfo && siteInfo.phone ? siteInfo.phone : 'No detectado',
      detalle: siteInfo && siteInfo.phone ? 'Señal de confianza positiva para el usuario' : 'La ausencia de teléfono reduce conversiones y señales de confianza E-E-A-T' },
    { item: 'Email de contacto visible en homepage',
      estado: (siteInfo && siteInfo.email) ? '✓ VISIBLE' : '⚠ NO ENCONTRADO',
      valor: siteInfo && siteInfo.email ? siteInfo.email : 'No detectado',
      detalle: siteInfo && siteInfo.email ? 'Canal de contacto activo' : 'Sin email visible — barrera de contacto para el usuario' },
    { item: 'Dirección física en homepage',
      estado: (siteInfo && siteInfo.address) ? '✓ VISIBLE' : '⚠ NO ENCONTRADA',
      valor: siteInfo && siteInfo.address ? siteInfo.address : 'No detectada',
      detalle: siteInfo && siteInfo.address ? 'NAP completo — positivo para SEO local' : 'Sin dirección visible — afecta SEO local y confianza del usuario' },
    { item: 'Keywords en Top 10',
      estado: top10cnt > 0 ? '✓ CON POSICIÓN' : '✗ SIN PRESENCIA',
      valor: `${top10cnt} de ${keywords.length} keywords en Top 10`,
      detalle: top3cnt > 0 ? `${top3cnt} keywords en Top 3 (máxima visibilidad)` : 'Ninguna keyword en Top 3 — tráfico orgánico muy limitado' },
    { item: 'Tráfico orgánico mensual',
      estado: orgV >= 500 ? '✓ BUENO' : orgV >= 50 ? '⚠ BAJO' : '✗ MUY BAJO',
      valor: orgV > 0 ? `${orgV.toLocaleString()} visitas/mes` : 'No disponible',
      detalle: orgV >= 500 ? 'Volumen de tráfico orgánico saludable' : 'Bajo tráfico orgánico — el sitio no está siendo encontrado en Google' },
  ];

  const tech = [
    { item: 'Domain Authority (Moz DA)',
      estado: da >= 30 ? '✓ BUENO' : da >= 15 ? '⚠ MODERADO' : da > 0 ? '✗ BAJO' : '? SIN DATOS',
      valor: da > 0 ? `DA ${da}/100` : 'No disponible',
      detalle: da >= 30 ? 'Buena autoridad para competir en términos moderados' : da >= 15 ? 'Autoridad limitada — difícil posicionarse en términos competidos' : da > 0 ? 'DA muy bajo — prácticamente invisible en búsquedas competitivas' : '' },
    { item: 'Perfil de backlinks',
      estado: backlinks.length >= 50 ? '✓ ACEPTABLE' : backlinks.length > 0 ? '⚠ ESCASO' : '✗ CRÍTICO',
      valor: `${backlinks.length >= 1000 ? '1.000+' : backlinks.length} backlinks (${dofollow} dofollow · ${nofollow} nofollow · ${newLinks} nuevos)`,
      detalle: backlinks.length >= 50 ? 'Perfil con base de backlinks' : 'Muy pocos backlinks — alta vulnerabilidad ante competidores' },
    { item: 'Trust Flow promedio (Majestic)',
      estado: avgTF >= 20 ? '✓ BUENO' : avgTF >= 10 ? '⚠ MODERADO' : backlinks.length > 0 ? '✗ BAJO' : '? SIN DATOS',
      valor: backlinks.length > 0 ? `TF ${avgTF} · CF ${avgCF}` : 'Sin backlinks',
      detalle: avgTF >= 20 ? 'Backlinks de sitios confiables' : 'Baja confianza promedio — necesita backlinks de mayor calidad' },
    { item: 'Ratio Dofollow/Nofollow',
      estado: dfRatio >= 60 ? '✓ SALUDABLE' : dfRatio >= 40 ? '⚠ MEJORABLE' : backlinks.length > 0 ? '✗ DESEQUILIBRADO' : '? SIN DATOS',
      valor: backlinks.length > 0 ? `${dfRatio}% dofollow · ${100 - dfRatio}% nofollow` : 'Sin datos',
      detalle: dfRatio >= 60 ? 'Buena proporción de enlaces que transmiten autoridad' : 'Pocos enlaces dofollow — transmiten poco PageRank a Google' },
    { item: 'Posibles enlaces tóxicos',
      estado: toxCnt === 0 ? '✓ LIMPIO' : toxCnt < 5 ? '⚠ ALERTA' : '✗ PELIGROSO',
      valor: toxCnt === 0 ? 'Sin tóxicos detectados' : `${toxCnt} posibles tóxicos (TF < 10 y CF < 10)`,
      detalle: toxCnt === 0 ? 'No se detectaron señales de penalización por backlinks' : `${toxCnt} dominios de baja calidad apuntando al sitio — riesgo de penalización Google` },
    { item: 'Keywords sin posición',
      estado: sinPos === 0 ? '✓ ÓPTIMO' : sinPos < keywords.length / 2 ? '⚠ PARCIAL' : '✗ CRÍTICO',
      valor: `${sinPos} de ${keywords.length} keywords sin posición (${keywords.length > 0 ? Math.round((sinPos / keywords.length) * 100) : 0}%)`,
      detalle: sinPos === 0 ? 'Todas las keywords tienen alguna posición registrada' : `${sinPos} keywords no aparecen en ninguna posición — requieren optimización urgente` },
    { item: 'Competidores orgánicos identificados',
      estado: competitors.length >= 5 ? '✓ MAPEADOS' : competitors.length > 0 ? '⚠ POCOS' : '✗ SIN DATOS',
      valor: `${competitors.length} competidores`,
      detalle: competitors.length >= 3 ? `Principales: ${competitors.slice(0,3).map(c => c.domain || '').join(', ')}` : 'Pocos competidores identificados — revisar keywords objetivo' },
    { item: 'Nuevos backlinks recientes',
      estado: newLinks > 5 ? '✓ ACTIVO' : newLinks > 0 ? '⚠ LENTO' : '✗ INACTIVO',
      valor: `${newLinks} nuevos enlaces recientes`,
      detalle: newLinks > 5 ? 'Perfil de backlinks en crecimiento activo' : 'Crecimiento de backlinks estancado — estrategia de link building necesaria' },
  ];

  const usabLines = usab.map(u => `  [${u.estado}] ${u.item}: ${u.valor}\n    → ${u.detalle}`).join('\n');
  const techLines = tech.map(t => `  [${t.estado}] ${t.item}: ${t.valor}\n    → ${t.detalle}`).join('\n');

  return `Eres un consultor SEO senior con 10+ años de experiencia. Tu misión es generar un diagnóstico DETALLADO Y EXTENSO en español para el sitio web ${domain}.

ESTRUCTURA OBLIGATORIA (usa ## para cada título de sección):

## Situación General de ${domain}
## Análisis Detallado: Problemas de Usabilidad de la Página de Inicio
## Análisis Detallado: Problemas Técnicos de Posicionamiento
## Oportunidades Estratégicas Identificadas
## Plan de Acción Prioritario (ordenado por impacto)

REGLAS:
- Mínimo 600 palabras en total
- Cada sección mínimo 3-4 párrafos o puntos detallados
- Cita datos numéricos reales en cada sección
- Para "Plan de Acción" usa lista numerada con mínimo 8 acciones específicas
- Usa siempre el dominio ${domain}

════════════════════════════════════════
DATOS GENERALES
════════════════════════════════════════
Dominio: ${domain}
Performance: ${perf > 0 ? perf + '/100' : 'No disponible'}
Domain Authority: ${da > 0 ? da + '/100' : 'No disponible'}
Visitas orgánicas/mes: ${orgV > 0 ? orgV.toLocaleString() : 'No disponible'}
Keywords: ${keywords.length} total | Top 3: ${top3cnt} | Top 10: ${top10cnt} | Sin posición: ${sinPos}
Backlinks: ${backlinks.length >= 1000 ? '1.000+' : backlinks.length} | Dofollow: ${dofollow} (${dfRatio}%) | Tóxicos: ${toxCnt}
TF promedio: ${avgTF} | CF promedio: ${avgCF}
Competidores: ${competitors.length}
Título homepage: ${siteInfo && siteInfo.title ? '"' + siteInfo.title + '"' : 'NO CONFIGURADO'}
Meta descripción: ${siteInfo && siteInfo.description ? 'Configurada (' + siteInfo.description.length + ' chars)' : 'NO ENCONTRADA'}

════════════════════════════════════════
PROBLEMAS DE USABILIDAD
════════════════════════════════════════
${usabLines}

════════════════════════════════════════
PROBLEMAS TÉCNICOS
════════════════════════════════════════
${techLines}`;
}

// ─── Función compartida: fetch de datos del prospecto ────────────────────────

async function fetchLeadData(leadId, apiKey) {
  const leads = await apiCall(apiKey, 'get_leads');
  const lead  = (Array.isArray(leads) ? leads : []).find(l => l.lead === leadId);
  if (!lead) throw new Error('Prospecto no encontrado.');

  const domain  = lead.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const siteUrl = `https://${domain}`;

  const projects = await apiCall(apiKey, 'get_projects');
  let project = projects.find(p => {
    const d = (p.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    return d === domain.toLowerCase() || d.endsWith(domain.toLowerCase()) || domain.toLowerCase().endsWith(d);
  });
  if (!project) {
    const created = await apiCall(apiKey, 'add_project', { domain });
    project = { project: created?.project || created?.id };
  }
  const projectId = project.project || project.id;

  const [siteInfo, kwData, sesData, rankData, avgData, compData, socialData, blData] = await Promise.all([
    scrapeSite(siteUrl),
    apiCall(apiKey, 'get_rankings_keywords', { project: projectId }).catch(() => ({ keywords: [] })),
    apiCall(apiKey, 'get_rankings_ses',      { project: projectId }).catch(() => ({ ses: [] })),
    apiCall(apiKey, 'get_rankings',          { project: projectId }).catch(() => ({ ranking_data: [] })),
    apiCall(apiKey, 'get_average_rankings',  { project: projectId }).catch(() => ({ avg_rankings: [] })),
    apiCall(apiKey, 'get_dangerous_competitors', { project: projectId }).catch(() => ({ competitors: [] })),
    apiCall(apiKey, 'get_social_metrics',    { project: projectId }).catch(() => ({ metrics: [] })),
    apiCall(apiKey, 'get_backlinks',         { project: projectId }).catch(() => ({ data: [] })),
  ]);

  return {
    siteInfo,
    leadInfo: lead,
    meta: {
      domain, url: siteUrl, projectId,
      scanDate: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    keywords:      kwData?.keywords || [],
    ses:           sesData?.ses || [],
    rankingData:   rankData?.ranking_data || [],
    avgRankings:   avgData?.avg_rankings || [],
    competitors:   compData?.competitors || [],
    socialMetrics: socialData?.metrics || [],
    backlinks:     blData?.data || [],
  };
}

const API_URL = 'https://online.webceo.com/api/';
let _reqId = Date.now();

async function apiCall(key, method, data = {}) {
  const r = await axios.post(API_URL, { method, key, id: String(++_reqId), data }, { timeout: 30000 });
  const res = Array.isArray(r.data) ? r.data[0] : r.data;
  if (res.errormsg) {
    const msg = typeof res.errormsg === 'object' ? JSON.stringify(res.errormsg) : String(res.errormsg);
    throw new Error(`[${method}] ${msg}`);
  }
  return res.data;
}

// ─── Endpoint: lista de prospectos ───────────────────────────────────────────
app.get('/api/leads', async (req, res) => {
  const apiKey = process.env.WEBCEO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'WEBCEO_API_KEY no configurada en .env' });
  try {
    const leads = await apiCall(apiKey, 'get_leads');
    res.json(Array.isArray(leads) ? leads : []);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('403') || msg.includes('permission')) {
      return res.status(403).json({
        error: 'API key de WebCEO sin permisos o expirada. Regenera la key en WebCEO → Settings → API y actualiza WEBCEO_API_KEY en el archivo .env',
      });
    }
    res.status(500).json({ error: msg });
  }
});

// ─── Endpoint: crear prospecto ────────────────────────────────────────────────
app.post('/api/leads', async (req, res) => {
  const { domain, client_name, client_email, target_location, target_language, keywords, client_notes } = req.body || {};

  if (!domain || typeof domain !== 'string' || !domain.trim())
    return res.status(400).json({ error: 'El dominio es obligatorio.' });

  const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  if (!cleanDomain.includes('.') || cleanDomain.length < 4)
    return res.status(400).json({ error: 'Ingresa un dominio válido (ej: cliente.cl)' });

  if (!isAllowedUrl(`https://${cleanDomain}`))
    return res.status(400).json({ error: 'Dominio no permitido.' });

  const apiKey = process.env.WEBCEO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'WEBCEO_API_KEY no configurada.' });

  const kwList = Array.isArray(keywords) && keywords.length
    ? keywords.slice(0, 50).map(k => String(k).trim().slice(0, 100)).filter(Boolean)
    : [];

  // WebCEO puede esperar domain con o sin protocolo — probar ambas variantes
  const domainVariants = [cleanDomain, `https://${cleanDomain}`];

  for (const domainVal of domainVariants) {
    const data = { domain: domainVal };
    if (client_name)     data.client_name     = String(client_name).trim().slice(0, 200);
    if (client_email)    data.client_email    = String(client_email).trim().slice(0, 200);
    if (target_location) data.target_location = String(target_location).trim().slice(0, 200);
    if (target_language) data.target_language = String(target_language).trim().slice(0, 100);
    if (client_notes)    data.client_notes    = String(client_notes).trim().slice(0, 2000);
    if (kwList.length)   data.keywords        = kwList;

    try {
      const result = await apiCall(apiKey, 'add_lead', data);
      return res.json({ ok: true, lead: result });
    } catch (err) {
      const msg = err.message || '';
      console.error(`Error add_lead (domain="${domainVal}"):`, msg);
      // Si la primera variante falla con error de dominio, probar la otra
      if (domainVal === cleanDomain && (msg.includes('domain') || msg.includes('invalid') || msg.includes('format') || msg.includes('url'))) {
        continue;
      }
      return res.status(500).json({ error: msg || 'Error al crear el prospecto en WebCEO.' });
    }
  }
  return res.status(500).json({ error: 'No se pudo crear el prospecto: dominio rechazado por WebCEO.' });
});

// ─── Endpoint: pre-fetch de datos para el editor ─────────────────────────────
app.post('/api/prefetch-report', async (req, res) => {
  const { leadId } = req.body;
  if (!leadId || typeof leadId !== 'string' || !/^[\w-]{1,64}$/.test(leadId))
    return res.status(400).json({ error: 'leadId inválido.' });
  const apiKey = process.env.WEBCEO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'WEBCEO_API_KEY no configurada.' });

  try {
    const raw = await fetchLeadData(leadId, apiKey);

    // Análisis IA con Gemini
    try {
      const aiText = await callGemini(buildGeminiPrompt(raw));
      if (aiText) raw.geminiAnalysis = aiText;
    } catch (_) {}

    // Guardar en caché (TTL 30 min)
    const sessionKey = crypto.randomBytes(12).toString('hex');
    reportCache.set(sessionKey, raw);
    setTimeout(() => reportCache.delete(sessionKey), 30 * 60 * 1000);

    res.json({
      sessionKey,
      domain:         raw.meta.domain,
      scanDate:       raw.meta.scanDate,
      geminiAnalysis: raw.geminiAnalysis || '',
      siteTitle:      raw.siteInfo?.title || '',
    });

  } catch (err) {
    console.error('Error prefetch:', err.message);
    res.status(500).json({ error: 'Error al obtener datos del prospecto.' });
  }
});

// ─── Endpoint: generación de PDF (con o sin edición previa) ──────────────────
app.post('/api/generate-raw', async (req, res) => {
  const { leadId, sessionKey, overrides } = req.body;
  const apiKey = process.env.WEBCEO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'WEBCEO_API_KEY no configurada.' });

  let raw, tmpPath;

  try {
    if (sessionKey && reportCache.has(sessionKey)) {
      // Usar datos cacheados del editor
      raw = { ...reportCache.get(sessionKey) };
      // No borramos el caché, puede regenerar varias veces
    } else if (leadId) {
      // Flujo directo: fetch desde cero
      raw = await fetchLeadData(leadId, apiKey);
      try {
        const aiText = await callGemini(buildGeminiPrompt(raw));
        if (aiText) raw.geminiAnalysis = aiText;
      } catch (_) {}
    } else {
      return res.status(400).json({ error: 'leadId o sessionKey requerido.' });
    }

    // Aplicar overrides del editor
    if (overrides) {
      if (overrides.geminiAnalysis !== undefined) raw.geminiAnalysis = overrides.geminiAnalysis;
      if (overrides.coverLetter    !== undefined) raw.coverLetter    = overrides.coverLetter;
      if (overrides.finalReport    !== undefined) raw.finalReport    = overrides.finalReport;
      if (overrides.sections       !== undefined) raw.sections       = overrides.sections;
    }

    const domain = raw.meta.domain;
    tmpPath = path.join(os.tmpdir(), `raw-report-${domain.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.pdf`);

    await generateRawReport(raw, tmpPath);

    const dateStr   = new Date().toISOString().split('T')[0];
    const filename  = `raw-data-${domain.replace(/[^a-z0-9]/gi, '_')}-${dateStr}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);
    stream.on('end',  () => fs.unlink(tmpPath, () => {}));
    stream.on('error', () => {
      fs.unlink(tmpPath, () => {});
      if (!res.headersSent) res.status(500).json({ error: 'Error al leer el PDF.' });
    });

  } catch (err) {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    console.error('Error raw report:', err.message);
    res.status(500).json({ error: 'Error al generar el reporte.' });
  }
});

app.post('/api/generate', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL requerida.' });
  const apiKey = process.env.WEBCEO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'WEBCEO_API_KEY no configurada.' });

  let siteUrl = url.trim();
  if (!siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
  if (!isAllowedUrl(siteUrl)) return res.status(400).json({ error: 'URL no permitida.' });
  const domain  = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const tmpPath = path.join(os.tmpdir(), `seo-report-${domain.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.pdf`);

  try {
    const client     = new WebCEOClient(apiKey);
    const rawData    = await client.collectReportData(siteUrl, {});
    const reportData = mapToReportData(rawData);
    const generator  = new SEOReportGenerator({ companyName: process.env.COMPANY_NAME || 'Mentalidad Web Ltda', phone: process.env.COMPANY_PHONE || '+5626643163', url: process.env.COMPANY_URL || 'www.mentalidadweb.com' });
    await generator.generate(reportData, tmpPath);

    const dateStr  = new Date().toISOString().split('T')[0];
    const filename = `seo-report-${domain.replace(/[^a-z0-9]/gi, '_')}-${dateStr}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);
    stream.on('end',   () => fs.unlink(tmpPath, () => {}));
    stream.on('error', () => { fs.unlink(tmpPath, () => {}); if (!res.headersSent) res.status(500).json({ error: 'Error al leer el PDF generado.' }); });
  } catch (err) {
    fs.unlink(tmpPath, () => {});
    console.error('Error generando reporte:', err.message);
    res.status(500).json({ error: 'Error al generar el reporte.' });
  }
});

// ─── Centralized error handler ────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Error no manejado:', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`\n  SEO Report Generator en http://localhost:${PORT}`);
  if (process.env.ADMIN_PASS) console.log(`  Auth: correo @mentalidadweb.com + contraseña en ADMIN_PASS del .env\n`);
  else console.log(`  ⚠  ADMIN_PASS no configurado — login rechazará todas las contraseñas\n`);
});
