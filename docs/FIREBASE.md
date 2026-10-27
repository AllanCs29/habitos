# Firebase, Gemini e integraciones

## Configuración conservada

`src/firebase-config.js` conserva exactamente la configuración web del original: API key pública, `authDomain`, `projectId: control-tcc`, `storageBucket`, `messagingSenderId` y `appId`. `.firebaserc` apunta al mismo proyecto. No hace falta crear otro Firebase.

El navegador puede conservar un override anterior en `allan_tcc_firebase_config`. Puedes revisar la configuración efectiva en **Ajustes → Firebase**. Antes de desplegar, comprueba que tu CLI está en la cuenta y el proyecto correctos. Este paquete no ha desplegado ni modificado tu proyecto remoto.

## Preparar servicios

1. En Firebase Console, comprueba **Authentication → Sign-in method → Email/Password** y conserva tus usuarios existentes.
2. En Auth, añade el dominio donde publicarás la app (y `localhost` si lo necesitas para desarrollo).
3. Conserva tu base Firestore existente. Crea/activa Storage en el bucket indicado por la configuración.
4. Cloud Functions, Scheduler, Secret Manager y el uso de Storage pueden requerir facturación/plan Blaze. Revisa tu configuración, cuotas y alertas de gasto antes de desplegar. No se presupone que sean gratuitos.
5. Instala Firebase CLI según su documentación y autentícate con tu cuenta administradora:

```bash
npm install -g firebase-tools
firebase login
firebase use control-tcc
npm ci
npm ci --prefix functions
npm run verify
```

Si tu proyecto ya tiene otras reglas, índices, funciones o configuración de hosting, **integra** los archivos de este paquete con los actuales. Un despliegue de reglas reemplaza las reglas publicadas. El codebase `control-tcc-studio` evita mezclar accidentalmente el código con otras funciones, pero revisa siempre el resumen del CLI.

## Autorizar tu cuenta y Gemini

1. Inicia sesión en la aplicación. En Ajustes, usa **Copiar UID**. Es tu identificador de Firebase Auth, no tu email.
2. Copia `functions/.env.control-tcc.example` como `functions/.env.control-tcc` y sustituye el ejemplo por tu UID. Para varias cuentas, sepáralas por comas:

```dotenv
AI_ALLOWED_UIDS=UID_1,UID_2
```

3. Configura la clave privada de Gemini en Secret Manager. El CLI la pedirá de forma interactiva:

```bash
firebase functions:secrets:set GEMINI_API_KEY --project control-tcc
```

4. Despliega después de revisar los archivos del proyecto:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project control-tcc
firebase deploy --only functions:control-tcc-studio --project control-tcc
```

5. En **Ajustes → Inteligencia artificial**, elige un modelo admitido, guarda y prueba la conexión. El selector admite Gemini 3.8 Flash, 3.5 Flash-Lite y 4 Argon. La disponibilidad y el coste dependen del proveedor y tu cuenta; consulta su catálogo.

Las funciones se despliegan en `us-central1`. Si cambias la región, actualiza tanto `functions/index.js` como `functionsRegion` en `src/firebase-config.js`.

Nunca uses `VITE_GEMINI_API_KEY`: todo valor `VITE_*` usado por el frontend se publica en el bundle. La clave privada va exclusivamente a Secret Manager. El UID permitido vacío bloquea IA e integraciones por defecto. El backend limita a 60 solicitudes por UID y día UTC y al menos 1,5 segundos entre solicitudes. Una petición fallida también consume una solicitud del límite interno.

Los resultados se validan por tarea en `functions/schemas.js`. El modelo seleccionado se utiliza directamente; no se cambia silenciosamente a otro modelo. Cancelar en la interfaz descarta la respuesta, pero una petición que ya llegó al proveedor puede generar consumo.

## Reglas y datos

- `tcc_users/{uid}`: documento antiguo, conservado; sólo el propietario autenticado puede leer/escribir.
- `tcc_users/{uid}/v2_records/{id}`: un documento por registro lógico y marcas de borrado.
- `users/{uid}/evidence/{hash}`: evidencias en Storage, sólo imágenes y máximo 10 MiB por archivo bajo las reglas incluidas.
- `tcc_private/{uid}`: credenciales de integraciones; acceso de clientes denegado. Sólo Admin SDK del backend.
- `tcc_private/{uid}/usage/{día}` y `/reminders/{id}`: cuota y cola de avisos.

No se hizo borrado remoto ni limpieza automática de archivos. Si eliminas una evidencia, el objeto antiguo de Storage se conserva para que respaldos/deshacer sigan siendo recuperables. Decide una política de retención después de validar tu migración.

Las URL de descarga de Firebase Storage contienen un token de acceso: no publiques respaldos ni reportes con información privada. La exportación JSON descarga las evidencias de Firebase e incorpora sus bytes para producir un respaldo portable; requiere acceso a esas imágenes.

## Avisos con la app cerrada

Se usa ntfy como canal de entrega y Firebase Scheduler como programador, no un temporizador del navegador.

1. Configura una cuenta/canal **protegido con acceso reservado** en ntfy. Un nombre difícil de adivinar no sustituye permisos. La posibilidad de reservar el canal depende de tu plan de ntfy.
2. En Ajustes, escribe el canal y su token de publicación; **Guardar configuración** los envía al backend. Instala/configura ntfy en el teléfono y suscríbete con permisos de lectura.
3. Pulsa la prueba y comprueba que el teléfono la recibe. Después activa/sincroniza recordatorios.
4. Las modificaciones vuelven a programar la cola si está activada. Desactivar elimina los recordatorios del servidor.

El servicio consulta cada minuto y usa la zona horaria que envía el dispositivo. La entrega no es exacta al segundo ni garantizada: depende de permisos, red, Scheduler, ntfy y sistema operativo. Los avisos contienen un texto genérico; la información de la actividad se consulta dentro de la app. El aviso diario es un recordatorio fijo, no una comprobación inteligente de que sigas teniendo hábitos pendientes. Tras cinco fallos de entrega, el recordatorio queda fallido; corrige la integración y vuelve a sincronizarlo. Se admiten hasta 100 recordatorios por sustitución.

## WhatsApp

Trabajo conserva importación de `.txt`, texto pegado, captura y la integración opcional con Green-API/CallMeBot. Las claves se guardan a través de `configureIntegration` en `tcc_private/{uid}`. Las claves antiguas no se trasladan automáticamente: vuelve a introducirlas una vez. La lectura de mensajes no los envía automáticamente a Gemini: revisa el texto y solicita su análisis. Los envíos muestran destinatario y contenido antes de confirmar. “Aceptado” no significa que el destinatario ya lo recibió.

## Hosting opcional de Firebase

```bash
npm run build
firebase deploy --only hosting --project control-tcc
```

El hosting sólo publica `dist/`. HTTPS permite instalar la PWA. No hagas `firebase deploy` sin `--only` si compartes el proyecto con otros servicios.

## Diagnóstico

| Síntoma                          | Comprobación                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Permission denied al sincronizar | Sesión, UID propietario, reglas `v2_records` y bucket correctos                 |
| IA no disponible / not found     | Función `aiGenerate`, región y despliegue                                       |
| UID no autorizado                | `AI_ALLOWED_UIDS` en `.env.control-tcc` y nuevo despliegue                      |
| HTTP del proveedor               | Clave Gemini, cuota, modelo y acceso de tu proyecto                             |
| Evidencias pendientes            | Storage activo, reglas, red y tamaño de imagen                                  |
| Avisos no llegan                 | ntfy protegido, token, suscripción, permisos del teléfono e índice de Scheduler |

## Documentación oficial

- [Firebase web configuration](https://firebase.google.com/docs/web/setup)
- [Funciones callable](https://firebase.google.com/docs/functions/callable)
- [Variables y secretos](https://firebase.google.com/docs/functions/config-env)
- [Funciones programadas](https://firebase.google.com/docs/functions/schedule-functions)
- [Modelos de Gemini](https://ai.google.dev/gemini-api/docs/models)
- [Resultados estructurados](https://ai.google.dev/gemini-api/docs/structured-output)
- [Autenticación y control de acceso de ntfy](https://docs.ntfy.sh/config/#access-control)
