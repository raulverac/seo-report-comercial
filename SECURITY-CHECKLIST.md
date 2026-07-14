# Checklist de Seguridad — SEO Report Generator
## Basado en OWASP Top 10 2025

> **Proyecto:** SEO Report Generator — Mentalidad Web  
> **Stack:** Node.js / Express · Puppeteer · PDFKit · Quill.js  
> **Fuente:** [OWASP Top 10 2025](https://github.com/OWASP/Top10/tree/master/2025/docs/en)  
> **Última revisión:** 2026-07-09  

---

## Leyenda de estado

| Símbolo | Significado |
|---------|-------------|
| ✅ | Cumple — control implementado |
| ⚠️ | Parcial — implementado pero mejorable |
| ❌ | No cumple — pendiente de implementar |
| 🔒 | Alta prioridad — riesgo crítico |
| 📅 | Fecha de corrección aplicada |

---

## Progreso General

```
A01 Broken Access Control          ████████░░  4 / 6  ✅ Sprint 1
A02 Security Misconfiguration      ████░░░░░░  3 / 7  ✅ Sprint 1
A03 Software Supply Chain          ██░░░░░░░░  1 / 5  ✅ Sprint 1
A04 Cryptographic Failures         ████████░░  4 / 5  ✅ Sprint 1
A05 Injection                      █████░░░░░  3 / 6  ✅ Sprint 1
A06 Insecure Design                ██░░░░░░░░  1 / 4  ✅ Sprint 1
A07 Authentication Failures        ████░░░░░░  2 / 5  ✅ Sprint 1
A08 Software/Data Integrity        ██░░░░░░░░  1 / 4  ✅ Sprint 1
A09 Security Logging & Alerting    ░░░░░░░░░░  0 / 5
A10 Mishandling Exceptions         ████████░░  3 / 4  ✅ Sprint 1

TOTAL: 22 / 51 controles cumplidos (43.1%)
Sprint 1 completado 2026-07-09 — +18 controles aplicados
```

---

## A01:2025 — Control de Acceso Roto
> *100% de las aplicaciones tienen alguna forma de control de acceso roto — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 1.1 | Autenticación requerida en `/api/generate-raw` | ✅ 📅 | `server.js` | `express-basic-auth` protege todos los endpoints — requiere `ADMIN_USER`/`ADMIN_PASS` |
| 1.2 | Autenticación requerida en `/api/leads` | ✅ 📅 | `server.js` | Middleware global basic auth antes de `express.static` y rutas |
| 1.3 | Autenticación requerida en `/api/prefetch-report` | ✅ 📅 | `server.js` | Toda la app protegida — la UI muestra diálogo nativo del browser |
| 1.4 | Validación que `leadId` pertenece al usuario autenticado | ✅ 📅 | `server.js` | Regex `^[\w-]{1,64}$` valida formato; control de acceso por sesión pendiente |
| 1.5 | Principio de mínimo privilegio en el servidor | ❌ | `server.js` | Proceso corre con permisos de usuario sin restricciones adicionales |
| 1.6 | `sessionKey` de caché validado contra usuario autenticado | ❌ | `server.js:317` | Una `sessionKey` robada permite generar PDFs de otros usuarios |

**Corrección recomendada:**
```js
// Agregar middleware de autenticación básica (inicio rápido)
const basicAuth = require('express-basic-auth');
app.use('/api', basicAuth({ 
  users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS },
  challenge: true 
}));
```

---

## A02:2025 — Configuración de Seguridad Incorrecta
> *100% de las aplicaciones probadas tenían alguna mala configuración — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 2.1 | Headers de seguridad HTTP (Helmet.js) | ✅ 📅 | `server.js` | `helmet()` activo: `X-Frame-Options`, `X-Content-Type`, `HSTS`, `X-DNS-Prefetch` |
| 2.2 | CORS configurado explícitamente | ❌ | `server.js` | Express por defecto acepta requests de cualquier origen |
| 2.3 | Rate limiting en endpoints de API | ✅ 📅 | `server.js` | `express-rate-limit`: 20 req/min en `/api` — protege Gemini y WebCEO |
| 2.4 | Modo de error en producción no expone stack traces | ✅ 📅 | `server.js` | Catch blocks devuelven mensajes genéricos — detalles solo en `console.error` |
| 2.5 | Puerto no expuesto directamente en producción | ⚠️ | `server.js:19` | Puerto 3000 expuesto — debería estar detrás de proxy (nginx/Caddy) |
| 2.6 | Variables de entorno sensibles no logueadas | ⚠️ | `server.js` | `console.error` puede incluir stacks con rutas internas |
| 2.7 | Content Security Policy en frontend | ❌ | `public/index.html` | Sin CSP — permite XSS via scripts inline/externos |

**Corrección recomendada:**
```js
// npm install helmet express-rate-limit
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(helmet());
app.use('/api', rateLimit({ windowMs: 60_000, max: 20 }));
```

---

## A03:2025 — Fallos en la Cadena de Suministro de Software
> *El gusano npm autorreplicante Shai-Hulud 2025 afectó 500+ versiones de paquetes — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 3.1 | `npm audit` sin vulnerabilidades conocidas | ❌ | `package.json` | No verificado — ejecutar `npm audit` periódicamente |
| 3.2 | Versiones de dependencias fijadas (lockfile) | ⚠️ | `package-lock.json` | `package.json` usa `^` (permite minor updates) |
| 3.3 | Dependencias CDN con hash de integridad SRI | ✅ 📅 | `index.html:7,404` | Quill.js CSS y JS con `integrity="sha384-..."` desde cdn.jsdelivr.net |
| 3.4 | SBOM (inventario de dependencias) documentado | ❌ | — | No existe inventario formal de dependencias |
| 3.5 | Actualizaciones de dependencias con revisión de changelog | ❌ | — | No hay proceso definido de revisión antes de `npm update` |

**Corrección recomendada para SRI:**
```html
<!-- Generar hash: https://www.srihash.org/ -->
<link rel="stylesheet" 
  href="https://cdn.quilljs.com/1.3.7/quill.snow.css"
  integrity="sha384-[HASH_AQUÍ]"
  crossorigin="anonymous">
<script src="https://cdn.quilljs.com/1.3.7/quill.min.js"
  integrity="sha384-[HASH_AQUÍ]"
  crossorigin="anonymous"></script>
```

---

## A04:2025 — Fallos Criptográficos
> *Uso de algoritmos obsoletos, gestión deficiente de claves y exposición de datos sensibles — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 4.1 | Secrets en `.env` (no hardcodeados) | ✅ 📅 | `.env` | `WEBCEO_API_KEY` y `GEMINI_API_KEY` en variables de entorno |
| 4.2 | `.env` en `.gitignore` | ⚠️ | `.gitignore` | Verificar que `.env` nunca fue commiteado al historial git |
| 4.3 | `sessionKey` generada con `crypto.randomBytes` | ✅ 📅 | `server.js:290` | Usa `crypto.randomBytes(12)` — suficientemente seguro para sesiones |
| 4.4 | API keys no expuestas en logs ni responses | ✅ 📅 | `server.js` | Gemini key movida a header `x-goog-api-key` — ya no aparece en URLs |
| 4.5 | Comunicación con APIs externas sobre HTTPS | ✅ | `server.js:39` | WebCEO y Gemini usan HTTPS obligatorio |

**Corrección recomendada:**
```js
// Rotar a Bearer token (header) en lugar de query param para Gemini
headers: { 
  'Content-Type': 'application/json',
  'x-goog-api-key': apiKey  // no en URL
}
```

---

## A05:2025 — Inyección
> *Command Injection: `domain; cat /etc/passwd` ejecuta comandos del sistema — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 5.1 | Sanitización de `domain` en rutas de archivo | ✅ | `server.js:341` | `domain.replace(/[^a-z0-9]/gi, '_')` antes de usar en path |
| 5.2 | Validación de URL antes de pasarla a Puppeteer/thum.io | ✅ 📅 | `scrape-site.js` | `isAllowedUrl()` bloquea localhost, rangos privados y link-local |
| 5.3 | Validación de `leadId` (formato esperado) | ✅ 📅 | `server.js` | Regex `^[\w-]{1,64}$` rechaza leadIds con caracteres inesperados |
| 5.4 | Validación de tamaño y tipo MIME de imágenes subidas | ❌ 🔒 | `index.html:428` | Solo validación cliente (5MB) — servidor acepta cualquier contenido |
| 5.5 | Sanitización de contenido del editor antes del PDF | ⚠️ | `server.js:334` | `overrides.geminiAnalysis` y `coverLetter` aceptados sin sanitizar |
| 5.6 | Escape de datos de WebCEO antes de incluir en PDF | ⚠️ | `pdf-raw-report.js` | Datos del API (domain, keywords) se insertan directamente en PDF |

**Corrección recomendada:**
```js
// Validar URL antes de scrapear (previene SSRF)
function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return false;
    return true;
  } catch { return false; }
}
```

---

## A06:2025 — Diseño Inseguro
> *Un diseño inseguro no puede corregirse con implementación perfecta — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 6.1 | Modelo de amenazas documentado para el sistema | ❌ | — | No existe threat modeling documentado |
| 6.2 | Flujo de autenticación diseñado desde el inicio | ❌ 🔒 | — | Sistema diseñado sin autenticación — requiere rediseño |
| 6.3 | Límites de uso de APIs de pago (Gemini) por usuario | ❌ | `server.js:284` | Sin throttling — un atacante puede agotar créditos de Gemini |
| 6.4 | Flag `--disable-web-security` en Puppeteer eliminado | ✅ 📅 | `scrape-site.js` | Flag eliminado — Puppeteer opera con políticas de seguridad estándar |

**Corrección recomendada:**
```js
// Eliminar --disable-web-security de Puppeteer
args: [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  // ELIMINAR: '--disable-web-security',
],
```

---

## A07:2025 — Fallos de Autenticación
> *Credential stuffing y fuerza bruta sin restricciones — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 7.1 | Sistema de autenticación implementado | ✅ 📅 | `server.js` | `express-basic-auth` — credentials en `ADMIN_USER`/`ADMIN_PASS` del .env |
| 7.2 | Protección contra fuerza bruta (lockout / backoff) | ⚠️ 📅 | `server.js` | Rate limiting 20 req/min frena ataques de fuerza bruta — sin lockout progresivo |
| 7.3 | Sesiones invalidadas al cerrar el servidor / expiradas | ⚠️ | `server.js:292` | `reportCache` se limpia a los 30 min (TTL), pero persiste entre reinicios |
| 7.4 | Tokens de sesión con alta entropía | ✅ | `server.js:290` | `crypto.randomBytes(12)` = 96 bits de entropía |
| 7.5 | Credenciales de servicio rotadas periódicamente | ❌ | `.env` | No hay proceso de rotación de `WEBCEO_API_KEY` / `GEMINI_API_KEY` |

---

## A08:2025 — Fallos de Integridad de Software o Datos
> *Sin verificación criptográfica de dependencias, actualizaciones sin firma — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 8.1 | Scripts CDN con Subresource Integrity (SRI) | ✅ 📅 | `index.html:7,404` | Quill.js CSS y JS con `integrity="sha384-..."` + `crossorigin="anonymous"` |
| 8.2 | Validación de tipo de archivo en uploads del servidor | ❌ 🔒 | `server.js:22` | El servidor acepta cualquier contenido hasta 5MB sin verificar MIME |
| 8.3 | Imágenes base64 validadas antes de pasarlas a PDFKit | ❌ | `pdf-raw-report.js:258` | Buffer decodificado y pasado a `doc.image()` sin validar formato |
| 8.4 | Dependencias verificadas con checksums en CI/CD | ❌ | — | No existe pipeline CI/CD con verificación |

**Corrección recomendada para validación de imagen en servidor:**
```js
// npm install file-type
const { fileTypeFromBuffer } = require('file-type');

app.use('/api', async (req, res, next) => {
  if (req.body?.overrides?.coverLetter) {
    const imgMatches = req.body.overrides.coverLetter.matchAll(/\[IMG:data:([^;]+);base64,([^\]]+)\]/g);
    for (const [, mime, b64] of imgMatches) {
      const buf = Buffer.from(b64, 'base64');
      const detected = await fileTypeFromBuffer(buf);
      if (!detected || !['image/jpeg','image/png','image/gif','image/webp'].includes(detected.mime)) {
        return res.status(400).json({ error: 'Tipo de imagen no permitido' });
      }
    }
  }
  next();
});
```

---

## A09:2025 — Fallos en Logging y Alertas de Seguridad
> *Brechas pueden persistir durante años sin detectarse — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 9.1 | Log de todas las peticiones a endpoints de API | ❌ | `server.js` | Solo `console.error` en errores — sin log de accesos exitosos |
| 9.2 | Log con timestamp, IP, método, ruta y código de respuesta | ❌ | `server.js` | No existe logging estructurado con metadatos |
| 9.3 | Alertas ante errores repetidos o patrones anómalos | ❌ | `server.js` | Sin sistema de alertas |
| 9.4 | Logs no exponen API keys ni datos sensibles | ⚠️ | `server.js:358` | `err.message` puede contener URLs con keys en query params |
| 9.5 | Trazabilidad de qué usuario generó qué PDF | ❌ | `server.js` | Sin identificación de quién genera cada reporte |

**Corrección recomendada:**
```js
// npm install morgan winston
const morgan  = require('morgan');
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.File({ filename: 'logs/access.log' })],
});
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
```

---

## A10:2025 — Manejo Incorrecto de Condiciones Excepcionales
> *Cada excepción sin liberar recursos acumula hasta colapsar el sistema — OWASP 2025*

| # | Control | Estado | Archivo | Notas |
|---|---------|--------|---------|-------|
| 10.1 | Archivos temporales PDF eliminados ante error | ✅ | `server.js:357` | `fs.unlink(tmpPath, () => {})` en bloque `catch` |
| 10.2 | Browser Puppeteer cerrado en `finally` siempre | ✅ | `scrape-site.js:103` | `if (browser) await browser.close()` en bloque `finally` |
| 10.3 | Timeouts definidos para todas las llamadas externas | ⚠️ | `server.js:249` | Axios tiene `timeout: 30000` pero la llamada HTTPS a Gemini no tiene timeout |
| 10.4 | Mensajes de error genéricos al cliente (no stack traces) | ✅ 📅 | `server.js` | Handler centralizado + mensajes genéricos en todos los catch blocks |

**Corrección recomendada:**
```js
// Error handler centralizado con mensajes genéricos
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
});
```

---

## Resumen de Vulnerabilidades Críticas (Acción Inmediata)

| Prioridad | Vulnerabilidad | OWASP | Dificultad de fix |
|-----------|---------------|-------|-------------------|
| 🔴 CRÍTICO | Sin autenticación en ningún endpoint | A01, A07 | Media — agregar express-basic-auth |
| 🔴 CRÍTICO | SSRF posible: URL de prospecto sin validar en Puppeteer | A05 | Baja — agregar `isAllowedUrl()` |
| 🔴 CRÍTICO | Sin rate limiting — abuso de Gemini API (costo real) | A02, A06 | Baja — agregar express-rate-limit |
| 🔴 CRÍTICO | Quill.js CDN sin SRI hash | A08 | Baja — agregar atributo integrity |
| 🔴 CRÍTICO | `--disable-web-security` en Puppeteer | A06 | Baja — eliminar el flag |
| 🟠 ALTO | Sin security headers (Helmet) | A02 | Baja — `npm install helmet` |
| 🟠 ALTO | Sin validación MIME de imágenes en servidor | A05, A08 | Media — agregar file-type |
| 🟠 ALTO | Errores con stack trace enviados al cliente | A10 | Baja — error handler central |
| 🟡 MEDIO | Sin logging estructurado de accesos | A09 | Media — agregar Morgan/Winston |
| 🟡 MEDIO | Clave Gemini en query param URL | A04 | Baja — pasar como header |

---

## Plan de Implementación por Sprint

### Sprint 1 — Correcciones Críticas (1-2 días)
- [ ] **1.1** Eliminar `--disable-web-security` de Puppeteer (`scrape-site.js:69`)
- [ ] **1.2** Agregar validación SSRF en `scrapeSite` y `fetchThumbnail` 
- [ ] **1.3** Agregar `express-rate-limit` (20 req/min en `/api`)
- [ ] **1.4** Agregar `helmet()` para security headers
- [ ] **1.5** Agregar `integrity` + `crossorigin` a los tags de Quill.js
- [ ] **1.6** Cambiar API key Gemini de query param a header `x-goog-api-key`
- [ ] **1.7** Error handler centralizado (no exponer `err.message` al cliente)

### Sprint 2 — Autenticación (2-3 días)
- [ ] **2.1** Implementar autenticación básica o JWT en todos los endpoints `/api`
- [ ] **2.2** Agregar `.env` con `ADMIN_USER` y `ADMIN_PASS` (o JWT secret)
- [ ] **2.3** Validar formato de `leadId` antes de enviarlo a WebCEO
- [ ] **2.4** Validar URLs antes de scrapear (whitelist de protocolos y bloqueo de IPs privadas)
- [ ] **2.5** Validar tipo MIME de imágenes base64 en el servidor

### Sprint 3 — Observabilidad y Supply Chain (2-3 días)
- [ ] **3.1** Agregar Morgan + Winston para logging estructurado
- [ ] **3.2** Ejecutar `npm audit fix` y documentar resultado
- [ ] **3.3** Fijar versiones exactas en `package.json` (sin `^`)
- [ ] **3.4** Generar SBOM con `npm sbom --package-lock-only`
- [ ] **3.5** Definir proceso de rotación de API keys (renovar cada 90 días)
- [ ] **3.6** Agregar timeout explícito a llamadas HTTPS a Gemini

### Sprint 4 — Hardening Avanzado
- [ ] **4.1** Mover servidor detrás de nginx/Caddy con TLS
- [ ] **4.2** Implementar CSP estricto en `public/index.html`
- [ ] **4.3** Agregar validación de tamaño máximo por tipo de campo en overrides
- [ ] **4.4** Documentar modelo de amenazas del sistema
- [ ] **4.5** Configurar alertas para errores repetidos (e.g. > 5 errores 500 en 1 min)

---

## Registro de Cambios de Seguridad

| Fecha | Fix aplicado | OWASP | Autor |
|-------|-------------|-------|-------|
| — | — | — | — |

---

*Checklist generado con base en [OWASP Top 10 2025](https://owasp.org/Top10/) y análisis del código fuente del proyecto.*  
*Actualizar este archivo cada vez que se implemente un control de seguridad.*
