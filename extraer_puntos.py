#### Script elaborado por Jonas Valdivieso para CIREN ####
#### Última actualización 18-01-2024 ####
#### Permite leer valores de humedad en % del producto SMAP 1km, GSSM 1km y de las estaciones LAB-net ####



#### Importar modulos

import rioxarray
import geopandas as gpd
import pandas as pd
import os
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime



#### Definir carpetas

carpeta_GSSM = "G:/JV/OneDrive - ciren.cl/Corfo_BBPP/SIG/raster/GSSM1km/" ## Rellenar
carpeta_SMAP_9km = "G:/JV/OneDrive - ciren.cl/Corfo_BBPP/SIG/raster/SMAP_9km/" ## Rellenar
carpeta_SMAP_1km = "F:/SMAP/" ## Rellenar
carpeta_SMAP_1km_clipeados = "F:/SMAP_1km/SMAP_1km_clip_san_pedro_chamonate/" ## Rellenar ## No se utiliza

##SMAP_1km_clip_la_ligua
##SMAP_1km_san_pedro_chamonate
##SMAP_1km_oromo
##SMAP_1km_nirehuao

carpeta_puntos = "G:/JV/OneDrive - ciren.cl/Corfo_BBPP/SIG/shp/Puntos/" ## Rellenar
carpeta_shape_clip = "G:/JV/OneDrive - ciren.cl/Corfo_BBPP/SIG/shp/Otros/" ## Rellenar
carpeta_imagenes = "G:/JV/OneDrive - ciren.cl/Corfo_BBPP/SIG/img/" ## Rellenar
carpeta_datos_estaciones= "G:/JV/OneDrive - ciren.cl/Corfo_BBPP/data/LAB-NET/HumedadSuelo/" ## Rellenar

#archivos_GSSM=rioxarray.open_rasterio(carpeta_GSSM+'SM2019Chile-Nirehuao_diario.tif')
archivos_GSSM=rioxarray.open_rasterio(carpeta_GSSM+'SM2019Chile_diario.tif') ## Rellenar
archivos_SMAP_9km_am=rioxarray.open_rasterio(carpeta_SMAP_9km+'SMAP_9km_am.tif')
archivos_SMAP_9km_pm=rioxarray.open_rasterio(carpeta_SMAP_9km+'SMAP_9km_pm.tif')




####  Obtener la lista de archivos rasters en la carpeta de rasters #####

archivos_raster = os.listdir(carpeta_SMAP_1km)

caracter_a_eliminar = '.tif.xml'

archivos_raster = list(filter(lambda x: caracter_a_eliminar not in x, archivos_raster))



#### Definir nueva proyección y adquirir proyeccion de los raster ####

nueva_proyeccion = 'EPSG:4326'

proyeccion_raster = rioxarray.open_rasterio(carpeta_SMAP_1km+archivos_raster[1]).rio.crs



#### Carga o crea un GeoDataFrame con los puntos y el shape de clipeo y extrae las coordenadas ####

n_punto="15" ## Rellenar

##1 ##2 ##3
##4 ##5 ##6
##7 ##8 ##9
##10 ##11 ##12
##13 ##14 ##15

nombre_archivo_puntos="puntos_"+n_punto+"_SM_6933.shp"
nombre_archivo_puntos_2="puntos_"+n_punto+"_SM.shp"

nombre_archivo_clip="Rectangulo_nirehuao_6933.shp" ## Rellenar

## Rectangulo_la_ligua_6933.shp
## Rectangulo_nirehuao_6933.shp
## Rectangulo_oromo_6933.shp
## Rectangulo_san_pedro_chamonate_6933.shp

puntos = gpd.read_file(carpeta_puntos+nombre_archivo_puntos)
puntos2 = gpd.read_file(carpeta_puntos+nombre_archivo_puntos_2)

geometria_clip = gpd.read_file(carpeta_shape_clip+nombre_archivo_clip) ##Shape en crs 6933

xx=puntos.iloc[0].geometry.x

yy=puntos.iloc[0].geometry.y

xx2=puntos2.iloc[0].geometry.x

yy2=puntos2.iloc[0].geometry.y

#### Extraer datos y fechas de los csv ####

df_san_pedro=pd.read_csv(carpeta_datos_estaciones+'san_pedro.csv')
df_chamonate=pd.read_csv(carpeta_datos_estaciones+'chamonate.csv')
df_oromo_1=pd.read_csv(carpeta_datos_estaciones+'oromo_1.csv') #"E. Oromo C616"
df_oromo_2=pd.read_csv(carpeta_datos_estaciones+'oromo_2.csv') #"E. Oromo C655"
df_nirehuao=pd.read_csv(carpeta_datos_estaciones+'nirehuao.csv')

df=df_oromo_2 ## Rellenar
label_df="E. Oromo CS616" ## Rellenar

## "E. San Pedro"
## "E. Chamonate"
## "E. Oromo CS650"
## "E. Oromo CS616"
## "E. Nirehuao"


#### Clipear y exportar rasters SMAP 1km ####

# for i in range(0, len(archivos_raster)):
#     try:
#         print('Clipeo archivos raster: '+str(round((i+1)/len(archivos_raster)*100,2))+'%')
#         print(carpeta_SMAP_1km+archivos_raster[i])
#         raster = rioxarray.open_rasterio(carpeta_SMAP_1km+archivos_raster[i])
#         raster_recortado = raster.rio.clip(geometria_clip.geometry)
#         raster_recortado.rio.to_raster(carpeta_SMAP_1km_clipeados+archivos_raster[i])
#         raster.close()
#         raster_recortado.close()
#     except Exception as e:
#         print("Error: {e}")
#     finally:  
#         print("Fin del bloque try-except.")
     


####  Obtener la lista de archivos rasters clipeados en la carpeta de rasters clipeados #####

##archivos_raster_clipeados = os.listdir(carpeta_SMAP_1km_clipeados)
archivos_raster_clipeados = archivos_raster

archivos_raster_clipeados = list(filter(lambda x: caracter_a_eliminar not in x, archivos_raster_clipeados))



#### Extraer fechas de los nombres de los archivos ####

tamagno = len(archivos_raster_clipeados)

fecha_bruta = [""] * tamagno
cadena_fecha = [""] * tamagno
fecha_objeto = [""] * tamagno
fecha_SMAP_9km = pd.date_range('2019-01-01', periods=170, freq='1440min').append(pd.date_range('2019-07-23', periods=162, freq='1440min'))

for i in range(0, len(archivos_raster_clipeados)):
    fecha_bruta[i]=(str(archivos_raster_clipeados[i]).split('_')[6].split('.')[0])
    cadena_fecha[i]=(fecha_bruta[i][0:4]+'-'+fecha_bruta[i][4:6]+'-'+fecha_bruta[i][6:8])
    fecha_objeto[i]=datetime.strptime(cadena_fecha[i], "%Y-%m-%d").date()
  
    
  
#### Extrae los valores del raster GSSM en el punto seleccionado ####

valores_GSSM=np.full(archivos_GSSM.rio.count, np.nan)

for i in range(0, archivos_GSSM.rio.count):
    print('Extracción de valores de banda GSSM: '+str(round((i+1)/archivos_GSSM.rio.count*100,2))+'%')
    valores_GSSM[i]=archivos_GSSM.sel(x=xx2,y=yy2,method='nearest').values[i]

archivos_GSSM.close()
valores_GSSM[valores_GSSM==0] = np.nan 



#### Extrae los valores del raster SMAP 9km en el punto seleccionado ####

valores_SMAP_9km_am=np.full(archivos_SMAP_9km_am.rio.count, np.nan)
valores_SMAP_9km_pm=np.full(archivos_SMAP_9km_pm.rio.count, np.nan)

for i in range(0, archivos_SMAP_9km_am.rio.count):
    print('Extracción de valores de banda SMAP_9km: '+str(round((i+1)/archivos_SMAP_9km_am.rio.count*100,2))+'%')
    valores_SMAP_9km_am[i]=archivos_SMAP_9km_am.sel(x=xx2,y=yy2,method='nearest').values[i]*100
    valores_SMAP_9km_pm[i]=archivos_SMAP_9km_pm.sel(x=xx2,y=yy2,method='nearest').values[i]*100

archivos_SMAP_9km_am.close()
valores_SMAP_9km_am[valores_SMAP_9km_am==0] = np.nan 
archivos_SMAP_9km_pm.close()
valores_SMAP_9km_pm[valores_SMAP_9km_pm==0] = np.nan 



#### Extrae los valores del raster SMAP en el punto seleccionado ####

value0=np.full(len(archivos_raster_clipeados), np.nan)
value1=np.full(len(archivos_raster_clipeados), np.nan)

for i in range(0, len(archivos_raster_clipeados)):
    print('Extracción de valores raster SMAP_1km: '+str(round((i+1)/len(archivos_raster_clipeados)*100,2))+'%')
    ##raster = rioxarray.open_rasterio(carpeta_SMAP_1km_clipeados+archivos_raster_clipeados[i])
    try:
        raster = rioxarray.open_rasterio(carpeta_SMAP_1km+archivos_raster_clipeados[i])
        raster_reproyectado=raster
        #raster_reproyectado = raster.rio.reproject(nueva_proyeccion)
        value0[i]=raster_reproyectado.sel(x=xx,y=yy,method='nearest').values[0]*100
        value1[i]=raster_reproyectado.sel(x=xx,y=yy,method='nearest').values[1]*100
        raster.close()
        raster_reproyectado.close()
    except Exception as e:
        print("Error: {e}")
    finally:  
        print("Fin del bloque try-except.")
        
value0[value0 == 0.] = np.nan
value1[value1 == 0.] = np.nan



#### Plot ####

fig, ax = plt.subplots(figsize=(8, 6))
plt.plot_date(fecha_objeto, value0, '.', label='Banda 1 SMAP 1km')
plt.plot_date(fecha_objeto, value1, '.', label='Banda 2 SMAP 1km')
plt.plot_date(fecha_SMAP_9km, valores_SMAP_9km_am, '.', label='am SMAP 9km')
plt.plot_date(fecha_SMAP_9km, valores_SMAP_9km_pm, '.', label='pm SMAP 9km')
plt.plot_date(fecha_objeto, valores_GSSM[0:(len(fecha_objeto))], '.', label='GSSM_1km')

#plt.plot_date(fecha_objeto, df['Humedad de Suelo [%]'].values[0:(len(fecha_objeto))], '.', label=label_df)

plt.ylim(0,40)
plt.xlabel('Fecha')
plt.ylabel('Humedad de suelo [%]')
plt.title('Punto '+n_punto+' lat:'+str(round(yy2,4))+' lon:'+str(round(xx2,4)))
#plt.title('Punto '+n_punto+' lat:'+str(round(yy,4))+' lon:'+str(round(xx,4)))
plt.legend()
plt.savefig(carpeta_imagenes+nombre_archivo_puntos+'_lat_'+str(round(yy2,4))+'_lon_'+str(round(xx2,4))+'.png',dpi=300)
#plt.savefig(carpeta_imagenes+nombre_archivo_puntos+'_lat_'+str(round(yy,4))+'_lon_'+str(round(xx,4))+'.png',dpi=300)
plt.show()
plt.close()





