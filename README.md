# Telecom Plan Studio

Editor web local y privado para documentar manualmente infraestructuras de telecomunicaciones sobre planos PDF e imágenes.

## Funciones principales

- Apertura local de PDF, PNG y JPG.
- PDF de una o varias páginas.
- Colocación manual de AP, nodos de red, CCTV, control de accesos, racks y cajas de fibra.
- Biblioteca de pictogramas técnicos en una sola columna para facilitar su identificación.
- Escala individual de cada símbolo, desde el 40 % hasta el 250 %.
- Observaciones visibles al pasar el cursor sobre cada símbolo del plano.
- Capas visibles, ocultas y bloqueables.
- Propiedades editables: identificador, tipo, rack, estado, capa, color, tamaño y observaciones.
- Dibujo manual de rutas de fibra, cobre, canalización y enlaces inalámbricos.
- Inventario automático de los símbolos colocados por el usuario.
- Guardado local del proyecto en formato `.tplan`.
- Exportación a PNG, PDF y CSV.
- Proyecto demostrativo incluido.

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
