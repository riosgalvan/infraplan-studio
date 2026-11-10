# Historial de versiones

Todos los cambios relevantes de InfraPlan Studio se documentan en este archivo.

## [1.1.0] - 2026-11-10

### Añadido

- Creación de nuevas plantas en blanco dentro de un proyecto existente.
- Pestaña independiente **Electrónica** para MDF, IDF y racks.
- Registro detallado por dispositivo: nomenclatura, tipo, fabricante, modelo, cantidad, posición, estado y observaciones.
- Control visual para orientar cámaras CCTV directamente con el ratón.
- Número de versión visible dentro de la aplicación.

### Mejorado

- Barra superior reorganizada por grupos funcionales para evitar solapamientos y facilitar la identificación de herramientas.
- Biblioteca de símbolos convertida en categorías plegables: WiFi, Red, CCTV y Racks.
- Las categorías aparecen contraídas al iniciar para dar acceso inmediato al apartado de Capas.
- Habitaciones con nombre o identificador editable, por ejemplo `Hab. 202`.
- Medidas y superficie de las habitaciones trasladadas al panel de Propiedades.
- Compatibilidad automática con la electrónica guardada por versiones anteriores.
- Proyecto demostrativo ampliado con ejemplos de electrónica en MDF, IDF y racks.

### Cambiado

- Las dimensiones dejan de mostrarse dentro de las habitaciones para reducir el ruido visual del plano.
- El inventario básico de electrónica deja de aparecer comprimido dentro de Propiedades.

## [1.0.0] - 2026-11-10

### Versión inicial

- Editor local y manual de infraestructuras técnicas sobre PDF e imágenes.
- Creación de planos vacíos con cuadrícula métrica.
- Símbolos de WiFi, red, CCTV, control de accesos, MDF, IDF y racks.
- Rutas de fibra, cobre, canalización y enlaces inalámbricos.
- Muros multipunto y edición mediante vértices.
- Capas, propiedades, inventario y demostración ficticia de un hotel.
- Guardado `.tplan` y exportación a PNG, PDF y CSV.
- Analítica anónima de visitas mediante Cloudflare Web Analytics.
