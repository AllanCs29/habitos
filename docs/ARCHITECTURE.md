# Arquitectura

## Mapa del código

| Ruta                            | Responsabilidad                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `index.html`                    | Documento de entrada, metadatos y carga del módulo                                      |
| `src/main.js`                   | Montaje, arranque, eventos y service worker                                             |
| `src/views/`                    | HTML de cada pantalla y diálogos                                                        |
| `src/styles/app.css`            | Tema, layout responsive, componentes y accesibilidad                                    |
| `src/styles/animations.css`     | Animaciones conservadas del original                                                    |
| `src/features/`                 | Funciones por dominio: hábitos, nutrición, trabajo, tutor, finanzas, gimnasio, despensa |
| `src/core/domain.js`            | Lógica pura: fechas, rachas, pagos, migración y registros                               |
| `src/core/exports.js` | Exportación ICS con fechas/escape y CSV con protección frente a fórmulas |
| `src/core/context.js`           | Estado de ejecución y registro de acciones compartidas                                  |
| `src/core/initialize.js`        | Inicialización de variables de interfaz                                                 |
| `src/services/storage.js`       | Auth, cachés por cuenta, migración, backup y sincronización                             |
| `src/services/ai.js`            | Cliente de IA, cancelación y diálogo de revisión                                        |
| `src/services/integrations.js`  | Cliente de WhatsApp, recordatorios y PWA                                                |
| `src/services/accessibility.js` | Nombres accesibles, foco y teclado en diálogos                                          |
| `src/firebase-config.js`        | Configuración pública Firebase original y región                                        |
| `functions/index.js`            | Backend autenticado, cuota, secretos e integraciones                                    |
| `functions/schemas.js`          | Contratos de salida IA compartidos con el frontend                                      |
| `public/`                       | Iconos, manifiesto y archivos estáticos                                                 |
| `tests/`                        | Regresiones de dominio y flujos de navegador                                            |

## Decisiones de implementación

Se usa JavaScript modular con Vite y Tailwind compilado localmente. No se añadió un framework de interfaz para conservar las funciones existentes y reducir la migración. HTML, estilos, lógica y backend están separados. Los manejadores `onclick/onchange` existentes se mantienen mediante un puente de acciones en `window`; la implementación vive en módulos. Retirar ese puente y convertir cada vista a componentes/event delegation es una mejora futura, no un requisito para utilizar esta versión.

La API de Firebase compat se conserva para reducir cambios de integración. Los reportes PDF se importan bajo demanda. Los iconos de Flaticon del original continúan usando su CDN: sin conexión pueden faltar iconos secundarios; las acciones tienen nombres accesibles y la navegación principal usa SVG local. La compilación genera un service worker propio que guarda archivos de la aplicación, no respuestas de IA ni datos privados de APIs.

## Guardado y sincronización

Cada mutación pasa por `saveState`, se normaliza, calcula diferencias y escribe en IndexedDB. En una cuenta autenticada se acumulan operaciones pendientes con ID único. Las diferencias se suben en lotes de hasta 100 registros, con timestamp del servidor. El estado del servidor se combina con operaciones locales aún pendientes.

Las eliminaciones tienen un documento con `deleted: true`. Cambiar sólo el orden visual de una lista no reescribe entidades sin cambios, para no revivir registros eliminados por otro dispositivo. Los arrays pequeños que forman parte de una misma entidad (p. ej., opciones de una lección) se guardan juntos. No hay un documento único que contenga toda la cuenta.

Cambiar de cuenta incrementa una generación de sesión, cancela resultados de IA pendientes y cambia la caché. Una respuesta que pertenece a la sesión anterior no puede aplicarse a la nueva.

## Flujo de IA

La vista construye una solicitud específica → `aiGenerate` verifica sesión/UID/cuota → llama al modelo elegido con esquema JSON → valida la salida → el cliente vuelve a validarla → las propuestas de comida, metas, rutina, agenda y despensa se revisan antes de aplicar. Lecciones y texto de orientación se presentan como contenido generado y pueden deshacerse.

El estado manual, los cálculos de rachas, pagos, fechas y persistencia no dependen de IA. Los mensajes importados y las respuestas del proveedor son datos no confiables: se escapan al renderizar y los fragmentos HTML históricos se sanitizan.

## Añadir otro proveedor

Implementa un adaptador en el backend con las mismas tareas y esquemas de `functions/schemas.js`. Mantén Auth, cuota, límites y validación. Usa una prueba con solicitudes representativas y compara corrección, latencia y coste antes de cambiar el proveedor predeterminado. Nunca pongas su clave en el frontend. Este paquete incluye Gemini; no simula una integración con otros proveedores.

## Límites actuales

La sincronización resuelve conflictos sobre una misma entidad por última escritura de servidor; no ofrece CRDT. No hay cifrado extremo a extremo ni multiusuario compartiendo la misma cuenta. La IA, Firebase desplegado y las notificaciones deben verificarse con tus credenciales. El tutor muestra salidas de código ilustrativas: no ejecuta código arbitrario. La imagen de ejercicio es una referencia genérica, no análisis biomecánico. Los importes financieros y nutricionales son estimaciones/entradas del usuario, no una verificación profesional.
