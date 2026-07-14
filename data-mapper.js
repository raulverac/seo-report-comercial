'use strict';

/**
 * data-mapper.js
 * Transforma la respuesta cruda de la API de WebCEO a la
 * estructura normalizada que usa el generador de PDF.
 *
 * Los campos se mapean 1:1 con las secciones del reporte
 * original de MentalidadWeb.
 */

/**
 * Calcula el rendimiento SEO global (0-100) desde los datos.
 * Lógica inspirada en los criterios del reporte original.
 */
function calcSeoScore(data) {
  let score = 0;
  let total = 0;

  const { siteAudit = {}, rankings = {}, backlinks = {}, pageSpeed = {} } = data;

  // Errores técnicos (peso: 30 pts)
  const errors = siteAudit.errors_count ?? siteAudit.errors ?? 0;
  const warnings = siteAudit.warnings_count ?? siteAudit.warnings ?? 0;
  total += 30;
  score += Math.max(0, 30 - (errors * 1.2) - (warnings * 0.3));

  // Rankings (peso: 25 pts)
  const kwList = rankings.keywords || [];
  const inTop10 = kwList.filter(k => {
    const pos = k.position ?? k.rank ?? 999;
    return pos <= 10 && pos > 0;
  }).length;
  total += 25;
  if (kwList.length > 0) score += (inTop10 / kwList.length) * 25;

  // Velocidad (peso: 20 pts)
  const mobileSpeed = pageSpeed.mobile_score ?? pageSpeed.mobile ?? 0;
  const desktopSpeed = pageSpeed.desktop_score ?? pageSpeed.desktop ?? 0;
  total += 20;
  score += ((mobileSpeed + desktopSpeed) / 200) * 20;

  // Backlinks / autoridad (peso: 25 pts)
  const trustFlow = backlinks.trust_flow ?? backlinks.tf ?? 0;
  const citationFlow = backlinks.citation_flow ?? backlinks.cf ?? 0;
  total += 25;
  score += Math.min(25, ((trustFlow + citationFlow) / 100) * 25);

  const pct = Math.round((score / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

function scoreLabel(score) {
  if (score >= 80) return 'Bueno';
  if (score >= 60) return 'Regular';
  if (score >= 40) return 'Pobre';
  return 'Crítico';
}

/**
 * Extrae las keywords con su posición para cada motor de búsqueda.
 */
function mapKeywordRankings(rankingsData) {
  const keywords = rankingsData?.keywords || [];
  const ses = rankingsData?.ses || [];
  const data = rankingsData?.data || {};

  return keywords.map(kw => {
    const kwText = kw.keyword || kw.name || kw;
    const positions = {};

    ses.forEach(se => {
      const seName = se.name || se.se || se;
      const pos = data?.[kwText]?.[seName]?.position
        ?? data?.[kwText]?.[seName]?.rank
        ?? null;
      positions[seName] = pos && pos > 0 ? pos : 'No en el Top 10';
    });

    return { keyword: kwText, positions };
  });
}

/**
 * Mapea datos de competidores al formato del reporte.
 */
function mapCompetitors(competitors = []) {
  return competitors.slice(0, 10).map(c => ({
    domain: c.domain || c.url || '—',
    keywords: Array.isArray(c.keywords)
      ? c.keywords.join(', ')
      : (c.keyword || c.keywords || '—'),
    trafficShare: c.traffic_share ?? c.traffic ?? 0,
  }));
}

/**
 * Mapea auditoría técnica.
 */
function mapTechnicalIssues(siteAudit = {}) {
  return {
    errorsTotal: siteAudit.errors_count ?? siteAudit.errors ?? 0,
    warningsTotal: siteAudit.warnings_count ?? siteAudit.warnings ?? 0,
    okTotal: siteAudit.ok_count ?? siteAudit.ok ?? 0,
    pagesScanned: siteAudit.pages_scanned ?? siteAudit.crawled_pages ?? 18,
    // Problemas técnicos específicos
    notFound404: siteAudit.not_found_pages ?? siteAudit.error_404_count ?? 0,
    brokenLinks: siteAudit.broken_links_count ?? siteAudit.broken_links ?? 0,
    serverErrors: siteAudit.server_error_pages ?? 0,
    brokenImages: siteAudit.broken_images_count ?? siteAudit.broken_images ?? 0,
    accessProblems: siteAudit.access_error_pages ?? 0,
    slowPages: siteAudit.slow_pages ?? 0,
    // On-page SEO
    missingTitles: siteAudit.missing_title_count ?? siteAudit.pages_without_title ?? 0,
    missingDescriptions: siteAudit.missing_description_count ?? siteAudit.bad_description ?? 0,
    missingH1: siteAudit.missing_h1_count ?? siteAudit.pages_without_h1 ?? 0,
    duplicateTitles: siteAudit.duplicate_title_count ?? 0,
    nonSeoFriendlyUrls: siteAudit.non_seo_friendly_urls ?? 0,
    excessOutboundLinks: siteAudit.excessive_outbound_links ?? 0,
    badRedirects: siteAudit.bad_redirects ?? 0,
    // Keywords en áreas clave
    keywordsInImportantAreas: siteAudit.keywords_missing_areas ?? 5,
    // Imágenes
    imagesWithoutAlt: siteAudit.images_without_alt ?? 0,
    // Sitemap / Robots
    sitemapOk: siteAudit.sitemap_ok ?? true,
    robotsOk: siteAudit.robots_ok ?? true,
    // Google indexing
    indexedPages: siteAudit.indexed_pages ?? siteAudit.google_index ?? 0,
    // Google Analytics
    hasAnalytics: siteAudit.has_analytics ?? false,
  };
}

/**
 * Mapea datos de backlinks.
 */
function mapBacklinks(backlinks = {}) {
  return {
    totalBacklinks: backlinks.backlinks_count ?? backlinks.total ?? 0,
    trustFlow: backlinks.trust_flow ?? backlinks.tf ?? 0,
    citationFlow: backlinks.citation_flow ?? backlinks.cf ?? 0,
    trustLevel: backlinks.trust_level ?? backlinks.page_trust ?? 0,
    referringDomains: backlinks.referring_domains ?? 0,
  };
}

/**
 * Mapea métricas de redes sociales.
 */
function mapSocial(socialMetrics = {}) {
  return {
    facebookLikes: socialMetrics.facebook_likes ?? socialMetrics.fb_likes ?? 0,
    facebookShares: socialMetrics.facebook_shares ?? socialMetrics.fb_shares ?? 0,
    facebookComments: socialMetrics.facebook_comments ?? 0,
    facebookTotal: socialMetrics.facebook_total
      ?? ((socialMetrics.facebook_likes ?? 0) +
          (socialMetrics.facebook_shares ?? 0) +
          (socialMetrics.facebook_comments ?? 0)),
    pinterest: socialMetrics.pinterest ?? socialMetrics.pinterest_pins ?? 0,
  };
}

/**
 * Mapea velocidad de página.
 */
function mapPageSpeed(pageSpeed = {}) {
  return {
    mobileScore: pageSpeed.mobile_score ?? pageSpeed.mobile ?? 0,
    desktopScore: pageSpeed.desktop_score ?? pageSpeed.desktop ?? 0,
    mobileOptimized: pageSpeed.mobile_optimized ?? false,
  };
}

/**
 * Mapea enlaces tóxicos.
 */
function mapToxicLinks(toxicLinks = {}) {
  return {
    total: toxicLinks.total ?? toxicLinks.toxic_count ?? 0,
    list: toxicLinks.links ?? toxicLinks.toxic_links ?? [],
  };
}

/**
 * Función principal: transforma raw API data → ReportData normalizado.
 *
 * @param {object} raw  - Resultado de WebCEOClient.collectReportData()
 * @returns {ReportData}
 */
function mapToReportData(raw) {
  const seoScore = calcSeoScore(raw);
  const technical = mapTechnicalIssues(raw.siteAudit);
  const backlinksData = mapBacklinks(raw.backlinks);
  const social = mapSocial(raw.socialMetrics);
  const speed = mapPageSpeed(raw.pageSpeed);
  const keywordRankings = mapKeywordRankings(raw.rankings);
  const competitors = mapCompetitors(raw.competitors);
  const toxic = mapToxicLinks(raw.toxicLinks);

  return {
    meta: raw.meta,

    summary: {
      seoScore,
      scoreLabel: scoreLabel(seoScore),
      errorsTotal: technical.errorsTotal,
      warningsTotal: technical.warningsTotal,
      okTotal: technical.okTotal,
    },

    competitors,

    social: {
      ...social,
      competitorComparison: [], // se puede poblar con datos de competidores
    },

    seoFactors: {
      trustLevel: backlinksData.trustLevel,
      indexedPages: technical.indexedPages,
      totalBacklinks: backlinksData.totalBacklinks,
      keywordsInImportantAreas: technical.keywordsInImportantAreas,
      imagesOptimized: technical.imagesWithoutAlt === 0,
      trustFlow: backlinksData.trustFlow,
      citationFlow: backlinksData.citationFlow,
      hasAnalytics: technical.hasAnalytics,
    },

    speed: {
      mobileScore: speed.mobileScore,
      desktopScore: speed.desktopScore,
      mobileOptimized: speed.mobileOptimized,
    },

    keywordRankings,

    technical: {
      notFound404: technical.notFound404,
      serverErrors: technical.serverErrors,
      brokenImages: technical.brokenImages,
      brokenLinks: technical.brokenLinks,
      accessProblems: technical.accessProblems,
      slowPages: technical.slowPages,
      pagesScanned: technical.pagesScanned,
    },

    onPage: {
      missingTitles: technical.missingTitles,
      missingDescriptions: technical.missingDescriptions,
      missingH1: technical.missingH1,
      duplicateTitles: technical.duplicateTitles,
      nonSeoFriendlyUrls: technical.nonSeoFriendlyUrls,
      excessOutboundLinks: technical.excessOutboundLinks,
      badRedirects: technical.badRedirects,
      sitemapOk: technical.sitemapOk,
    },

    toxic,
  };
}

module.exports = { mapToReportData };
