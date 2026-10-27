# Control TCC Studio · 2.0

Aplicación personal de hábitos, alimentación, trabajo, finanzas, aprendizaje, gimnasio y despensa. Esta versión separa las vistas, estilos, lógica y servicios; conserva el proyecto Firebase **`control-tcc`** del HTML original.

## Empezar

Necesitas Node.js 22.14 o posterior. Desde la carpeta que contiene `package.json`:

```bash
npm ci
npm run dev
```

Abre la dirección que indica Vite. El registro manual funciona sin iniciar sesión ni configurar IA. No abras `index.html` con doble clic: usa el servidor de desarrollo o publica el contenido de `dist/`.

El ZIP incluye **código fuente y `dist/` ya compilado**. Para modificarlo, trabaja en `src/` y vuelve a ejecutar `npm run build`; editar `dist/` directamente se pierde en la próxima compilación.

## Antes de sustituir tu versión actual

1. Exporta un respaldo JSON en la aplicación anterior y haz un commit de tu repositorio actual.
2. Prueba esta versión y revisa [MIGRATION.md](docs/MIGRATION.md). Los datos de invitado se separan de los de cada cuenta.
3. Configura reglas y backend siguiendo [FIREBASE.md](docs/FIREBASE.md). La configuración pública del proyecto ya está conservada; **la clave privada de Gemini debe configurarse en el servidor**.
4. Sigue [GIT.md](docs/GIT.md) para subir el código y publicar el frontend.

## Qué cambia

- Pantalla **Hoy**, navegación lateral en escritorio, accesos inferiores en móvil y temas claro/oscuro.
- Hábitos con frecuencia, objetivos por cantidad, archivo, deshacer y estadísticas sobre días realmente transcurridos.
- Fechas sin límite fijo; agenda separada por día; borrados sincronizados como registros de eliminación.
- Nutrición manual sin calorías inventadas, revisión de propuestas IA y conservación de la fecha de origen de cada solicitud.
- Pagos de deuda reversibles mediante movimientos; presupuesto orientativo basado en saldo disponible declarado.
- Tutor, lecciones, ejercicios, bitácoras, tareas, imágenes de evidencia, PDF, CSV, ICS, despensa e integraciones conservados.
- IndexedDB por cuenta; migración del formato anterior; registros independientes en Firestore y evidencias en Storage.
- Gemini detrás de Cloud Functions: autenticación, lista de UID permitidos, cuotas, formato validado y clave fuera del navegador.
- Avisos locales mientras la app está abierta; avisos con la app cerrada mediante backend + ntfy protegido, si los configuras.

## Documentación

| Archivo                                      | Para qué sirve                                                   |
| -------------------------------------------- | ---------------------------------------------------------------- |
| [docs/GIT.md](docs/GIT.md)                   | Subir a tu repo, CI y GitHub Pages                               |
| [docs/FIREBASE.md](docs/FIREBASE.md)         | Conexión existente, reglas, secretos, despliegue e integraciones |
| [docs/MIGRATION.md](docs/MIGRATION.md)       | Respaldo, recuperación y compatibilidad con tus datos            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Dónde está cada módulo y cómo se guarda la información           |
| [docs/TESTING.md](docs/TESTING.md)           | Pruebas realizadas y validaciones pendientes en tu proyecto      |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)       | Correcciones y límites conocidos                                 |

## Comandos

```bash
npm run verify        # validación estática, pruebas de lógica y compilación
npx playwright install chromium --only-shell
npm run test:e2e      # flujos de navegador sin conexión al Firebase real
npm run build        # produce dist/
npm run preview      # previsualiza dist/
```

`?local=1` omite la inicialización de Firebase para una prueba local. No es un mecanismo de seguridad ni activa la IA. Las credenciales privadas no se guardan en Git ni en respaldos exportados.

Se mantuvo Gemini para aprovechar la integración existente. El servicio de IA está aislado: otro proveedor puede añadirse detrás del mismo contrato de resultados, sin reescribir las pantallas. No es necesario pagar otro proveedor para usar esta actualización.
