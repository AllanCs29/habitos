# Cambios · 2.0.0

## Presentación y navegación

Pantalla Hoy, jerarquía de información, barra lateral, navegación móvil, temas, formularios con etiquetas, estados de guardado, confirmación de cambios y deshacer. Se permite ampliar con el zoom del navegador. Se respeta la preferencia de movimiento reducido.

## Correcciones de lógica

- Calendario dinámico y rachas sin fecha final fija ni penalización de días futuros.
- “Limpiar esta semana” afecta sólo la semana seleccionada.
- Los pagos de deuda se registran y revierten sin descontar varias veces el mismo movimiento.
- Las comidas con cero calorías permanecen en cero; no se inventan macros al escribir cualquier texto.
- Las solicitudes de comida/agenda conservan la fecha de origen aunque cambie el calendario durante la espera.
- La generación de rutina conserva sesiones anteriores y ejercicios ya completados.
- Las tareas conservan su identificador mientras se edita su reporte.
- Los IDs de registros importados y UUID funcionan también en botones de finanzas y agenda.
- Los temporizadores calculan tiempo transcurrido, en vez de depender de que cada intervalo se ejecute exactamente a tiempo.
- Se rechazan bloques con horas inválidas o traslapes al agregarlos manualmente o aceptar una agenda IA.

## Datos, IA y privacidad

Módulos independientes, caché por usuario, migración conservadora, borrados explícitos, evidencias fuera del documento central, secretos en servidor, llamadas autenticadas, lista de UIDs permitidos, cuotas, validación por esquema y modelos de generación apropiados. El proveedor elegido no cambia silenciosamente. Se sustituyeron mensajes que afirmaban precisión nutricional, ejecución real de código o notificaciones garantizadas.

## Funciones conservadas

Hábitos y bitácora de impulsos; alimentación/fotos/chef/macros/agua; gimnasio/descansos/historial/ICS; tutor con materias, lecciones, flashcards, retos, cuestionario y ejemplo de código; tareas, agenda, bandeja, reportes/evidencias/PDF/CSV; ingresos/gastos/deudas; despensa/menú; importación/exportación; Auth y conexión Firebase; WhatsApp y avisos opcionales.

## Próximas mejoras razonables

- Separar el tutor grande en componentes y eliminar gradualmente manejadores HTML en línea.
- Añadir editor de ajustes de saldo y gastos pagados por periodo, con historial financiero completo.
- Mejorar resolución visible de conflictos del mismo registro y retención de evidencias.
- Agregar pruebas con Firebase Emulator Suite y pruebas reales de integración antes de una apertura a muchos usuarios.
- Añadir App Check cuando estén configurados sus proveedores en tu proyecto; ahora el control de coste depende de Auth, UID permitido y cuota.
- Si se convierte en producto para terceros: política de privacidad, exportación/borrado completo de cuenta, observabilidad y límites globales de gasto.

No se promete que toda recomendación de IA sea correcta, que las notificaciones sean exactas al segundo ni que el proyecto remoto ya esté configurado. Esos puntos están detallados en `FIREBASE.md` y `TESTING.md`.
