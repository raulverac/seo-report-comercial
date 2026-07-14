# SEO Report Generator — WebCEO + PDF

Genera automáticamente un reporte PDF de SEO con el diseño de MentalidadWeb,
conectándose a la API de WebCEO con solo ingresar una URL.

---

## Estructura del proyecto

```
seo-report-generator/
├── index.js           ← Punto de entrada CLI
├── webceo-client.js   ← Cliente API WebCEO
├── data-mapper.js     ← Transforma datos raw → formato normalizado
├── pdf-generator.js   ← Genera el PDF con diseño fiel al original
├── .env.example       ← Variables de entorno de ejemplo
├── package.json
└── output/            ← PDFs generados (se crea automáticamente)
```

---

## Requisitos

- Node.js 18+
- Cuenta WebCEO con plan **Agency Unlimited** (requerido para acceso a la API)
- API Key de WebCEO (en `Menú principal → API`)

---

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env y agrega tu WEBCEO_API_KEY
```

### `.env`
```env
WEBCEO_API_KEY=tu_api_key_aqui

# Opcional — personalizar el pie de página del reporte
COMPANY_NAME=Mentalidad Web Ltda
COMPANY_PHONE=+5626643163
COMPANY_URL=www.mentalidadweb.com

# Opcional — directorio de salida
OUTPUT_DIR=./output
```

---

## Uso

```bash
# Reporte básico (usa datos en caché de WebCEO)
node index.js https://newfieldconsulting.com

# Forzar re-escaneo completo en WebCEO antes de generar el reporte
node index.js https://newfieldconsulting.com --rescan

# Especificar nombre/ruta del PDF de salida
node index.js https://ejemplo.com --output ./reportes/cliente-junio.pdf

# Ver ayuda
node index.js --help
```

El PDF se guarda en `./output/seo-report-<dominio>-<fecha>.pdf` por defecto.

---

## Flujo de ejecución

```
URL ingresada
     │
     ▼
1. WebCEO: buscar proyecto por dominio
     │
     ├─ No existe → crear proyecto automáticamente
     │
     ▼
2. (--rescan) → lanzar rescan_project en WebCEO
     │
     ▼
3. Recopilar datos en paralelo:
   ├── get_rankings()           → posicionamiento keywords
   ├── get_rankings_keywords()  → lista de keywords
   ├── get_rankings_ses()       → motores de búsqueda configurados
   ├── get_dangerous_competitors()
   ├── get_site_audit()         → auditoría técnica on-page
   ├── get_backlinks()          → backlinks, Trust Flow, Citation Flow
   ├── get_toxic_links()        → backlinks tóxicos
   ├── get_social_metrics()     → Facebook, Pinterest
   └── get_page_speed()         → velocidad móvil y escritorio
     │
     ▼
4. data-mapper.js → normalizar y calcular score SEO
     │
     ▼
5. pdf-generator.js → generar PDF 8 páginas (diseño MentalidadWeb)
     │
     ▼
   📄 output/seo-report-<dominio>-<fecha>.pdf
```

---

## Páginas del reporte generado

| Pág. | Contenido |
|------|-----------|
| 1 | Portada (dominio, fecha, logo) |
| 2 | Resumen (errores/score) + Tabla de competidores |
| 3 | Redes sociales + Factores SEO (Trust Flow, Citation Flow, backlinks, etc.) |
| 4 | Velocidad y usabilidad móvil/escritorio |
| 5 | Posicionamiento por keywords en motores de búsqueda |
| 6 | Problemas técnicos (404, links rotos, imágenes rotas, etc.) |
| 7 | Links tóxicos + Factores on-page (TITLE, DESCRIPTION, H1, URLs, etc.) |
| 8 | Sitemap / Robots.txt |

---

## Comandos API WebCEO utilizados

| Comando | Datos obtenidos |
|---------|-----------------|
| `get_projects` | Lista de proyectos |
| `add_project` | Crear nuevo proyecto |
| `rescan_project` | Lanzar escaneo |
| `get_rankings` | Posiciones por keyword y SE |
| `get_rankings_keywords` | Keywords configuradas |
| `get_rankings_ses` | Motores de búsqueda |
| `get_average_rankings` | Ranking promedio |
| `get_dangerous_competitors` | Competidores con más tráfico |
| `get_site_audit` | Auditoría técnica completa |
| `get_backlinks` | Backlinks, Trust/Citation Flow |
| `get_toxic_links` | Links tóxicos |
| `get_social_metrics` | Facebook, Pinterest |
| `get_page_speed` | Velocidad móvil/escritorio |

---

## Solución de problemas

**"WEBCEO_API_KEY no encontrada"**
→ Asegúrate de tener el archivo `.env` con tu key.

**"Error al obtener datos de WebCEO: 403"**
→ Tu plan WebCEO no incluye acceso a la API. Requiere **Agency Unlimited**.

**"No se pudo crear el proyecto"**
→ Verifica que la URL sea válida y tenga formato `https://dominio.com`.

**"El PDF se genera pero los datos están vacíos"**
→ WebCEO puede no haber completado el escaneo. Espera 5-10 minutos y vuelve a ejecutar sin `--rescan`.

---

## Notas técnicas

- La API de WebCEO devuelve datos en **caché** del último escaneo si no se usa `--rescan`.
- Con `--rescan`, WebCEO lanza un nuevo análisis. Los datos frescos pueden tardar varios minutos en estar disponibles.
- El sistema maneja errores por herramienta: si `get_page_speed` falla, el resto del reporte se sigue generando.
- El score SEO se calcula internamente con ponderación: técnica (30%), rankings (25%), velocidad (20%), autoridad (25%).
