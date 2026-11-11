# Historial de versiones

Todos los cambios relevantes de InfraPlan Studio se documentan en este archivo.

## [1.3.0] - 2026-11-10

### Añadido

- Selector táctil **Dibujo / Acciones** siempre visible en iPad.
- Vista **Dibujo** con acceso directo a Seleccionar, Mover, Habitación, Muro, Puerta, Nota y Ruta.
- Vista **Acciones** con proyecto, edición, zoom, pantalla completa y exportaciones.

### Mejorado

- Barra superior más baja, legible y estable en iPad horizontal y vertical.
- Controles táctiles de mayor tamaño y herramienta activa más fácil de identificar.
- Eliminado el desplazamiento horizontal permanente de la barra en las resoluciones habituales de iPad.

## [1.2.0] - 2026-11-10

### Añadido

- Modo **Mover** para desplazarse por el plano con el ratón o con un dedo sin utilizar la barra espaciadora.
- Controles de **Proyecto** y **Detalle** para abrir los paneles laterales como cajones deslizables en iPad.
- Modo **Pantalla completa** con respaldo de vista ampliada para navegadores que no permiten ocultar su interfaz.

### Mejorado

- Diseño específico para iPad en orientación horizontal y vertical, manteniendo el lienzo como área principal de trabajo.
- Barra superior desplazable horizontalmente para evitar herramientas cortadas o solapadas.
- Controles, formularios y campos adaptados a interacción táctil y al comportamiento de Safari en iPadOS.
- Estado inferior del lienzo simplificado en pantallas de tamaño tablet.

### Corregido

- La exportación CSV incluye todos los dispositivos de MDF, IDF y racks en filas independientes con sus datos completos.
- Cada equipo se exporta con nomenclatura, tipo, fabricante, modelo, cantidad, posición, estado y observaciones.
- Los estados se exportan con nombres legibles y las coordenadas inexistentes permanecen vacías en lugar de convertirse en cero.
- Se conserva una fila general por elemento y un resumen de la electrónica de cada armario.
- Los paneles laterales dejan de comprimir el plano en resoluciones de 768 a 1100 píxeles.

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
