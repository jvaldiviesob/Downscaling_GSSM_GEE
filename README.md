# Downscaling_SMAP_GEE

main.js: Script para obtener un raster con valores diarios de humedad de suelo (bandas) para el año 2019 utilizando datos de entrenamientos provenientes de muestras de varios lugares del mundo, entrenando con estos un proceso de Random Forest. Para obtener la humedad de suelo se utiliza la regresión obtenida del Random Forest y predictores importados desde distintas colecciones de imágenes. El script se encuentra desarrollado en JavaScript para Google Earth Engine. Casi la totalidad del código pertenece al repositorio https://github.com/QianqianHan96/GSSM1km.

La variable "table" corresponde al asset Rectangulo_Chile (.shp) que acota el downscaling y debe ser cargada en GEE. 
Link: https://cirencl-my.sharepoint.com/:u:/g/personal/ccalvo_ciren_cl/ERfCBnlNpttNqCyzAuX8YEkB_lSetiTLgpP_EWOsiAnNzg?e=Cvyd9d

La variable "image" corresponde al asset LST_2019_Day_EEUU_Chile (.tif) y debe ser cargado en GEE. 
Link:

La variable "image2" corresponde al asset LST_2019_Night_EEUU_Chile (.tif) y debe ser cargado en GEE. 
Link:

# Gráfico de resultados

extraer_puntos.py: Script para obtener los valores de los puntos de los productos SMAP 1km, SMAP 9km, GSSM_1km (SM2019Chile_diario.tif y SM2019Chile-Nirehuao_diario) y de las estaciones del Lab-NET. Los rasters SMAP 9km y GSSM_1km se encuentran en la carpeta SIG_JV/rasters. Los rasters SMAP 1km requieren de gran almacenamiento, por lo que si se quiere hacer uso de este script, comentar las líneas asociadas al procesamiento de estos rasters de 1km de resolución.
