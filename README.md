# Downscaling_SMAP_GEE
main.js: Script para efectuar el downscaling del producto SMAP utilizando datos del Sentinel-1 SAR. Escrito en JavaScript para Google Earth Engine. Casi la totalidad del código pertenece al repositorio https://github.com/tejansv7/EarthEngineProject.

extraer_puntos.py: Script para obtener los valores de los puntos de los productos SMAP 1km, SMAP 9km, GSSM_1km (SM2019Chile_diario.tif y SM2019Chile-Nirehuao_diario). Los rasters SMAP 9km y GSSM_1km se encuentran en la carpeta SIG_JV/rasters. Los SMAP 1km son de gran tamaño por lo que si se quiere hacer uso de este script, comentar las líneas asociadas al procesamiento de este raster de 1km de resolución.
