# Aplicar la corrección en tu app

Esta entrega corrige el ancho móvil y la lectura de tus datos anteriores. Conserva la configuración Firebase de **control-tcc** y los módulos de Gemini. El código está preparado para tu repo **allancs29/habitos**; no se ha publicado ni modificado tu cuenta Firebase desde esta entrega.

## 1. Actualizar GitHub

1. Descomprime el ZIP. Copia **el contenido** de `control-tcc-studio/` a la raíz de tu repo, donde están `package.json`, `index.html` y `src/`. No subas el ZIP ni una carpeta extra dentro del repo.
2. Sustituye los archivos del proyecto con esta versión; conserva tus archivos privados `.env` y la carpeta `.git`. No hace falta borrar el repositorio. Si usas la web de GitHub, sube las carpetas `src/`, `public/`, `docs/`, `tests/` y los archivos de la raíz; conserva `.github/workflows/pages.yml`, que ya configuraste. El ZIP incluye el mismo workflow de publicación automática.
3. Confirma los cambios en `main` o integra tu rama mediante un Pull Request.
4. En [Actions](https://github.com/allancs29/habitos/actions), espera a que **Publicar Control TCC** termine en verde. Pages debe tener **Source → GitHub Actions**.
5. Abre [tu app](https://allancs29.github.io/habitos/) y revisa **Ajustes → versión 2.0.1**. Si aún ves 2.0.0, abre con internet, cierra todas las pestañas de esta app y su ventana instalada, y vuelve a abrirla. Una versión nueva del service worker puede esperar a que se cierren las ventanas anteriores. No borres almacenamiento, IndexedDB ni datos del sitio para actualizar.

Desde una copia local del repo, después de copiar los archivos:

```bash
npm ci
npm run verify
git status
git add .
git diff --cached --stat
git commit -m "Corrige pantalla móvil y recuperación del historial"
git push
```

Revisa el contenido preparado para el commit antes de confirmar. La publicación automática escucha la rama `main`; si trabajas en otra, intégrala primero.

## 2. Habilitar la nueva estructura de datos

La versión anterior guardaba en `tcc_users/TU_UID`. La nueva usa además `tcc_users/TU_UID/v2_records`. Las reglas del documento padre no se heredan automáticamente a sus subcolecciones.

Si aún no publicaste las reglas incluidas:

1. Abre [Firebase Console](https://console.firebase.google.com/) y el proyecto **control-tcc**.
2. En **Firestore Database → Reglas**, conserva una copia del texto actual.
3. Si este proyecto sólo contiene esta app, pega el contenido completo de **`firestore.rules`** del ZIP y pulsa **Publicar**. Si lo comparten otras apps, integra el bloque `tcc_users/{uid}/v2_records/{recordId}` en tus reglas existentes; no elimines sus permisos.
4. Vuelve a la app y pulsa **Ajustes → Sincronizar ahora**.

Alternativa desde la carpeta que contiene `firebase.json`:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project control-tcc
```

Este paso publica reglas; no borra documentos. Para esta corrección de lectura de datos no necesitas redesplegar Gemini ni crear otro proyecto. Las evidencias y los servicios de IA conservan sus requisitos de Storage y Cloud Functions descritos en [docs/FIREBASE.md](docs/FIREBASE.md).

## 3. Cargar tus registros anteriores

- Inicia sesión con **el mismo correo y la misma cuenta** que usabas antes; crear otra cuenta genera otro UID y no encuentra el historial anterior.
- Con la estructura v2 vacía, la migración carga automáticamente el documento original. Si faltan permisos, los datos legibles se muestran con **Historial recuperado · falta sincronizar**; los nuevos cambios quedan locales hasta habilitar las reglas.
- Si v2 ya contiene registros y faltan los antiguos, entra en **Ajustes → Recuperar historial anterior de Firebase**, revisa el resumen y acepta. Se consulta primero el `stateJson` actual, no sólo su respaldo más antiguo.
- Si antes trabajabas sin cuenta, abre el **mismo navegador y dominio** donde estaban los registros y usa **Recuperar historial de este navegador**. Puedes exportar allí un JSON e importarlo en el teléfono. Los datos locales no viajan con el repositorio ni se trasladan automáticamente entre navegadores o instalaciones.
- Si recuperaste datos en el espacio local y luego iniciaste sesión, usa **Importar mis registros del espacio local** y revisa la confirmación.

Comprueba el estado **Sincronizado** y abre la misma cuenta en el otro dispositivo. Si falta información, conserva tu respaldo y el documento original: no uses Reiniciar espacio local ni elimines Firebase para solucionar la sincronización.

## 4. Abrirla como app en el teléfono

Usa la URL publicada mediante HTTPS, sin `?local=1`:

- **iPhone:** abre la URL en Safari → Compartir → Añadir a pantalla de inicio. Activa **Abrir como app web** si aparece. Después entra desde el icono instalado.
- **Android:** abre la URL en Chrome → menú de tres puntos → Añadir a pantalla de inicio / Instalar aplicación. Después entra desde el icono instalado.

La versión instalada usa pantalla independiente. El CSS reduce el rebote y la navegación por overscroll donde el navegador lo permite; una web no puede desactivar todos los gestos reservados al sistema operativo. Se conserva el zoom con dos dedos para accesibilidad. No hace falta desinstalar una app existente para recibir la actualización.

## Qué se conservó y qué falta comprobar

La configuración pública Firebase coincide con la original y no se escribe sobre el documento anterior. Las pruebas de recuperación usan cuentas simuladas; no se han leído tus documentos privados ni publicado reglas en tu proyecto. Las pruebas móviles son de navegador con emulación táctil; confirma el resultado en tu teléfono y su instalación real.

Referencias oficiales: [reglas y subcolecciones de Firebase](https://firebase.google.com/docs/rules/rules-behavior), [app web en iPhone](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios), [apps web en Android](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid), [control de overscroll](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior).
