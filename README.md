<p align="center">
  <a href="https://riosgalvan.github.io/infraplan-studio/">
    <img src="./infraplan-logo.svg" alt="InfraPlan Studio" width="720">
  </a>
</p>

<p align="center"><strong>Planifica · Conecta · Documenta</strong><br><sub>Versión 1.4.0</sub></p>

<p align="center">
  <a href="https://riosgalvan.github.io/infraplan-studio/"><strong>Abrir InfraPlan Studio →</strong></a>
</p>

InfraPlan Studio es un editor web local y privado para planificar y documentar manualmente infraestructuras técnicas sobre planos PDF e imágenes.

## Funciones principales

- Apertura local de PDF, PNG y JPG.
- PDF de una o varias páginas.
- Incorporación de nuevas plantas mediante PDF/imagen o lienzos en blanco dentro del mismo proyecto.
- Colocación manual de AP, nodos de red, CCTV, control de accesos, racks y cajas de fibra.
- Cámaras CCTV con cono de visión visible, ángulo de apertura editable y orientación directa mediante el ratón.
- Pestaña independiente de electrónica para MDF, IDF y racks, con nomenclatura, fabricante, modelo, cantidad, posición, estado y observaciones de cada dispositivo.
- Biblioteca de pictogramas organizada en categorías plegables para mantener visibles las capas.
- Habitaciones con nombre editable y dimensiones consultables desde Propiedades sin recargar el plano.
- Barra de herramientas agrupada por dibujo, trazados, proyecto, edición, vista y exportación.
- Interfaz adaptada a iPad en horizontal y vertical, con lienzo prioritario, paneles laterales deslizables y controles táctiles.
- Herramienta **Mover** para desplazarse por planos grandes con el ratón o con un dedo, sin depender del teclado.
- Modo **Pantalla completa** para ampliar el área de trabajo y reducir las distracciones del navegador.
- Barra táctil específica para iPad, separando las herramientas de dibujo de las acciones de proyecto, vista y exportación.
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
- Muros multipunto: dibuja recorridos por vértices y edita después el trazado completo, cada vértice o sus puntos intermedios.
- Navegación rápida por planos grandes manteniendo Espacio mientras arrastras.
- Inventario automático de los símbolos colocados por el usuario.
- Guardado local del proyecto en formato `.tplan`.
- Exportación a PNG, PDF y CSV. El CSV separa los elementos del plano y cada dispositivo de electrónica de MDF, IDF y racks en filas filtrables.
- Proyecto demostrativo completo y ficticio de tres planos: zonas comunes y restauración, habitaciones y pasillos, y exteriores con piscinas y jardines.
- Demostración con AP, CCTV, control de accesos, nodos, MDF/IDF, fibra, cobre, canalizaciones y observaciones técnicas.

## Privacidad

Los planos y los datos se procesan exclusivamente en el navegador. La aplicación no contiene base de datos, cuentas ni endpoints de subida. Para continuar un trabajo, el usuario descarga un archivo `.tplan` y lo abre posteriormente desde su propio dispositivo.

La versión publicada utiliza Cloudflare Web Analytics para obtener métricas anónimas de visitas y rendimiento. Esta medición no usa cookies, no accede al contenido de los planos y no se activa durante el desarrollo local.

## Principios

- La aplicación no detecta paredes, habitaciones ni elementos del plano.
- No propone posiciones ni rutas.
- No coloca ni asigna equipos automáticamente.
- El usuario mantiene el control de todas las decisiones de diseño.
- Los conteos y exportaciones documentan únicamente lo que el usuario ha dibujado.

## Uso

La herramienta está publicada en GitHub Pages y puede utilizarse directamente desde el navegador:

**[Abrir InfraPlan Studio](https://riosgalvan.github.io/infraplan-studio/)**

Consulta el historial completo en [CHANGELOG.md](./CHANGELOG.md).

Para desarrollo local es necesario servir la carpeta mediante HTTP porque PDF.js utiliza módulos y un Web Worker.

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
- Cloudflare Web Analytics, para métricas anónimas de uso en la versión publicada.

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
