# Guía para publicar y gestionar la Agenda Cultural Rosario

No hace falta saber programar. Todo se hace desde el navegador, con cuentas gratuitas de **GitHub** y **Google**.

## Cómo funciona (en 30 segundos)

| Pieza | Qué hace | Quién la maneja |
|---|---|---|
| **Robot rastreador** | Todos los días a las 6 AM visita las webs de la lista y guarda los eventos nuevos | Automático |
| **Formulario de Google** | Las productoras cargan sus eventos | Vos aprobás en una hoja de cálculo |
| **Contador de consultas** | Cuenta qué eventos se abren más y arma "Lo más consultado" | Automático |
| **`config.json`** | Nombre del sitio, links y publicidad | Vos, editando un texto |

---

## 1. Publicar la web (una sola vez, ~10 minutos)

1. Creá una cuenta en <https://github.com> y tocá **New repository**. Nombre: `agenda-rosario`. Dejalo **Public**.
2. Tocá **uploading an existing file** y arrastrá **todo el contenido** de esta carpeta (incluida la carpeta oculta `.github`). Tocá **Commit changes**.
3. Andá a **Settings → Pages**. En *Source* elegí **Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guardá.
4. A los 2 minutos aparece tu dirección: `https://TU-USUARIO.github.io/agenda-rosario/`.
5. Andá a **Settings → Actions → General → Workflow permissions** y elegí **Read and write permissions**. Guardá.
6. Andá a **Actions → Actualizar agenda → Run workflow** para hacer la primera actualización a mano. Desde ahí se repite sola todos los días.

> ¿Querés un dominio propio (por ejemplo `agendarosario.com.ar`)? Se compra en un registrador y se conecta en *Settings → Pages → Custom domain*.

## 2. Que las productoras carguen sus eventos

1. Entrá a <https://forms.google.com> y creá un formulario con estas preguntas (respuesta corta salvo que se indique). **Los nombres importan**, la web los reconoce por estas palabras:
   - **Título del evento**
   - **Fecha de inicio** (tipo *Fecha*)
   - **Fecha de fin** (tipo *Fecha*, opcional, para muestras o ciclos)
   - **Hora** (tipo *Hora*)
   - **Lugar** (nombre y dirección)
   - **Descripción** (párrafo)
   - **Público** (desplegable: Todo público, Infantil y familiar, Jóvenes, Adultos (+18))
   - **Género** (desplegable: Música, Teatro, Danza, Cine, Artes visuales, Literatura, Humor, Infantil, Charlas y talleres, Festivales y ferias, Otros)
   - **Cómo conseguir entradas** (ej.: "Gratis, sin reserva" / "Entradas en Alpogo" / "Reservas por WhatsApp")
   - **Enlace** (web de entradas o de más info)
   - **Imagen (link)** (opcional; link público a un flyer)
   - **Productora**
   - **Email de contacto** (solo lo ves vos)
2. En la pestaña **Respuestas** tocá el ícono verde de Sheets para crear la hoja.
3. En la hoja agregá **dos columnas nuevas al final**: `Aprobado` y `Destacado`.
4. **Regla de oro:** un evento solo aparece en la web cuando escribís **SI** en `Aprobado`. Así nadie publica sin que lo revises. Si querés que salga primero en destacados, escribí **SI** en `Destacado`.
5. Para conectar la hoja con la web: **Archivo → Compartir → Publicar en la web** → elegí la pestaña de respuestas y el formato **Valores separados por comas (.csv)** → **Publicar** → copiá el link.
6. En el formulario tocá **Enviar → link** y copiá el link del formulario.
7. En GitHub abrí `config.json`, tocá el lápiz y completá:
   ```
   "formularioProductoras": "link del formulario",
   "hojaEventosCSV": "link del CSV publicado",
   ```
   Guardá con **Commit changes**. El botón "Cargar mi evento" ya lleva al formulario.

## 3. Publicidad

Hay 4 espacios: `cabecera` (arriba), `lateral` (costado), `intermedio` (entre eventos) y `pie` (abajo). En `config.json`, dentro de `"publicidad"`, completá el que quieras:

```
"cabecera": {
  "imagen": "https://link-al-banner.jpg",
  "enlace": "https://web-del-anunciante.com",
  "texto": "Nombre del anunciante",
  "codigoHtml": ""
}
```

- **Banner propio:** subí la imagen a la carpeta del proyecto (o a cualquier sitio público) y pegá su link en `imagen`. Medidas recomendadas: cabecera/pie 970×90, lateral 300×250.
- **Solo texto:** dejá `imagen` vacía y completá `texto`.
- **Google AdSense u otra red:** pegá el código que te dan en `codigoHtml` (entre comillas, en una línea).
- **Espacio libre:** si no completás nada, se muestra "Anunciá acá". Completá `contactoEnlace` (por ejemplo `https://wa.me/549341XXXXXXX`) o `emailContacto` para que los anunciantes te escriban.

Para sacar un anuncio, borrá sus datos y guardá.

## 4. "Lo más consultado" (contador, opcional)

Sin esto la web igual funciona: muestra destacados por cercanía de fecha y los que marques `SI` en la hoja. Con el contador, los destacados pasan a ser los que más miran los visitantes.

1. Abrí la **hoja de respuestas** del formulario y andá a **Extensiones → Apps Script**.
2. Borrá lo que haya y pegá el contenido del archivo `contador/contador.gs`. Guardá.
3. Tocá **Implementar → Nueva implementación → Aplicación web**. *Ejecutar como:* **Yo**. *Quién tiene acceso:* **Cualquier persona**. Implementá y aceptá los permisos.
4. Copiá la URL que termina en `/exec` y pegala en `config.json` → `"contador": "..."`.

La hoja crea sola una pestaña **Consultas** con los números por evento.

## 5. Agregar o quitar fuentes automáticas

Abrí `scraper/fuentes.json`. Cada fuente es un bloque. Hay tres tipos:

- `agenda-municipal`: la agenda oficial de la Municipalidad de Rosario.
- `jsonld`: sitios que publican sus eventos en formato estándar (Eventbrite y muchos otros). Pegá la URL del listado.
- `ical`: cualquier calendario con link `.ics` (Google Calendar público, etc.).

Para apagar una fuente poné `"activa": false`. Si una web cambia y deja de funcionar, **el sitio no se rompe**: conserva lo último que tenía de esa fuente. Podés ver qué pasó en `data/estado.json` (cada fuente dice `ok: true/false` y el error).

Para sumar una web con diseño propio que no publica datos estándar, pedile a un desarrollador o a Claude que agregue un nuevo tipo de fuente; es un trabajo de 1–2 horas.

## 6. Rutina semanal sugerida (15 minutos)

1. Revisar la hoja de respuestas y aprobar con **SI** los eventos que correspondan.
2. Mirar `data/estado.json` para verificar que las fuentes siguen funcionando.
3. Actualizar los anuncios vigentes en `config.json`.

## Preguntas frecuentes

**¿Cuánto cuesta?** GitHub Pages, Google Forms/Sheets/Apps Script y el robot diario son gratuitos para este volumen. Solo pagarías un dominio propio (opcional).

**¿Puedo corregir un evento automático?** Sí: cargalo en la hoja (o en el formulario) con el mismo título y la misma fecha de inicio, con los datos correctos y `SI` en `Aprobado`. Lo cargado a mano pisa al automático. Para esconder uno por completo, por ahora hay que desactivar la fuente (`"activa": false`).

**Aviso legal:** el sitio reúne información pública y enlaza a la fuente original. Conviene revisar los términos de uso de cada web antes de sumarla a la lista, y pedir permiso a quien publique contenido propio (imágenes incluidas).
