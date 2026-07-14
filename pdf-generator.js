'use strict';

/**
 * pdf-generator.js
 * Genera un PDF con el diseño fiel al reporte de MentalidadWeb,
 * usando PDFKit (puro Node.js, sin browser).
 *
 * Diseño replicado de: Incidencias_SEO_encontradas_en_la_Web_...pdf
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Paleta de colores (extraída del PDF original) ────────────────────────────
const COLORS = {
  bg: '#FFFFFF',
  text: '#333333',
  textLight: '#666666',
  textMuted: '#999999',
  primary: '#333333',       // negro principal
  accent: '#84BC00',        // verde MentalidadWeb
  error: '#E74C3C',         // rojo error
  warning: '#E67E22',       // naranja advertencia
  ok: '#27AE60',            // verde OK
  info: '#3498DB',          // azul info
  linkBlue: '#2980B9',
  rowAlt: '#F8F8F8',        // fila alternada tabla
  border: '#DDDDDD',
  scoreRed: '#E74C3C',
  headerBg: '#2C3E50',
  sectionTitleColor: '#2C3E50',
};

// ─── Tipografía ───────────────────────────────────────────────────────────────
const FONT = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
};

// ─── Layout ───────────────────────────────────────────────────────────────────
const PAGE = {
  width: 595,   // A4
  height: 841,
  margin: 36,
};

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

class SEOReportGenerator {
  /**
   * @param {object} branding  - { companyName, phone, url }
   */
  constructor(branding = {}) {
    this.branding = {
      companyName: branding.companyName || 'Mentalidad Web Ltda',
      phone: branding.phone || '+5626643163',
      url: branding.url || 'www.mentalidadweb.com',
    };
  }

  // ─── Helpers de dibujo ─────────────────────────────────────────────────────

  _footer(doc) {
    const y = PAGE.height - 28;
    doc
      .fontSize(8)
      .fillColor(COLORS.textMuted)
      .font(FONT.regular)
      .text(
        `${this.branding.companyName} - ${this.branding.phone} - ${this.branding.url}`,
        PAGE.margin, y,
        { width: CONTENT_WIDTH, align: 'center' }
      )
      .text(
        `Página ${doc.bufferedPageRange().start + doc.bufferedPageRange().count} de —`,
        PAGE.margin, y + 10,
        { width: CONTENT_WIDTH, align: 'center' }
      );
  }

  _sectionTitle(doc, title, y) {
    doc
      .font(FONT.bold)
      .fontSize(12)
      .fillColor(COLORS.sectionTitleColor)
      .text(title, PAGE.margin, y);
    return y + 20;
  }

  _subText(doc, text, y, color = COLORS.textLight) {
    doc
      .font(FONT.regular)
      .fontSize(8.5)
      .fillColor(color)
      .text(text, PAGE.margin, y, { width: CONTENT_WIDTH });
    return y + doc.currentLineHeight() * 1.3;
  }

  /** Dibuja un badge de métrica (número grande + etiqueta + descripción) */
  _metricCard(doc, x, y, w, h, {
    label, value, valueColor, valueSize = 22, description, icon,
  }) {
    // Borde
    doc
      .roundedRect(x, y, w, h, 4)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();

    // Etiqueta
    doc
      .font(FONT.regular)
      .fontSize(8)
      .fillColor(COLORS.textLight)
      .text(label, x + 8, y + 8, { width: w - 16 });

    // Valor principal
    const vc = valueColor || COLORS.primary;
    doc
      .font(FONT.bold)
      .fontSize(valueSize)
      .fillColor(vc)
      .text(String(value), x + 8, y + 22, { width: w - 16 });

    // Descripción
    if (description) {
      doc
        .font(FONT.regular)
        .fontSize(7.5)
        .fillColor(vc === COLORS.ok ? COLORS.ok : COLORS.textLight)
        .text(description, x + 8, y + 48, { width: w - 16 });
    }
  }

  /** Dibuja una fila de tabla */
  _tableRow(doc, x, y, w, h, cols, isHeader = false, isAlt = false) {
    if (isAlt) {
      doc.rect(x, y, w, h).fill(COLORS.rowAlt).stroke();
    }

    const colWidths = cols.map(c => c.width);
    let cx = x;
    cols.forEach((col, i) => {
      doc
        .font(isHeader ? FONT.bold : FONT.regular)
        .fontSize(isHeader ? 8 : 8.5)
        .fillColor(isHeader ? COLORS.textLight : COLORS.text)
        .text(String(col.text || ''), cx + 5, y + (h - 10) / 2, {
          width: colWidths[i] - 10,
          ellipsis: true,
          lineBreak: false,
        });
      cx += colWidths[i];
    });

    // Línea inferior
    doc
      .moveTo(x, y + h)
      .lineTo(x + w, y + h)
      .strokeColor(COLORS.border)
      .lineWidth(0.3)
      .stroke();
  }

  /** Indicador de estado (✓ / ✗ / !) con color */
  _statusBadge(doc, x, y, status, count = null) {
    let color, symbol;
    if (status === 'ok') { color = COLORS.ok; symbol = '✓'; }
    else if (status === 'error') { color = COLORS.error; symbol = count ? `! ${count}` : '!'; }
    else if (status === 'warn') { color = COLORS.warning; symbol = count ? `! ${count}` : '!'; }
    else { color = COLORS.info; symbol = 'i'; }

    doc
      .circle(x + 8, y + 8, 8)
      .fillAndStroke(color, color);
    doc
      .font(FONT.bold)
      .fontSize(8)
      .fillColor('#FFFFFF')
      .text(symbol, x + (count ? 2 : 4), y + 3, { width: 20, align: 'center' });
  }

  // ─── Página 1: Portada ──────────────────────────────────────────────────────

  _drawCover(doc, data) {
    const { meta } = data;

    // Fondo oscuro
    doc
      .rect(0, 0, PAGE.width, PAGE.height)
      .fill('#2C2C2C');

    // Círculo central blanco
    doc
      .circle(PAGE.width / 2, PAGE.height / 2, 200)
      .fill('#FFFFFF');

    // Logo texto
    const lx = PAGE.width / 2;
    doc
      .font(FONT.bold)
      .fontSize(26)
      .fillColor(COLORS.primary)
      .text('Mentalidad', 0, PAGE.height / 2 - 100, { width: PAGE.width, align: 'center' })
      .font(FONT.bold)
      .fontSize(26)
      .fillColor(COLORS.accent)
      .text('Web', 0, PAGE.height / 2 - 72, { width: PAGE.width, align: 'center' });

    doc
      .font(FONT.regular)
      .fontSize(8)
      .fillColor(COLORS.textLight)
      .text('Marketing  /  Tecnología  /  Efectividad', 0, PAGE.height / 2 - 50, {
        width: PAGE.width, align: 'center',
      });

    // Línea divisora
    doc
      .moveTo(PAGE.width / 2 - 100, PAGE.height / 2 - 20)
      .lineTo(PAGE.width / 2 + 100, PAGE.height / 2 - 20)
      .strokeColor(COLORS.border)
      .lineWidth(0.8)
      .stroke();

    // Título
    doc
      .font(FONT.bold)
      .fontSize(20)
      .fillColor(COLORS.primary)
      .text('SEO REPORT', 0, PAGE.height / 2 - 5, { width: PAGE.width, align: 'center' });

    // Subtítulo
    doc
      .font(FONT.regular)
      .fontSize(10)
      .fillColor(COLORS.textLight)
      .text(`Reporte Generado por Mentalidad Web para`, 0, PAGE.height / 2 + 40, {
        width: PAGE.width, align: 'center',
      })
      .fillColor(COLORS.linkBlue)
      .text(meta.url, 0, PAGE.height / 2 + 55, { width: PAGE.width, align: 'center' });

    doc
      .font(FONT.regular)
      .fontSize(9)
      .fillColor(COLORS.textLight)
      .text(meta.scanDate, 0, PAGE.height / 2 + 75, { width: PAGE.width, align: 'center' });
  }

  // ─── Página 2: Resumen general + Competidores ──────────────────────────────

  _drawSummaryPage(doc, data) {
    doc.addPage();
    let y = PAGE.margin;

    // Header
    this._drawPageHeader(doc, data.meta, y);
    y += 40;

    // Título sección
    y = this._sectionTitle(doc, `Incidencias SEO encontradas en la Web para ${data.meta.domain}`, y);
    y = this._subText(doc,
      'Este informe analiza los factores principales que influyen en el SEO. Optimizar las incidencias encontradas mejorará el posicionamiento de su sitio y aumentará el tráfico a su web.',
      y
    );
    y += 8;

    // ── Tarjeta resumen: errores + score ──────────────────────────────────────
    const cardY = y;
    const cardH = 90;

    // Borde de la tarjeta
    doc.rect(PAGE.margin, cardY, CONTENT_WIDTH, cardH)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();

    // Columna izquierda: screenshot placeholder
    doc.rect(PAGE.margin + 4, cardY + 4, 110, cardH - 8)
      .fill(COLORS.rowAlt);
    doc.font(FONT.regular).fontSize(7).fillColor(COLORS.textMuted)
      .text(data.meta.domain, PAGE.margin + 8, cardY + (cardH / 2) - 6, { width: 102, align: 'center' });

    // Columna central: conteos
    const midX = PAGE.margin + 120;
    const { errorsTotal, warningsTotal, okTotal } = data.summary;
    doc.font(FONT.bold).fontSize(11).fillColor(COLORS.error)
      .text(`${errorsTotal} Errores`, midX, cardY + 18);
    doc.font(FONT.bold).fontSize(11).fillColor(COLORS.warning)
      .text(`${warningsTotal} Advertencias`, midX, cardY + 38);
    doc.font(FONT.bold).fontSize(11).fillColor(COLORS.ok)
      .text(`${okTotal} Están Bien`, midX, cardY + 58);

    // Columna derecha: score circular
    const scoreX = PAGE.width - PAGE.margin - 80;
    const scoreY = cardY + 8;
    doc.font(FONT.regular).fontSize(8).fillColor(COLORS.textLight)
      .text('Rendimiento SEO', scoreX - 20, scoreY, { width: 90, align: 'center' });

    const score = data.summary.seoScore;
    const scoreColor = score >= 70 ? COLORS.ok : score >= 50 ? COLORS.warning : COLORS.scoreRed;
    doc.font(FONT.bold).fontSize(32).fillColor(scoreColor)
      .text(`${score}%`, scoreX - 10, scoreY + 14, { width: 70, align: 'center' });
    doc.font(FONT.bold).fontSize(10).fillColor(scoreColor)
      .text(data.summary.scoreLabel, scoreX - 10, scoreY + 50, { width: 70, align: 'center' });

    y = cardY + cardH + 18;

    // ── Tabla de competidores ─────────────────────────────────────────────────
    y = this._sectionTitle(doc, 'Páginas mejor posicionadas por los términos de búsqueda elegidos', y);
    y = this._subText(doc,
      'La posición de su sitio en las páginas de resultados de los motores de búsqueda influye mucho en el tráfico de su sitio. Cuanto mejor sea la posición, más tráfico puede esperar.',
      y
    );

    if (!data.competitors || data.competitors.length === 0) {
      y = this._subText(doc, 'No se encontraron datos de competidores.', y, COLORS.textMuted);
    } else {
      const colW = [130, 230, 100, 63];
      const rowH = 22;
      const tableW = CONTENT_WIDTH;

      // Cabecera
      this._tableRow(doc, PAGE.margin, y, tableW, rowH, [
        { text: 'Mejor posicionados en su nicho', width: colW[0] },
        { text: 'Posiciona bien por', width: colW[1] },
        { text: '', width: colW[2] },
        { text: 'Tráfico estimado', width: colW[3] },
      ], true);
      y += rowH;

      data.competitors.forEach((comp, i) => {
        this._tableRow(doc, PAGE.margin, y, tableW, rowH, [
          { text: comp.domain, width: colW[0] },
          { text: comp.keywords, width: colW[1] },
          { text: '', width: colW[2] },
          { text: `${comp.trafficShare}%`, width: colW[3] },
        ], false, i % 2 === 1);
        y += rowH;
      });
    }

    y += 10;

    // Alerta de competidores
    doc.rect(PAGE.margin, y, CONTENT_WIDTH, 28)
      .fill('#FFF9E6').stroke();
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.warning)
      .text(
        '⚠ ¡Advertencia! Su sitio no se encuentra en el Top 10 de sitios con el mayor porcentaje de tráfico estimado porque su sitio aparece con poca frecuencia en las páginas de resultados del motor de búsqueda. Se debe tomar una acción de SEO inmediata porque sus competidores reciben casi todo el tráfico.',
        PAGE.margin + 6, y + 6, { width: CONTENT_WIDTH - 12 }
      );

    this._footer(doc);
  }

  // ─── Página 3: Redes Sociales + Factores SEO ──────────────────────────────

  _drawSocialAndFactorsPage(doc, data) {
    doc.addPage();
    let y = PAGE.margin;

    this._drawPageHeader(doc, data.meta, y);
    y += 40;

    // ── Redes Sociales ────────────────────────────────────────────────────────
    y = this._sectionTitle(doc, 'Popularidad en redes sociales', y);
    y = this._subText(doc,
      'Cada mención en los medios sociales hace que su marca sea más reconocida y le ayuda a conseguir tráfico.',
      y
    );

    const cardW = (CONTENT_WIDTH - 10) / 2;
    const { social } = data;

    // Facebook card
    doc.roundedRect(PAGE.margin, y, cardW, 80, 4)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.font(FONT.regular).fontSize(9).fillColor(COLORS.primary)
      .text('Me gusta, acciones y comentarios de Facebook', PAGE.margin + 8, y + 8, { width: cardW - 16 });
    doc.font(FONT.bold).fontSize(22).fillColor(COLORS.primary)
      .text(social.facebookTotal?.toLocaleString() || '0', PAGE.margin + 8, y + 24);
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.textLight)
      .text('Facebook tiene más de 1,55 millones de usuarios activos mensuales.', PAGE.margin + 8, y + 52, { width: cardW - 16 });

    // Pinterest card
    doc.roundedRect(PAGE.margin + cardW + 10, y, cardW, 80, 4)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.font(FONT.regular).fontSize(9).fillColor(COLORS.primary)
      .text('Pinterest', PAGE.margin + cardW + 18, y + 8, { width: cardW - 16 });
    doc.font(FONT.bold).fontSize(22).fillColor(COLORS.primary)
      .text(String(social.pinterest || 0), PAGE.margin + cardW + 18, y + 24);
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.textLight)
      .text('Pinterest es una red social para compartir fotos y videos.', PAGE.margin + cardW + 18, y + 52, { width: cardW - 16 });

    y += 94;

    // ── Factores SEO ─────────────────────────────────────────────────────────
    y = this._sectionTitle(doc, 'Factores SEO que influyen en la visibilidad de la web en los buscadores', y);
    y = this._subText(doc,
      'Los motores de búsqueda utilizan cientos de factores para decidir el mejor sitio Web que se adapte a las necesidades de los buscadores.',
      y
    );

    const { seoFactors } = data;
    const factors = [
      {
        label: 'Nivel de confianza de la página de inicio',
        value: seoFactors.trustLevel?.toFixed(1) ?? '0.0',
        status: seoFactors.trustLevel > 0.5 ? 'ok' : 'warn',
        description: seoFactors.trustLevel > 0.5
          ? 'El nivel de confianza es adecuado.'
          : 'El nivel de confianza es aceptable, pero la relación entre el número y la calidad de los enlaces en su página parece sospechoso. Algunas acciones SEO son necesarias.',
      },
      {
        label: 'Páginas indexadas por Google',
        value: seoFactors.indexedPages?.toLocaleString() ?? '0',
        status: seoFactors.indexedPages > 0 ? 'ok' : 'error',
        description: seoFactors.indexedPages > 0
          ? 'OK, todas las páginas escaneadas están en el índice de Google.'
          : 'No se encontraron páginas indexadas.',
      },
      {
        label: 'Número de links apuntando a su página',
        value: seoFactors.totalBacklinks?.toLocaleString() ?? '0',
        status: seoFactors.totalBacklinks >= 200 ? 'ok' : 'warn',
        description: seoFactors.totalBacklinks >= 200
          ? 'Buen trabajo, siga trabajando en los enlaces cualitativos.'
          : 'El número de backlinks es bajo. Trabaje en conseguir más enlaces de calidad.',
      },
      {
        label: 'Palabras clave en áreas importantes',
        value: seoFactors.keywordsInImportantAreas ?? '0',
        status: seoFactors.keywordsInImportantAreas === 0 ? 'ok' : 'error',
        description: seoFactors.keywordsInImportantAreas === 0
          ? '¡Buen trabajo! Las palabras clave están en las áreas importantes.'
          : `${seoFactors.keywordsInImportantAreas} palabras clave no encontradas en áreas importantes de la página.`,
      },
      {
        label: 'Optimización de imágenes (etiquetas alt)',
        value: seoFactors.imagesOptimized ? '✓' : '✗',
        status: seoFactors.imagesOptimized ? 'ok' : 'error',
        description: seoFactors.imagesOptimized
          ? '¡Buen trabajo! Todas las imágenes están optimizadas.'
          : 'Hay imágenes sin etiqueta ALT. Esto perjudica el SEO.',
      },
      {
        label: 'Trust Flow del dominio',
        value: seoFactors.trustFlow ?? '0',
        status: seoFactors.trustFlow >= 50 ? 'ok' : 'warn',
        description: seoFactors.trustFlow >= 50
          ? 'Buen Trust Flow del dominio.'
          : 'Un valor inferior a 50 significa que no tiene suficientes enlaces de sitios con autoridad.',
      },
      {
        label: 'Citation Flow del dominio',
        value: seoFactors.citationFlow ?? '0',
        status: seoFactors.citationFlow >= 50 ? 'ok' : 'warn',
        description: seoFactors.citationFlow >= 50
          ? 'Buen Citation Flow del dominio.'
          : 'Un valor inferior a 50 significa que no hay suficientes enlaces externos.',
      },
      {
        label: 'Código de seguimiento de Google Analytics',
        value: seoFactors.hasAnalytics ? '✓' : '✗',
        status: seoFactors.hasAnalytics ? 'ok' : 'error',
        description: seoFactors.hasAnalytics
          ? 'Presente: Google Analytics'
          : 'No se detectó Google Analytics. Se recomienda instalarlo.',
      },
    ];

    const fw = (CONTENT_WIDTH - 8) / 2;
    const fh = 68;
    factors.forEach((f, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const fx = PAGE.margin + col * (fw + 8);
      const fy = y + row * (fh + 6);

      doc.roundedRect(fx, fy, fw, fh, 4)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      doc.font(FONT.regular).fontSize(8).fillColor(COLORS.textLight)
        .text(f.label, fx + 8, fy + 7, { width: fw - 16 });

      const statusColor = f.status === 'ok' ? COLORS.ok
        : f.status === 'error' ? COLORS.error : COLORS.warning;

      doc.font(FONT.bold).fontSize(16).fillColor(statusColor)
        .text(String(f.value), fx + 8, fy + 20);

      doc.font(FONT.regular).fontSize(7).fillColor(statusColor)
        .text(f.description, fx + 8, fy + 42, { width: fw - 16 });
    });

    this._footer(doc);
  }

  // ─── Página 4: Velocidad y Usabilidad ──────────────────────────────────────

  _drawSpeedPage(doc, data) {
    doc.addPage();
    let y = PAGE.margin;

    this._drawPageHeader(doc, data.meta, y);
    y += 40;

    y = this._sectionTitle(doc, 'Problemas de usabilidad de la página de inicio', y);
    y = this._subText(doc,
      'Cada vez hay más búsquedas que se llevan a cabo a través de dispositivos móviles. La web debe aparecer perfecta, tanto en los dispositivos móviles como en ordenadores de escritorio.',
      y
    );

    const { speed } = data;
    const speedCards = [
      {
        label: 'Puntuación de velocidad móvil',
        value: `${speed.mobileScore} / 100`,
        status: speed.mobileScore >= 70 ? 'ok' : 'error',
        desc: speed.mobileScore >= 70
          ? 'El tiempo de carga móvil es adecuado.'
          : '¡Su página web se carga demasiado lenta en los dispositivos móviles! Se debe optimizar los tiempos de carga del sitio urgentemente.',
      },
      {
        label: 'Usabilidad móvil',
        value: speed.mobileOptimized ? '✓' : '✗',
        status: speed.mobileOptimized ? 'ok' : 'warn',
        desc: speed.mobileOptimized
          ? 'El sitio está optimizado para dispositivos móviles.'
          : 'No está optimizado para dispositivos móviles.',
      },
      {
        label: 'Puntuación de velocidad de escritorio',
        value: `${speed.desktopScore} / 100`,
        status: speed.desktopScore >= 70 ? 'ok' : 'error',
        desc: speed.desktopScore >= 70
          ? 'Los tiempos de carga de escritorio son adecuados.'
          : 'Los tiempos de carga son demasiado lentos para la versión de escritorio.',
      },
    ];

    speedCards.forEach((card, i) => {
      const cx = PAGE.margin + (i % 2) * ((CONTENT_WIDTH + 8) / 2);
      const cy = y + Math.floor(i / 2) * 95;
      const cw = i === 2 ? (CONTENT_WIDTH / 2 - 4) : (CONTENT_WIDTH / 2 - 4);
      const ch = 85;

      doc.roundedRect(cx, cy, cw, ch, 4)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      doc.font(FONT.regular).fontSize(8).fillColor(COLORS.textLight)
        .text(card.label, cx + 8, cy + 7, { width: cw - 16 });

      const sc = card.status === 'ok' ? COLORS.ok
        : card.status === 'error' ? COLORS.error : COLORS.warning;

      doc.font(FONT.bold).fontSize(20).fillColor(sc)
        .text(card.value, cx + 8, cy + 20);

      doc.font(FONT.regular).fontSize(7.5).fillColor(sc)
        .text(card.desc, cx + 8, cy + 47, { width: cw - 16 });
    });

    this._footer(doc);
  }

  // ─── Página 5: Rankings por Keywords ──────────────────────────────────────

  _drawRankingsPage(doc, data) {
    doc.addPage();
    let y = PAGE.margin;

    this._drawPageHeader(doc, data.meta, y);
    y += 40;

    y = this._sectionTitle(doc, 'Posicionamiento de su web en los motores de búsqueda', y);
    y = this._subText(doc,
      'Si su web no aparece en la primera página por los términos de búsqueda adecuados para su negocio, estará perdiendo clientes potenciales.',
      y
    );

    const { keywordRankings } = data;

    if (!keywordRankings || keywordRankings.length === 0) {
      y = this._subText(doc, 'No se encontraron datos de keywords. Configure keywords en WebCEO para ver rankings.', y, COLORS.textMuted);
    } else {
      const seNames = keywordRankings.length > 0
        ? Object.keys(keywordRankings[0].positions)
        : [];

      const colKw = 140;
      const colSe = seNames.length > 0
        ? Math.floor((CONTENT_WIDTH - colKw) / seNames.length)
        : 100;

      const headers = [
        { text: 'Palabra/s clave/s', width: colKw },
        ...seNames.map(se => ({ text: se, width: colSe })),
      ];

      const rowH = 22;
      const tableW = CONTENT_WIDTH;

      this._tableRow(doc, PAGE.margin, y, tableW, rowH, headers, true);
      y += rowH;

      keywordRankings.forEach((kw, i) => {
        const cells = [
          { text: kw.keyword, width: colKw },
          ...seNames.map(se => {
            const pos = kw.positions[se];
            return { text: pos === 'No en el Top 10' ? 'No en el Top 10' : `#${pos}`, width: colSe };
          }),
        ];

        this._tableRow(doc, PAGE.margin, y, tableW, rowH, cells, false, i % 2 === 1);

        // Color rojo para "No en el Top 10"
        seNames.forEach((se, si) => {
          const pos = kw.positions[se];
          if (pos === 'No en el Top 10' || !pos) {
            doc.font(FONT.regular).fontSize(8).fillColor(COLORS.error)
              .text('No en el Top 10',
                PAGE.margin + colKw + si * colSe + 5,
                y + (rowH - 10) / 2,
                { width: colSe - 10, lineBreak: false }
              );
          }
        });

        y += rowH;
      });
    }

    this._footer(doc);
  }

  // ─── Página 6: Problemas Técnicos ──────────────────────────────────────────

  _drawTechnicalPage(doc, data) {
    doc.addPage();
    let y = PAGE.margin;

    this._drawPageHeader(doc, data.meta, y);
    y += 40;

    y = this._sectionTitle(doc, 'Problemas técnicos', y);
    y = this._subText(doc,
      'La existencia de incidencias técnicas puede generar una pésima imagen de su web tanto a sus clientes como a los motores de búsqueda.',
      y
    );

    const { technical } = data;
    const techItems = [
      {
        label: 'Errores de "página no encontrada"',
        value: technical.notFound404,
        status: technical.notFound404 === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `Problema detectado, corríjalo tan pronto como sea posible.\nEstos problemas reducen la calidad de su sitio y pueden afectar negativamente la experiencia del usuario.`,
      },
      {
        label: 'Incidencias del servidor',
        value: technical.serverErrors,
        status: technical.serverErrors === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: 'Se detectaron errores de servidor. Revise los logs urgentemente.',
      },
      {
        label: 'Imágenes rotas',
        value: technical.brokenImages,
        status: technical.brokenImages === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `${technical.brokenImages} imagen(es) rota(s) detectada(s). Corríjalas.`,
      },
      {
        label: 'Enlaces rotos',
        value: technical.brokenLinks,
        status: technical.brokenLinks === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `Problemas detectados, corríjalos tan pronto como sea posible. Los textos anclas rotos perjudican la navegación.`,
      },
      {
        label: 'Problemas de acceso a Página/s',
        value: technical.accessProblems,
        status: technical.accessProblems === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: 'Se detectaron problemas de acceso (errores 401, 403).',
      },
      {
        label: 'Páginas con tiempo de respuesta lenta',
        value: technical.slowPages,
        status: technical.slowPages === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: 'Existen páginas que cargan demasiado lentas.',
      },
    ];

    const tw = (CONTENT_WIDTH - 8) / 2;
    const th = 80;

    techItems.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const tx = PAGE.margin + col * (tw + 8);
      const ty = y + row * (th + 6);

      doc.roundedRect(tx, ty, tw, th, 4)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      doc.font(FONT.regular).fontSize(8).fillColor(COLORS.textLight)
        .text(item.label, tx + 8, ty + 7, { width: tw - 16 });

      const sc = item.status === 'ok' ? COLORS.ok : COLORS.error;
      const displayVal = item.status === 'ok' ? '✓' : `! ${item.value}`;

      doc.font(FONT.bold).fontSize(18).fillColor(sc)
        .text(displayVal, tx + 8, ty + 22);

      const msg = item.status === 'ok' ? item.okMsg : item.errMsg;
      doc.font(FONT.regular).fontSize(7).fillColor(sc)
        .text(msg, tx + 8, ty + 47, { width: tw - 16 });
    });

    y += techItems.length > 4 ? (3 * (th + 6)) : (2 * (th + 6));
    y += 10;

    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.textMuted)
      .text(`Los datos anteriores se muestran para ${technical.pagesScanned} páginas escaneadas.`, PAGE.margin, y);

    this._footer(doc);
  }

  // ─── Página 7: Links Tóxicos + On-Page SEO ────────────────────────────────

  _drawOnPagePage(doc, data) {
    doc.addPage();
    let y = PAGE.margin;

    this._drawPageHeader(doc, data.meta, y);
    y += 40;

    // ── Toxic Links ───────────────────────────────────────────────────────────
    y = this._sectionTitle(doc, 'Posíbles enlaces tóxicos que apuntan a tu Web', y);

    const { toxic } = data;
    doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH, 55, 4)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();

    const toxColor = toxic.total === 0 ? COLORS.ok : COLORS.error;
    doc.font(FONT.bold).fontSize(28).fillColor(toxColor)
      .text(String(toxic.total), PAGE.margin + 20, y + 12);

    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.textLight)
      .text(
        'Los enlaces externos (backlinks) de baja calidad pueden tener un impacto negativo en el posicionamiento de su Web o incluso provocar que algunos buscadores bloqueen las páginas.',
        PAGE.margin + 80, y + 8, { width: CONTENT_WIDTH - 95 }
      );

    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.textMuted)
      .text('Enlaces tóxicos encontrados', PAGE.margin + 20, y + 40);

    y += 68;

    // ── Factores On-Page ──────────────────────────────────────────────────────
    y = this._sectionTitle(doc, 'Factores SEO principales (directrices de calidad de Google)', y);
    y = this._subText(doc,
      'Si el sitio Web no cumple con los requisitos de Google, puede perder posiciones en las páginas de resultados de Google.',
      y
    );

    const { onPage } = data;
    const onPageItems = [
      {
        label: 'Páginas con una etiqueta TITLE no optimizada',
        value: onPage.missingTitles,
        status: onPage.missingTitles === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `${onPage.missingTitles} página(s) sin TITLE o con TITLE duplicado/largo.`,
      },
      {
        label: 'Páginas con una etiqueta DESCRIPTION no optimizada',
        value: onPage.missingDescriptions,
        status: onPage.missingDescriptions === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `${onPage.missingDescriptions} páginas con etiquetas DESCRIPTION no optimizadas.`,
      },
      {
        label: 'Páginas con un número excesivo de enlaces salientes',
        value: onPage.excessOutboundLinks,
        status: onPage.excessOutboundLinks === 0 ? 'ok' : 'warn',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `${onPage.excessOutboundLinks} página(s) con exceso de enlaces salientes.`,
      },
      {
        label: 'Páginas con URLs no amigables',
        value: onPage.nonSeoFriendlyUrls,
        status: onPage.nonSeoFriendlyUrls === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `${onPage.nonSeoFriendlyUrls} URL(s) no amigables para SEO.`,
      },
      {
        label: 'Páginas sin títulos H1 optimizados',
        value: onPage.missingH1,
        status: onPage.missingH1 === 0 ? 'ok' : 'error',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `${onPage.missingH1} página(s) sin H1 o con H1 duplicado.`,
      },
      {
        label: 'Páginas con redirecciones no aconsejables para los buscadores',
        value: onPage.badRedirects,
        status: onPage.badRedirects === 0 ? 'ok' : 'warn',
        okMsg: '¡No se detectaron problemas!',
        errMsg: `${onPage.badRedirects} página(s) con redirecciones 302 o meta-refresh.`,
      },
    ];

    const ow = (CONTENT_WIDTH - 8) / 2;
    const oh = 75;

    onPageItems.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const ox = PAGE.margin + col * (ow + 8);
      const oy = y + row * (oh + 6);

      doc.roundedRect(ox, oy, ow, oh, 4)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      doc.font(FONT.regular).fontSize(8).fillColor(COLORS.textLight)
        .text(item.label, ox + 8, oy + 7, { width: ow - 16 });

      const sc = item.status === 'ok' ? COLORS.ok
        : item.status === 'error' ? COLORS.error : COLORS.warning;
      const displayVal = item.status === 'ok' ? '✓' : `! ${item.value}`;

      doc.font(FONT.bold).fontSize(16).fillColor(sc)
        .text(displayVal, ox + 8, oy + 22);

      const msg = item.status === 'ok' ? item.okMsg : item.errMsg;
      doc.font(FONT.regular).fontSize(7).fillColor(sc)
        .text(msg, ox + 8, oy + 43, { width: ow - 16 });
    });

    this._footer(doc);
  }

  // ─── Página 8: Sitemap + cierre ────────────────────────────────────────────

  _drawFinalPage(doc, data) {
    doc.addPage();
    let y = PAGE.margin;

    this._drawPageHeader(doc, data.meta, y);
    y += 40;

    const { onPage } = data;

    doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH / 2 - 4, 90, 4)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();

    doc.font(FONT.regular).fontSize(8).fillColor(COLORS.textLight)
      .text('Sitemap.xml y Robots.txt', PAGE.margin + 8, y + 8);

    const sitemapOk = onPage.sitemapOk !== false;
    const sitemapColor = sitemapOk ? COLORS.ok : COLORS.error;

    doc.font(FONT.bold).fontSize(18).fillColor(sitemapColor)
      .text(sitemapOk ? '✓' : '✗', PAGE.margin + 8, y + 24);

    doc.font(FONT.regular).fontSize(7).fillColor(sitemapColor)
      .text(
        sitemapOk
          ? '¡No se detectaron problemas!\nLa accesibilidad se define por la presencia de un mapa del sitio (sitemap.xml) y un fichero robots.txt correctamente optimizados.'
          : 'Problemas detectados con el Sitemap.xml o Robots.txt. Revise su configuración.',
        PAGE.margin + 8, y + 46, { width: CONTENT_WIDTH / 2 - 20 }
      );

    y += 100;

    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.textMuted)
      .text(`Los datos anteriores se muestran para ${data.technical?.pagesScanned ?? 18} páginas escaneadas.`, PAGE.margin, y);

    this._footer(doc);
  }

  // ─── Header de página ──────────────────────────────────────────────────────

  _drawPageHeader(doc, meta, y) {
    // Logo
    doc
      .font(FONT.bold).fontSize(14).fillColor(COLORS.primary)
      .text('Mentalidad', PAGE.margin, y, { continued: true })
      .fillColor(COLORS.accent)
      .text('Web');

    doc.font(FONT.regular).fontSize(6).fillColor(COLORS.textMuted)
      .text('Marketing  /  Tecnología  /  Efectividad', PAGE.margin, y + 16);

    // Fecha de escaneo (derecha)
    doc.font(FONT.regular).fontSize(8).fillColor(COLORS.textLight)
      .text(`Escaneado en ${meta.scanDate}`, 0, y + 6, { width: PAGE.width - PAGE.margin, align: 'right' });

    // Línea divisora
    doc.moveTo(PAGE.margin, y + 30)
      .lineTo(PAGE.width - PAGE.margin, y + 30)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();
  }

  // ─── Método principal ──────────────────────────────────────────────────────

  /**
   * Genera el PDF completo y lo guarda en disco.
   *
   * @param {ReportData} reportData  - Datos normalizados del mapper
   * @param {string} outputPath      - Ruta de salida del PDF
   * @returns {Promise<string>}      - Ruta del PDF generado
   */
  async generate(reportData, outputPath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Title: `SEO Report - ${reportData.meta.domain}`,
          Author: this.branding.companyName,
          Subject: `Reporte SEO generado el ${reportData.meta.scanDate}`,
          Keywords: 'SEO, reporte, WebCEO',
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Portada
      doc.addPage();
      this._drawCover(doc, reportData);

      // Páginas de contenido
      this._drawSummaryPage(doc, reportData);
      this._drawSocialAndFactorsPage(doc, reportData);
      this._drawSpeedPage(doc, reportData);
      this._drawRankingsPage(doc, reportData);
      this._drawTechnicalPage(doc, reportData);
      this._drawOnPagePage(doc, reportData);
      this._drawFinalPage(doc, reportData);

      doc.end();

      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    });
  }
}

module.exports = SEOReportGenerator;
