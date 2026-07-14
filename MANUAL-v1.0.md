# Manual de Uso — SEO Report Generator v1.0
**Mentalidad Web · Sistema Interno**

---

## Índice

1. [¿Qué hace esta herramienta?](#1-qué-hace-esta-herramienta)
2. [Acceso al sistema](#2-acceso-al-sistema)
3. [Pantalla principal](#3-pantalla-principal)
4. [Seleccionar un prospecto](#4-seleccionar-un-prospecto)
5. [Generar PDF directo](#5-generar-pdf-directo)
6. [Modo Editor avanzado](#6-modo-editor-avanzado)
7. [Contenido del PDF generado](#7-contenido-del-pdf-generado)
8. [Cerrar sesión](#8-cerrar-sesión)
9. [Preguntas frecuentes](#9-preguntas-frecuentes)

---

## 1. ¿Qué hace esta herramienta?

El **SEO Report Generator** extrae automáticamente los datos de posicionamiento, backlinks y métricas técnicas de un prospecto desde WebCEO, los analiza con inteligencia artificial (Gemini) y genera un PDF de presentación profesional listo para entregar al cliente.

**Fuentes de datos que usa:**
- WebCEO API — rankings, keywords, backlinks, competidores, performance
- Scraping del sitio — título, meta descripción, teléfono, email, dirección
- Google Gemini 2.5 Flash — diagnóstico redactado en español

**Lo que obtienes:** un PDF de entre 6 y 8 páginas con el diseño de Mentalidad Web, que incluye portada, diagnóstico de usabilidad, análisis técnico SEO, análisis IA y tabla de posicionamiento.

---

## 2. Acceso al sistema

Abre el sistema en tu navegador: `http://localhost:3000`

Serás redirigido automáticamente a la pantalla de login si no tienes sesión activa.

### Método 1 — Email + contraseña

| Campo | Valor |
|-------|-------|
| Correo electrónico | Tu correo `@mentalidadweb.com` |
| Contraseña | La clave definida en `ADMIN_PASS` del `.env` |

> **Solo se aceptan correos con dominio @mentalidadweb.com.** Si ingresas otro dominio, el sistema lo rechazará antes de verificar la contraseña.

### Método 2 — Continuar con Google

Si el botón **"Continuar con Google"** aparece en la pantalla de login, puedes hacer clic y autenticarte directamente con tu cuenta Google corporativa (`@mentalidadweb.com`).

El flujo es:
1. Clic en "Continuar con Google"
2. Google te pide seleccionar o confirmar tu cuenta
3. Vuelves automáticamente al sistema ya autenticado

> El botón de Google solo aparece si las credenciales OAuth están configuradas en el servidor.

### Duración de la sesión

La sesión dura **8 horas** desde el último login. Pasado ese tiempo serás redirigido al login automáticamente.

---

## 3. Pantalla principal

Después de iniciar sesión verás la pantalla principal con tres zonas:

```
┌─────────────────────────────────────────────────┐
│  rvera@mentalidadweb.com          [Cerrar sesión]│  ← Barra de usuario
├─────────────────────────────────────────────────┤
│  Mentalidad Web                                  │
│  SEO REPORT                                      │
│  Selecciona un prospecto de WebCEO…              │
│                                                  │
│  ┌──────────────────────────────────┐            │
│  │ dominio.cl          ⚡82  DA 15  │  ← Tarjeta │
│  │ Nombre del contacto  [Unprocessed]│           │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │ otrodominio.com     ⚡45  DA 8   │            │
│  │ Otro contacto        [Email sent] │            │
│  └──────────────────────────────────┘            │
│                                                  │
│  [  Descargar PDF  ]  [  Editar  ]               │  ← Botones de acción
└─────────────────────────────────────────────────┘
```

### Indicadores en cada tarjeta

| Indicador | Qué significa |
|-----------|---------------|
| `⚡ 82` | **Performance score** de Google (0–100). Mayor es mejor |
| `DA 15` | **Domain Authority** de Moz (0–100). Refleja la autoridad del dominio |
| Pill de color | Estado del prospecto en WebCEO (ver tabla abajo) |

### Estados de prospecto (color pills)

| Color | Estado | Significado |
|-------|--------|-------------|
| Gris | Unprocessed | Sin gestionar todavía |
| Azul | Email sent | Se le envió email |
| Amarillo | Negotiations | En negociación |
| Verde | Converted | Cliente convertido |

---

## 4. Seleccionar un prospecto

Haz clic en cualquier tarjeta de la lista. Al seleccionarla:

- Se resalta con borde rojo
- Aparece un **panel de detalle** debajo de la lista con:
  - **4 métricas**: Performance, DA, Visitas orgánicas/mes, Buscadores configurados
  - **Keywords objetivo**: etiquetas con las keywords trackeadas en WebCEO
  - **Datos del contacto**: email, ubicación objetivo, idioma, notas

Solo puedes tener un prospecto seleccionado a la vez. Si cambias de prospecto, los botones se actualizan automáticamente.

---

## 5. Generar PDF directo

Con un prospecto seleccionado, haz clic en **"Descargar PDF"**.

### ¿Qué ocurre paso a paso?

El sistema muestra una barra de progreso con los pasos en tiempo real:

| Paso | Descripción | Tiempo aprox. |
|------|-------------|---------------|
| 1 | Obteniendo datos del prospecto… | 2–5 s |
| 2 | Obteniendo keywords… | 2–5 s |
| 3 | Obteniendo rankings… | 3–8 s |
| 4 | Obteniendo competidores… | 2–5 s |
| 5 | Obteniendo backlinks… | 3–10 s |
| 6 | Capturando screenshot… | 5–15 s |
| 7 | Generando PDF… | 3–8 s |

**Tiempo total estimado:** entre 20 segundos y 2 minutos según la cantidad de datos del prospecto.

### Al finalizar

- El PDF se descarga automáticamente en tu carpeta de descargas
- El nombre del archivo sigue el formato: `seo-report-{leadId}-YYYY-MM-DD.pdf`
- Aparece un mensaje verde: **"¡PDF descargado exitosamente!"**

> Si algo falla aparece un mensaje rojo con la descripción del error. El botón se reactiva para que puedas reintentar.

---

## 6. Modo Editor avanzado

El modo editor te permite **personalizar el contenido del PDF antes de generarlo**. Haz clic en el botón **"Editar"**.

### ¿Qué carga el editor?

Al abrirse, el editor hace lo mismo que el flujo directo (obtiene todos los datos de WebCEO y ejecuta el análisis de Gemini) pero en lugar de generar el PDF de inmediato, te presenta todo el contenido para que lo revises y edites.

> Si ya abriste el editor para un prospecto en esta sesión y lo cerraste sin cambiar de prospecto, al volver a abrirlo **no se vuelven a pedir los datos** — usa la caché de la sesión (válida por 30 minutos).

### Estructura del editor

```
┌──────────────┬─────────────────────────────────────────────────┐
│  SEO EDITOR  │  [Panel de edición activo]                      │
│              │                                                 │
│  dominio.cl  │  Barra de formato (Quill)                       │
│              │  ────────────────────────────────────────────   │
│  TABS:       │                                                 │
│  Inf. Inicial│  Área de texto enriquecido                      │
│  Análisis IA │                                                 │
│  Inf. Final  │                                                 │
│              │                                                 │
│  SECCIONES   │                                                 │
│  ☑ Incidencias SEO        Pág 2                               │
│  ☑ Problemas usabilidad   Pág 3                               │
│  ☑ Factores Google        Pág 4                               │
│  ☑ Posicionamiento/Tóxicos Pág 5                              │
│  ☑ Análisis IA            Pág 6                               │
│              │                                                 │
│  [Generar PDF]│                                               │
└──────────────┴─────────────────────────────────────────────────┘
```

### Los tres paneles de edición

#### Pestaña "Inf. Inicial"
Página extra que se inserta **al inicio del reporte**, antes de la portada del análisis SEO.

Úsala para:
- Carta de presentación personalizada para el prospecto
- Contexto específico del cliente
- Propuesta de valor personalizada

Admite **imágenes** (botón 🖼 en la barra de herramientas). Las imágenes se incrustran en el PDF como base64.

#### Pestaña "Análisis IA"
Contiene el diagnóstico generado automáticamente por **Gemini 2.5 Flash**.

El texto cubre:
- Situación general del dominio
- Análisis de problemas de usabilidad con datos reales
- Análisis de problemas técnicos de posicionamiento
- Oportunidades estratégicas identificadas
- Plan de acción priorizado (mínimo 8 acciones)

Puedes editarlo libremente antes de incluirlo en el PDF. El texto es un editor enriquecido con soporte para negrita, cursiva, listas, encabezados y citas.

> Si Gemini no está configurado (`GEMINI_API_KEY` ausente en `.env`), este panel aparecerá vacío.

#### Pestaña "Inf. Final"
Página extra que se inserta **al final del reporte**.

Úsala para:
- Propuesta comercial de los servicios
- Tabla de precios
- Términos del contrato
- Llamada a la acción

También admite imágenes.

### Control de secciones del PDF

En el panel lateral puedes **activar o desactivar** cada sección del reporte con los checkboxes:

| Sección | Página | Contenido |
|---------|--------|-----------|
| Incidencias SEO | Pág 2 | Auditoría técnica del sitio |
| Problemas usabilidad | Pág 3 | Usabilidad de la homepage |
| Factores Google | Pág 4 | Backlinks, Trust Flow, Citation Flow |
| Posicionamiento / Tóxicos | Pág 5 | Rankings de keywords + backlinks tóxicos |
| Análisis IA | Pág 6 | Diagnóstico completo de Gemini |

Las secciones desactivadas no aparecerán en el PDF final.

### Cerrar el editor

- Clic en **✕** (esquina superior derecha del panel lateral)
- O presiona la tecla **Escape**

---

## 7. Contenido del PDF generado

### Flujo directo (sin editor)

| Sección | Contenido |
|---------|-----------|
| **Portada** | Dominio, fecha de análisis, logo MW |
| **Incidencias SEO** | Problemas técnicos detectados por WebCEO (404s, links rotos, imágenes, etc.) |
| **Problemas de usabilidad** | Diagnóstico de la homepage: title, meta, teléfono, email, dirección, performance |
| **Factores Google** | DA, backlinks totales, dofollow/nofollow, Trust Flow, Citation Flow |
| **Posicionamiento** | Tabla de keywords con posición actual, historial y competidores |
| **Análisis IA** | Diagnóstico narrativo de Gemini con plan de acción |

### Con editor activo

Añade las páginas del **Inf. Inicial** (si tiene contenido) al inicio, y el **Inf. Final** al final. Las secciones desactivadas se omiten.

---

## 8. Cerrar sesión

En la barra superior derecha haz clic en **"Cerrar sesión"**.

El sistema:
1. Elimina tu sesión en el servidor
2. Borra la cookie de autenticación del navegador
3. Te redirige a la pantalla de login

> La sesión también expira automáticamente a las 8 horas sin necesidad de cerrarla manualmente.

---

## 9. Preguntas frecuentes

**¿Cuánto tarda en generar el PDF?**
Entre 20 segundos y 2 minutos. Depende de la cantidad de keywords y backlinks del prospecto. Los tiempos más largos se deben a la captura de screenshot del sitio y la llamada a Gemini.

**¿El sistema puede fallar si el sitio del prospecto está caído?**
Sí. Si el scraping del sitio falla (timeout o error HTTP), el PDF se genera igual pero sin los datos de homepage (título, meta, teléfono, email, dirección). El análisis de WebCEO continúa normal.

**¿Puedo generar varios PDFs seguidos?**
Sí. Después de que aparezca el mensaje de éxito, selecciona otro prospecto y haz clic en "Descargar PDF" nuevamente.

**¿El análisis de IA siempre está disponible?**
Solo si `GEMINI_API_KEY` está configurada en el `.env`. Si no está, el PDF se genera sin la sección de análisis IA.

**¿Dónde se guardan los PDFs generados?**
Se descargan directamente en tu navegador (carpeta de descargas). No se almacenan en el servidor.

**Los datos de WebCEO parecen desactualizados, ¿qué hago?**
El sistema usa los datos del último escaneo en WebCEO. Para actualizar los datos, lanza un nuevo escaneo desde la plataforma WebCEO y espera 5–15 minutos antes de generar el reporte.

**¿Puedo editar el PDF después de descargarlo?**
No directamente. Si necesitas hacer ajustes, usa el modo Editor antes de generarlo.

**¿Qué pasa si cierro el editor sin generar el PDF?**
Los cambios no se guardan. Al volver a abrir el editor en la misma sesión, se cargan los datos originales de nuevo (pero sin perder la caché de WebCEO/Gemini si no han pasado 30 minutos).

**¿Puedo insertar el logo del cliente en el informe inicial?**
Sí. En las pestañas "Inf. Inicial" e "Inf. Final" del editor puedes insertar imágenes usando el botón 🖼 de la barra de herramientas. Las imágenes quedan incrustadas en el PDF.

---

*SEO Report Generator v1.0 · Mentalidad Web Ltda · © 2026*
