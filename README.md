# Telecom Plan Studio

Editor web local y privado para documentar manualmente infraestructuras de telecomunicaciones sobre planos PDF e imágenes.

## Funciones principales

- Apertura local de PDF, PNG y JPG.
- PDF de una o varias páginas.
- Colocación manual de AP, nodos de red, CCTV, control de accesos, racks y cajas de fibra.
- Biblioteca de pictogramas técnicos en una sola columna para facilitar su identificación.
- Categorías de símbolos adaptadas al ancho del panel, sin desplazamiento horizontal.
- Escala individual de símbolos y observaciones, y grosor ajustable de las rutas.
- Observaciones visibles al pasar el cursor sobre cada símbolo del plano.
- Selección directa de cualquier elemento sin tener que activar antes la herramienta Seleccionar.
- Rutas anclables a AP, racks, cámaras o nodos en sus puntos iniciales, intermedios y finales.
- Etiqueta visible sobre cada trazado para diferenciar fibra, cobre, canalización y enlace inalámbrico.
- Capas visibles, ocultables y aislables para trabajar por especialidad.
- Aislamiento de capas: una pulsación muestra únicamente la capa elegida y permite restaurar todas las visibles.
- Propiedades editables: identificador, tipo, rack, estado, capa, color, tamaño y observaciones.
- Dibujo manual de rutas de fibra, cobre, canalización y enlaces inalámbricos, con finalización y guardado explícitos.
- Edición visual de rutas: mueve el trazado completo o arrastra sus vértices y puntos intermedios.
- Navegación rápida por planos grandes manteniendo Espacio mientras arrastras.
- Inventario automático de los símbolos colocados por el usuario.
- Guardado local del proyecto en formato `.tplan`.
- Exportación a PNG, PDF y CSV.
- Proyecto demostrativo completo y ficticio de tres planos: zonas comunes y restauración, habitaciones y pasillos, y exteriores con piscinas y jardines.
- Demostración con AP, CCTV, control de accesos, nodos, MDF/IDF, fibra, cobre, canalizaciones y observaciones técnicas.

## Privacidad

Los planos y los datos se procesan en el navegador. La aplicación no contiene base de datos, cuentas, analítica ni endpoints de subida. Para continuar un trabajo, el usuario descarga un archivo `.tplan` y lo abre posteriormente desde su propio dispositivo.

## Principios

- La aplicación no detecta paredes, habitaciones ni elementos del plano.
- No propone posiciones ni rutas.
- No coloca ni asigna equipos automáticamente.
- El usuario mantiene el control de todas las decisiones de diseño.
- Los conteos y exportaciones documentan únicamente lo que el usuario ha dibujado.

## Uso

Publicada mediante GitHub Pages, puede abrirse directamente en el navegador. Para desarrollo local es necesario servir la carpeta mediante HTTP porque PDF.js utiliza módulos y un Web Worker.

Ejemplo:

```bash
python3 -m http.server 4173
```

Después, abre `http://127.0.0.1:4173/`.

## Tecnologías incluidas

- PDF.js, para representar PDF localmente.
- JSZip, para guardar y abrir proyectos `.tplan`.
- pdf-lib, para generar el PDF anotado en el navegador.
- SVG y Canvas nativos para el editor.

Las licencias de las dependencias se conservan en `vendor/`.

## Limitaciones actuales

- No admite DWG ni conexión con AutoCAD.
- No incluye mapas de calor ni simulación RF.
- No incluye colaboración simultánea ni almacenamiento en la nube.
- La exportación PDF de esta primera versión rasteriza cada plano anotado.

## Hoja de ruta

Una segunda versión podrá incorporar mapas de calor basados únicamente en parámetros y posiciones introducidos manualmente, sin colocación automática de AP.

## Licencia

MIT. Consulta `LICENSE` y las licencias de terceros en `vendor/`.
