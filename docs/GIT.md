# Subir el proyecto a tu repositorio

## Si ya tienes un repo

En tu copia del repositorio actual, guarda primero los cambios que quieras conservar. Revisa `git status` antes de cada commit. No copies sobre archivos que todavía no hayas respaldado.

```bash
git switch -c mejora/control-tcc-studio
```

Copia **el contenido** de la carpeta `control-tcc-studio/` del ZIP a la raíz de tu repo. Incluye `.github/`, `.gitignore` y `.firebaserc` (pueden aparecer ocultos en tu explorador). Conserva la carpeta `.git` de tu repositorio. Si ya tienes workflows o reglas de Firebase para otras aplicaciones, integra sus cambios; no los sustituyas a ciegas.

```bash
npm ci
npm ci --prefix functions
npm run verify
npx playwright install chromium --only-shell
npm run test:e2e
git status
git diff --stat
git add .
git diff --cached --stat
git commit -m "Refactoriza Control TCC y mejora interfaz, datos e IA"
git push -u origin mejora/control-tcc-studio
```

Abre un Pull Request hacia tu rama principal y revisa la migración con una copia de tu respaldo. El ZIP no contiene una carpeta `.git`, historial inventado ni credenciales de acceso al repositorio.

## Si es un repo nuevo

Crea un repositorio vacío en GitHub y, dentro del proyecto extraído:

```bash
git init -b main
git add .
git commit -m "Añade Control TCC Studio"
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

Reemplaza `URL_DE_TU_REPOSITORIO` por la dirección HTTPS o SSH real que te da GitHub. Nunca incluyas un token en esa URL ni en un archivo del proyecto.

## Publicar en GitHub Pages

1. En tu repo, abre **Settings → Pages → Source → GitHub Actions**.
2. Sube esta versión. El workflow `ci.yml` comprueba cambios y Pull Requests.
3. Al subir a `main` se ejecuta **Actions → Publicar Control TCC** automáticamente. También puedes usar **Run workflow**. Espera a que termine en verde.
4. Abre la URL generada. Vite utiliza rutas relativas para funcionar en `https://usuario.github.io/repositorio/`.
5. Añade `usuario.github.io` a los dominios autorizados de Firebase Auth. Configura el backend según `FIREBASE.md`.

El workflow de Pages publica únicamente `dist/`. No publica `functions/`, tus documentos de Firestore ni archivos `.env`. La IA y los avisos programados **no se despliegan con Pages**: necesitan Cloud Functions.

Alternativa: puedes publicar `dist/` en un hosting estático o utilizar Firebase Hosting. El frontend no necesita un servidor Node en producción.

## Archivos que sí van a Git

`src/`, `public/`, `functions/` (sin dependencias ni secretos), ambos `package-lock.json`, configuraciones, pruebas, documentación, `.github/`, `.firebaserc` y reglas. La configuración web pública de Firebase es intencionalmente visible; las reglas y Auth protegen los datos.

`.gitignore` excluye `node_modules/`, `dist/`, resultados de pruebas, `.env*` privados y archivos habituales de cuentas de servicio. El ZIP incluye `dist/` para facilitar una vista previa, pero CI lo vuelve a compilar.

## Deshacer la actualización

Conserva el commit anterior. Haz un `git revert` del commit de actualización y vuelve a desplegar el frontend si necesitas volver temporalmente a la versión previa. La versión antigua no entiende los registros v2: exporta primero tus datos nuevos y consulta `MIGRATION.md` para evitar confundir ausencia de sincronización con pérdida de información.
