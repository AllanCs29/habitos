# Migración y recuperación

## Orden recomendado

1. En la app anterior, exporta un JSON. Conserva esa copia fuera del repositorio.
2. Guarda un commit de la versión anterior y anota el dominio donde la usabas.
3. Publica las nuevas reglas/backend y prueba la actualización con tu respaldo.
4. Inicia sesión en la misma cuenta de Firebase; revisa hábitos, fechas, comidas, tutor, tareas y evidencias.
5. Exporta un nuevo respaldo con la versión 2. Actualiza tus otros dispositivos antes de seguir editando en ellos.

## De dónde se recuperan los datos

Al abrir la versión nueva por primera vez, el espacio **local/invitado** busca `allan_tcc_master_permanent_store`, después `allan_tcc_backup_mirror` y después IndexedDB `ControlTCC_PermanentVault_DB/state_vault`, registro `master_state`. Esto sólo funciona en el mismo navegador y origen (dominio, protocolo y puerto). Cambiar de dominio no traslada el almacenamiento del navegador: utiliza el JSON.

Al iniciar sesión, se usa una caché independiente para ese UID. Si aún no hay registros v2 en Firestore, se lee `stateJson` del documento `tcc_users/{uid}`, o `backupStateJson` como alternativa. El documento anterior no se sobrescribe ni elimina.

Se conserva una copia local de migración sin claves privadas. Los originales del almacenamiento anterior permanecen intactos. La recuperación está disponible en Ajustes. El espacio de invitado **no se mezcla automáticamente con una cuenta**: usa “Importar datos locales a mi cuenta” si esos datos te pertenecen.

La versión anterior no entiende `v2_records`, y la nueva no reescribe el monolito antiguo. Evita editar simultáneamente con versiones 1 y 2: son formatos distintos y no se sincronizan entre sí.

## Importar un JSON

En Ajustes, selecciona el respaldo y revisa la confirmación. Se añaden registros que faltan; cuando existe el mismo identificador, se conserva el registro actual. Las preferencias actuales tienen prioridad. Importar es una **fusión**, no un reemplazo destructivo de toda la cuenta. Puedes usar Deshacer durante la sesión. Límite de importación: 25 MiB.

Para recuperar una versión exacta en otro entorno, usa un navegador/espacio de prueba vacío, importa allí, revisa los datos y configura las preferencias deseadas. No borres tu cuenta para resolver una diferencia de importación.

## Cambios de formato importantes

- Los identificadores se normalizan como texto y se conservan cuando ya existen; se añaden IDs estables a registros antiguos que no los tenían.
- Las fechas antiguas se conservan. Agenda/inbox sin fecha adoptan la fecha seleccionada en el respaldo, porque no existe evidencia para reconstruir otra. Revisa esos registros.
- Hábitos sin fecha de creación toman su primera marca conocida o el día de migración. No se inventan días incumplidos anteriores a esa evidencia.
- Se conservan nombres, objetivos, comidas, bitácoras, finanzas, tareas, formato de reporte, fotos, historial de ejercicios, lecciones y materias.
- Calorías/macros cero permanecen cero. No se reemplazan automáticamente por estimaciones.
- Pagos ya marcados en la versión anterior no se vuelven a descontar. Cuando no hay movimiento original con su importe, la anulación se bloquea para no inventar un saldo. Puedes editar el respaldo de prueba o registrar un ajuste deliberado de saldo; exporta antes.
- Las claves privadas de Gemini, WhatsApp y ntfy no pasan al nuevo estado ni a respaldos. Vuelve a configurarlas en el servidor. La configuración web pública de Firebase sí se conserva.

## Confirmar el guardado

“En este dispositivo” confirma almacenamiento local; “Pendiente de sincronizar” significa que aún hay cambios por subir; “Sincronizado” se muestra tras confirmar el servidor. Si falla Firebase, los cambios permanecen en IndexedDB. El navegador puede eliminar datos al limpiar su almacenamiento: exporta respaldos periódicamente.

El último cambio confirmado por el servidor prevalece cuando dos dispositivos editan **el mismo registro**. Registros diferentes y borrados tienen documentos separados; no se usa la antigua regla de escoger el estado “más rico”. No es edición colaborativa en tiempo real con resolución semántica de conflictos.

Deshacer conserva hasta 15 cambios en memoria durante la sesión y se limpia al cambiar de cuenta. No sustituye un respaldo. Al salir de una cuenta, sus cambios pendientes quedan asociados a ese UID y se reintentan al volver.

## Evidencias y respaldos

Las imágenes se comprimen antes de guardar; al sincronizar se trasladan a Firebase Storage para evitar el límite del documento único de Firestore. Un registro textual individual mayor de aproximadamente 800 KB no se envía: permanece local y se muestra el error. Divide contenido excepcionalmente grande.

La exportación JSON incluye configuración pública Firebase y estado sin secretos, y convierte las imágenes de Firebase descargables en datos embebidos. Si alguna imagen no se puede descargar, la exportación falla con un mensaje en vez de afirmar que el respaldo es completo. Imágenes externas que ya estuvieran en un respaldo antiguo conservan su URL.
