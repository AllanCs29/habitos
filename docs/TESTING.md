# Validación

## Resultado de esta entrega

Validación local de 2.0.1: **19 pruebas de lógica y 17 de navegador aprobadas**. Compilación de producción correcta, revisión estática de 320 acciones y 335 IDs, sintaxis del backend correcta y coincidencia de los 6 campos de configuración Firebase con el HTML original. El workflow de Pages se comparó con el que está actualmente en el repositorio y se conservó.

Entorno utilizado: Node.js 24.22.1 y Chromium 141 mediante Playwright 1.56.1. CI está configurado para Node.js 22; no se ejecutó un workflow remoto de GitHub durante esta entrega.

Se probó también el respaldo v1 con datos sintéticos, una respuesta IA tardía/cancelada con servicio simulado, el envío simulado de credenciales, la descarga de un PDF válido y el compilado servido bajo una subruta con apertura sin conexión. Se inspeccionó visualmente la pantalla Hoy en escritorio/móvil y los temas.

Las nuevas pruebas recorren las 9 secciones con datos largos en anchos de **320, 360, 375, 390, 430 y 844 px**, con emulación táctil. Verifican que el viewport no se ensanche, que no haya controles fuera de pantalla, que los campos móviles tengan al menos 16 px, que siga funcionando el desplazamiento vertical y que el código ancho pueda desplazarse dentro de su panel. Se inspeccionaron capturas de Hoy y Entrenar después de ajustar sus controles.

Las pruebas de sincronización simulan el permiso denegado de `v2_records` con el documento anterior accesible, la posterior habilitación de permisos y reintento, recuperación con registros v2 existentes, respeto a borrados y ediciones, bloqueo de escrituras cuando falla la lectura inicial, reenvío de pendientes al volver a entrar y cambio de cuenta durante una lectura. El documento original no recibe escrituras. Las pruebas unitarias cubren JSON corrupto, prioridad del estado actual sobre su respaldo y recuperación sin revivir borrados.

No se ejecutó Safari/iOS real. La instalación de WebKit en este entorno no pudo completar sus dependencias del sistema, por lo que los resultados anteriores corresponden a Chromium; los gestos del sistema y el zoom automático de iOS requieren validación en el teléfono. No se han confirmado ni modificado los datos privados de la cuenta real.

La compilación avisa de un bundle inicial grande (~1,2 MB sin comprimir; ~342 KB gzip). No impide el funcionamiento. El PDF se carga por separado; dividir el tutor y el SDK Firebase en más fragmentos queda como optimización posterior.

## Pruebas reproducibles

```bash
npm ci
npm ci --prefix functions
npm run verify
npx playwright install chromium --only-shell
npm run test:e2e
npm run check --prefix functions
```

Las pruebas usan datos sintéticos y el modo local. No crean usuarios reales, no escriben en tu Firebase ni consumen tu cuota Gemini.

`tests/domain.test.js` cubre migración e información conservada, secretos y prototipos, pagos reversibles y heredados, calendario, rachas, frecuencia, objetivos, presupuesto con saldo real, borrados entre estados, horario y esquema IA.

`tests/browser/app.spec.js` recorre pantallas, tamaños móvil/escritorio, temas, hábitos, contador, deshacer, recarga, escape de HTML, comida cero y fecha de confirmación, UUID de deuda/agenda, exportación sin secretos, ejercicio y despensa.

`tests/recovery.test.js`, `tests/browser/sync.spec.js` y `tests/browser/mobile.spec.js` cubren las regresiones corregidas en 2.0.1.

`npm run check` verifica sintaxis, acciones referenciadas, IDs duplicados y manejadores de las vistas. `npm run build` valida el empaquetado de producción.

## Lo que requiere tu entorno

Antes de reemplazar la versión de uso diario, valida con tu cuenta:

1. Inicio/cierre de sesión y recuperación de contraseña.
2. Migración de tu documento real; comparar conteos y algunas imágenes/lecciones con tu respaldo.
3. Sincronizar un cambio y un borrado entre dos navegadores; repetir sin conexión y reconectar.
4. Iniciar sesión con otra cuenta y confirmar que no ve los datos de la primera.
5. Comida, rutina, tutor, agenda y conexión con Gemini real; comprobar límites/errores.
6. Subir y descargar una evidencia a Storage, exportar e importar el respaldo.
7. PDF con tus evidencias y paginación real, y abrir CSV/ICS en las aplicaciones que usas.
8. Instalar la PWA, abrirla sin red tras una primera carga completa y probar la actualización del service worker.
9. ntfy con pantalla bloqueada, app cerrada, zona horaria del teléfono y cancelación de recordatorios.
10. Lectura/envío de prueba de WhatsApp a un destinatario que autorices.

No se dispuso de tus credenciales privadas ni se desplegaron reglas/funciones. Las reglas incluidas y las integraciones remotas necesitan pruebas en tu proyecto o Emulator Suite; la validación local no certifica su funcionamiento de extremo a extremo.
