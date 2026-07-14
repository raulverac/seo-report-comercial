'use strict';

/**
 * webceo-client.js
 * Cliente para la API REST de WebCEO.
 *
 * Endpoint base: https://online.webceo.com/api/
 * Autenticación: campo "key" en el body JSON de cada petición.
 *
 * Flujo principal para generar un reporte:
 *   1. get_projects()          → obtener o verificar proyecto existente
 *   2. add_project()           → crear proyecto si no existe
 *   3. rescan_project()        → lanzar análisis completo
 *   4. get_rankings()          → posicionamiento por keywords
 *   5. get_site_audit()        → auditoría técnica
 *   6. get_dangerous_competitors() → competidores
 *   7. get_social_metrics()    → métricas redes sociales
 *   8. get_backlinks()         → backlinks / Trust / Citation flow
 *   9. get_page_speed()        → velocidad de carga
 */

const axios = require('axios');

const WEBCEO_API_URL = 'https://online.webceo.com/api/';
const REQUEST_TIMEOUT = 30000; // 30 segundos

class WebCEOClient {
  /**
   * @param {string} apiKey  - Tu API key de WebCEO
   */
  constructor(apiKey) {
    if (!apiKey) throw new Error('Se requiere WEBCEO_API_KEY');
    this.apiKey = apiKey;
    this._requestId = Date.now();
  }

  // ─── Utilidades internas ────────────────────────────────────────────────────

  _nextId() {
    return String(++this._requestId);
  }

  /**
   * Envía una petición POST a la API de WebCEO.
   * @param {string} method  - Nombre del comando (p.ej. "get_projects")
   * @param {object} data    - Parámetros específicos del comando
   */
  async _call(method, data = {}) {
    const payload = {
      method,
      key: this.apiKey,
      id: this._nextId(),
      data,
    };

    try {
      const response = await axios.post(WEBCEO_API_URL, payload, {
        timeout: REQUEST_TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
      });

      // La API siempre devuelve un array; tomamos el primer elemento
      const raw = response.data;
      const result = Array.isArray(raw) ? raw[0] : raw;

      if (result && (result.error || result.errormsg)) {
        throw new Error(`WebCEO API error [${method}]: ${result.error || result.errormsg}`);
      }

      return result;
    } catch (err) {
      if (err.response) {
        throw new Error(
          `WebCEO HTTP ${err.response.status} en [${method}]: ${JSON.stringify(err.response.data)}`
        );
      }
      throw err;
    }
  }

  // ─── Gestión de proyectos ───────────────────────────────────────────────────

  /** Lista todos los proyectos de la cuenta */
  async getProjects() {
    const res = await this._call('get_projects');
    return res.data || [];
  }

  /**
   * Busca un proyecto por dominio. Devuelve el proyecto o null.
   * @param {string} domain  - p.ej. "newfieldconsulting.com"
   */
  async findProjectByDomain(domain) {
    const projects = await this.getProjects();
    const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    return projects.find(p => {
      const d = (p.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      return d === clean || d.endsWith(clean) || clean.endsWith(d);
    }) || null;
  }

  /**
   * Crea un nuevo proyecto en WebCEO.
   * @param {string} url   - URL completa del sitio (con https://)
   * @param {string[]} ses - Search Engines: p.ej. ["Google.com (Es)"]
   */
  async addProject(url) {
    const domain = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const res = await this._call('add_project', { domain });
    return res.data;
  }

  /**
   * Lanza un re-escaneo de todas las herramientas del proyecto.
   * @param {string} projectId
   * @param {string[]} tools - herramientas a re-escanear (vacío = todas)
   */
  async rescanProject(projectId, tools = []) {
    const data = { project: projectId };
    if (tools.length) data.tools = tools;
    const res = await this._call('rescan_project', data);
    return res.data;
  }

  // ─── Rankings ───────────────────────────────────────────────────────────────

  /**
   * Obtiene el posicionamiento de keywords.
   * @param {string} projectId
   */
  async getRankings(projectId) {
    const res = await this._call('get_rankings', { project: projectId });
    return res.data || {};
  }

  /** Obtiene las keywords configuradas en el proyecto */
  async getRankingKeywords(projectId) {
    const res = await this._call('get_rankings_keywords', { project: projectId });
    return res.data?.keywords || [];
  }

  /** Obtiene los search engines configurados en el proyecto */
  async getRankingSEs(projectId) {
    const res = await this._call('get_rankings_ses', { project: projectId });
    return res.data?.ses || [];
  }

  /** Obtiene rankings promedio */
  async getAverageRankings(projectId) {
    const res = await this._call('get_average_rankings', { project: projectId });
    return res.data || {};
  }

  /** Obtiene competidores peligrosos */
  async getDangerousCompetitors(projectId) {
    const res = await this._call('get_dangerous_competitors', { project: projectId });
    return res.data?.competitors || [];
  }

  // ─── Site Audit ─────────────────────────────────────────────────────────────

  /**
   * Obtiene los datos de auditoría técnica del sitio.
   * @param {string} projectId
   */
  async getSiteAudit(projectId) {
    const res = await this._call('get_site_audit', { project: projectId });
    return res.data || {};
  }

  /** Obtiene datos de análisis de páginas internas */
  async getInternalLinksData(projectId) {
    const res = await this._call('get_internal_links_data', { project: projectId });
    return res.data || {};
  }

  // ─── Backlinks ──────────────────────────────────────────────────────────────

  /**
   * Obtiene datos de backlinks (incluye Trust Flow, Citation Flow).
   * @param {string} projectId
   */
  async getBacklinks(projectId) {
    const res = await this._call('get_backlinks', { project: projectId });
    return res.data || {};
  }

  /** Obtiene backlinks tóxicos */
  async getToxicLinks(projectId) {
    const res = await this._call('get_toxic_links', { project: projectId });
    return res.data || {};
  }

  // ─── Social Metrics ─────────────────────────────────────────────────────────

  /**
   * Obtiene métricas de redes sociales.
   * @param {string} projectId
   */
  async getSocialMetrics(projectId) {
    const res = await this._call('get_social_metrics', { project: projectId });
    return res.data?.metrics || res.data || {};
  }

  // ─── Page Speed (via Google PageSpeed Insights integrado) ───────────────────

  /**
   * Obtiene datos de velocidad de página.
   * @param {string} projectId
   */
  async getPageSpeed(projectId) {
    const res = await this._call('get_page_speed', { project: projectId });
    return res.data || {};
  }

  // ─── Helper principal ────────────────────────────────────────────────────────

  /**
   * Obtiene o crea un proyecto para la URL dada, y recoge TODOS
   * los datos necesarios para generar el reporte SEO.
   *
   * @param {string} siteUrl  - URL completa, p.ej. "https://newfieldconsulting.com"
   * @param {object} opts
   * @param {boolean} opts.forceRescan  - Forzar re-escaneo aunque ya exista
   * @param {function} opts.onProgress  - Callback(step, total, message)
   * @returns {Promise<SEOReportData>}
   */
  async collectReportData(siteUrl, opts = {}) {
    const { forceRescan = false, onProgress = () => {} } = opts;

    // Normalizar dominio
    const domain = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;

    onProgress(1, 8, 'Buscando proyecto en WebCEO...');

    // 1. Obtener o crear proyecto
    let project = await this.findProjectByDomain(domain);
    let projectId;

    if (!project) {
      onProgress(2, 8, 'Creando nuevo proyecto en WebCEO...');
      const created = await this.addProject(url);
      projectId = created?.project || created?.id;
      if (!projectId) throw new Error('No se pudo crear el proyecto en WebCEO.');
    } else {
      projectId = project.project || project.id;
    }

    // 2. Re-escanear si se pide
    if (forceRescan || !project) {
      onProgress(3, 8, 'Lanzando re-escaneo completo (puede tardar varios minutos)...');
      await this.rescanProject(projectId);
      // Esperar un poco para que empiece el escaneo
      await new Promise(r => setTimeout(r, 3000));
    }

    // 3. Recoger todos los datos en paralelo
    onProgress(4, 8, 'Obteniendo rankings y keywords...');
    const [
      rankings,
      keywords,
      ses,
      avgRankings,
      competitors,
    ] = await Promise.all([
      this.getRankings(projectId).catch(() => ({})),
      this.getRankingKeywords(projectId).catch(() => []),
      this.getRankingSEs(projectId).catch(() => []),
      this.getAverageRankings(projectId).catch(() => ({})),
      this.getDangerousCompetitors(projectId).catch(() => []),
    ]);

    onProgress(5, 8, 'Obteniendo auditoría técnica...');
    const siteAudit = await this.getSiteAudit(projectId).catch(() => ({}));

    onProgress(6, 8, 'Obteniendo backlinks y métricas de autoridad...');
    const [backlinks, toxicLinks] = await Promise.all([
      this.getBacklinks(projectId).catch(() => ({})),
      this.getToxicLinks(projectId).catch(() => ({})),
    ]);

    onProgress(7, 8, 'Obteniendo redes sociales y velocidad...');
    const [socialMetrics, pageSpeed] = await Promise.all([
      this.getSocialMetrics(projectId).catch(() => ({})),
      this.getPageSpeed(projectId).catch(() => ({})),
    ]);

    onProgress(8, 8, 'Datos recopilados. Generando reporte...');

    return {
      meta: {
        domain,
        url,
        projectId,
        scanDate: new Date().toLocaleDateString('es-ES', {
          day: 'numeric', month: 'short', year: 'numeric',
        }),
        generatedAt: new Date().toISOString(),
      },
      rankings: {
        data: rankings,
        keywords,
        ses,
        average: avgRankings,
      },
      competitors,
      siteAudit,
      backlinks,
      toxicLinks,
      socialMetrics,
      pageSpeed,
    };
  }
}

module.exports = WebCEOClient;
