//Código basado en el repositorio https://github.com/tejansv7/EarthEngineProject
//La geometría (.shp) que acota el downscaling debe ser cargada en GEE y ser nombrada como "table".

/** supporting functions **/
        
 /*To add the date yyyy-mm-dd in milliseconds as a property, to use it as a filter while combining the SAR and SMAP collections*/
    
 var date_conv = function(imag){  
       
    var image = imag;
    var msec = image.get("system:time_start");
    var date = ee.Date(msec).format("YYYY-MM-dd");
    var millisec = ee.Date(date).millis();
    return ee.Image(image.setMulti({ymd_millis : millisec, Date: date}));
                
               };

/*converting milliseconds into YMD format to visualize the set of available dates for the image collection*/

var date_ymd = function(day){
          var dat = ee.Date(day);
          return dat.format("YYYY-MM-dd");
        };

/*Function used to join two collections on specified criteria, define an inner join*/
var innerJoin = ee.Join.inner();            

/*Specify an equals 
filter for image timestamps*/ 

var filterTimeEq = ee.Filter.equals({      
leftField: 'ymd_millis',
rightField: 'ymd_millis'
    });



/**SAR data collection - adding 'YMD as millisecond'  in the metadata**/ 

var startDate=ee.Date.fromYMD(2017,1,1);//Fecha de inicio de los datos. Añadido por Jonas Valdivieso
var endDate=ee.Date.fromYMD(2017,12,1);//Fecha de término de los datos. Añadido por Jonas Valdivieso
var sar_data = ee.ImageCollection(ee.ImageCollection("COPERNICUS/S1_GRD")
.filterDate(startDate, endDate)
.filterBounds(table)
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.select('VV','angle')
.sort("system:time_start")
.map(date_conv)
.distinct("ymd_millis"))        
.aside(print, 'sar_data');

//generate the list of available dates of sar backscatter data
//distinct ensures unique list of dates

var dates_agg = sar_data.aggregate_array("system:time_start");
var dates_act =  (dates_agg.map(date_ymd));         
var dates =  (dates_agg.map(date_ymd)).distinct();        


/**Filtering smap collection from the list of distinct sar dates generated**/
var coll = ee.ImageCollection([]);   //create an empty image collection
    
//'date' argument is the basis for the loop to take place 
//'output' argument is the argument which stores the output value of the function

//Here ssm is converted to volumetric by multiplying with '2'
   
var agg = function(date, output)      {   
                  var millisec = ee.Date(date).millis();
                  var smap = ee.ImageCollection("NASA_USDA/HSL/SMAP_soil_moisture")
                            .filterDate(ee.Date(date).advance(-2, 'day'), ee.Date(date).advance(1, 'day'))
                            .filterBounds(table)
                            .select("ssm")
                            .map(function(image){return image.clip(table)});
                  var smapcount =  smap.toList(1).length(); 
          var datestamp = function(imageCollection)       {
          
                          var img = imageCollection.first();
          
    //This converts the "Surface Soil Moisture in mm to soil moisture in volumetric percentage " 
var img_vol = img.multiply(ee.Image.constant(2)).copyProperties(img, img.propertyNames()); 
                    
var smap_image = ee.Image(ee.Image(img_vol).setMulti({ymd_millis : millisec, Date:date}));          
                          var collection = ee.ImageCollection(ee.Image(smap_image));

                  return ee.ImageCollection(output).merge(collection);

                                                                    }; 
                  var outputifnull = output;
             return ee.ImageCollection(ee.Algorithms.If(smapcount, datestamp(smap),outputifnull ));
                  
                                            };

                                                     
//Note here we are passing a list of dates and getting an image collection as an output- both its type or nature are different
//the method '.iterate' is useful in such type of situations
var smap =  ee.ImageCollection(dates.iterate(agg, coll));



//iterate runs on 'agg' function and 'smap' is initialized with 'coll' 
    // later the return value of 'agg' function gets stored in 'smap' argument
    
    var smap_dates_agg = smap.aggregate_array("system:time_start");
    var smap_dates =  (smap_dates_agg.map(date_ymd)); 
    var smap_dates_distinct =  (smap_dates_agg.map(date_ymd)).distinct();  
    
    //sar dates used to filter smap, are included as metadata in SMAP
    var smap_dates_modified = smap.aggregate_array("Date"); 


/**Conversion from dB scale to linear scale(sigma) **/               
              
    // SAR Backscatter in Linear Scale
    //dB = 10log(sigma)
    //sigma = 10pow(dB/10) 
     
    var sigma = sar_data.map(function(image){
     
     
        var angle_band = image.select('angle');
        var sigma_0 = ee.Image.constant(10).pow(image.select('VV').divide(10));
         
        return sigma_0.select(['constant'], ['VV']).addBands(angle_band).copyProperties(image, image.propertyNames());
        //The first list (['constant']) will be used as band selectors and the second list(['VV']) as new names for the selected bands.
        });
    
    /** Normalization of sigma **/
    
    //Normalisation wrt 40 degree reference angle
    //(VV x cos^2(40))/cos^2((respective angle))
    //cos() takes only radians as input
     
    var normalizedSigma = function(image){ 
        var power_in_norm=ee.Number(2);// Añadido por Jonas Valdivieso. https://hess.copernicus.org/articles/26/3337/2022/
        var theta_iRad = image.select('angle').multiply(Math.PI/180).cos().pow(power_in_norm);
        var ref_iRad = ee.Image(40).multiply(Math.PI/180).cos().pow(power_in_norm);
        var normalized = (image.select('VV').multiply(ref_iRad)).divide(theta_iRad);
        
        return normalized.copyProperties(image, image.propertyNames());
        
                                };
        
        var sigma_normalized = sigma.map(normalizedSigma);
  
  
  
  var median_sigma = sigma_normalized.reduce(ee.Reducer.median());
    var mad = function(image){
           var mad_img = image.subtract(median_sigma);
      return mad_img.abs();
    };
    var collection_mad = sigma_normalized.map(mad);
    var mad_img = collection_mad.reduce(ee.Reducer.median()).multiply(1.4826);
    
     // Removal of outliers/ masking of outliers
     // Threshhold for outliers - (M−3 ⁎ MAD) < xi < (M + 3 ⁎ MAD)
    var min_crit = median_sigma.subtract(mad_img.multiply(3));
    var max_crit = median_sigma.add(mad_img.multiply(3));
        var mask = function(image){
            var masked_img = image.updateMask(image.gt(min_crit).and(image.lt(max_crit)));
      return masked_img;
          };
        var img_outlier = sigma_normalized.map(mask);
  
  
  
  /**Median Filtering**/
        //General function for median filtering
    
        var median_filter = function(imageCollection, kernelSize)	{
      
            var filtered_coll = imageCollection.map(function(image)		{

var filtered_img = image.focal_median({radius: kernelSize , kernelType: 'square' }).copyProperties(image, image.propertyNames());

                  return filtered_img;

                                                                                    });

return filtered_coll;

                                  };

  //MedianFiltered
var kernelSize=ee.Number(1.5)//Añadido por Jonas Valdivieso. https://developers.google.com/earth-engine/apidocs/ee-image-focalmedian

var sigma_median = median_filter(img_outlier, kernelSize);



var lulc_bands = ee.Image('COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019') //2019 global lulc data at 100m
                   .select('discrete_classification', 'urban-coverfraction', 'water-permanent-coverfraction', 'water-seasonal-coverfraction' )
                   .reproject({crs:'EPSG:4326', scale: 100});
var urban = lulc_bands.select('urban-coverfraction');
var perm_water = lulc_bands.select('water-permanent-coverfraction');
var seas_water = lulc_bands.select('water-seasonal-coverfraction');

/*Generating the mask layer where the above mentioned fractions if more than ten then will
be labelled as '0' otherwise '1'*/
var mask_unwanted = (urban.lt(10)).and(perm_water.lt(10)).and(seas_water.lt(10));  

/**Lulc_mask**/
var mask_at100 = function(image){
      
    var img = image.reproject({crs:'EPSG:4326', scale: 100});
    var masked = img.updateMask(mask_unwanted);                        
          return masked;
    
  };
             //applying lulc mask for polygons
  var sigma_medianFiltered = sigma_median.map(mask_at100);



/**Resampling**/
    
var resample = function(imageCollection, pixelSize){
      
      
    var resampled =   imageCollection.map(function(image){
                              var img = image.reproject({crs:'EPSG:4326', scale: pixelSize});
                              return img });
                                                        
    return resampled;
                                    };
                                    
  var smap_scale = smap.first().projection().nominalScale();
  
  var resolution_req=ee.Number(1000);//Añadido por Jonas Valdivieso.
  var sar_m = resample(sigma_medianFiltered, resolution_req);
  var sar_m_coarse = resample(sar_m,smap_scale);
  var sar_m_c_m = resample(sar_m_coarse,resolution_req );

// Verificación en Mapa de los datos SAR para la resolución requerida. 
// Añadido por Jonas Valdivieso.   
var sar_m_data_map = sar_m.select('VV');
var soilMoistureVis = {
  palette: ['0300ff', '418504', 'efff07', 'efff07', 'ff0303'],
};
Map.setCenter(-6.746, 46.529, 2);
Map.addLayer(sar_m_data_map, soilMoistureVis, 'Sar_m_data');

// Verificación en Mapa de los datos SAR para la resolución requerida luego del resample. 
// Añadido por Jonas Valdivieso.  
var sar_m_c_m_data_map = sar_m_c_m.select('VV');
var soilMoistureVis = {
  palette: ['0300ff', '418504', 'efff07', 'efff07', 'ff0303'],
};
Map.setCenter(-6.746, 46.529, 2);
Map.addLayer(sar_m_c_m_data_map, soilMoistureVis, 'Sar_m_c_m_data');

//conversion to dB
    //dB = 10log(sigma)
    //sigma = 10pow(dB/10) 
    var dBfncn = function(image){
      
        return (image.log10())
                     .multiply(10).copyProperties(image, image.propertyNames());
        
      };
          
      var sar_m_dB = sar_m.map(dBfncn).map(function(image){return image.select(['VV'], ['sar_m'])}); //renaming the bands
      var sar_m_c_m_dB = sar_m_c_m.map(dBfncn);
      var smap_c_m = resample(smap, resolution_req );
      
      var const_img = ee.Image.constant(1);
      
          /**Preparation of datasets for regression and downscaling**/
      var sarsmap_cmjoined = innerJoin.apply(sar_m_c_m_dB, smap_c_m, filterTimeEq);
      
          var sarsmap_c_m = ee.ImageCollection(sarsmap_cmjoined.map(function(feature) {   //Feature collection to image collection
                                      return ee.Image.cat(feature.get('primary'), feature.get('secondary'));
                                                                                }));
  
  //Dataset for linear regression
      var sarsmapconst_c_m = sarsmap_c_m.map(function(image){
                            var image1 = image.select('VV').addBands(const_img);    
                            var image2 = image1.addBands(image.select('ssm'));
                            return image2.select(['VV', 'constant', 'ssm'], ['sar_m_c_m', 'constant', 'ssm_c_m']); 
                            

                                                            });
                                                            
print('sarsmapconst_c_m',sarsmapconst_c_m);// Añadido por Jonas Valdivieso.
                                                            
  //Dataset for downscaling
      
      var downscaling_set1_fc = innerJoin.apply(sarsmapconst_c_m, sar_m_dB, filterTimeEq);
      var downscaling_set1 = ee.ImageCollection(downscaling_set1_fc.aside(print, "collection for downscaling").map(function(feature) {   //Feature collection to image collection
                                      return ee.Image.cat(feature.get('primary'), feature.get('secondary'));
                                                                                }));



/**Linear Regression**/

// ssm_c_m = m (sar_m_c_m) + constant;  y = m(x)+c form 


var beta = function(imageCollection){
  
  
    var linearRegression = imageCollection.aside(print, "collection for regression").reduce(ee.Reducer.linearRegression({ numX: 2, numY: 1 })).aside(print, "linearregression_output");
    var bandNames_lr = [['lr_slope', 'lr_intercept'], ['ssm']]; // 0 and 1-axis variation.
    
    // Flatten the array images to get multi-band images according to the labels.

    var lrImage = linearRegression.select(['coefficients']).arrayFlatten(bandNames_lr).select('lr_slope_ssm').aside(print,"modified_linearregression_image");
    var beta_image = ee.Image([]).addBands(lrImage);


    return beta_image;

  
};



/** Downscaling**/
/* smap_m = smap_c + slopefromlinearreg(sar_m - avg(sar_m))
 100m = 27km_100m+100m(100m - (100m_27km_100m)
 function inputs sar, smap, slope, required medium resolution */ 

 var downscale = function(downscalingSet, slope){
 
    var smap_m = downscalingSet.aside(print, "inputcollection_for_downscaling").map(function(image){
      
      var sar_c = image.select("sar_m_c_m");
      var sar_m = image.select("sar_m");
      var smap_c = image.select("ssm_c_m");//.toDouble()
      
      var smap = smap_c.add(slope.multiply((sar_m.subtract(sar_c))));
      //var smap_new = smap.where(smap.lt(0),smap_c ) - not needed for validation
      
      return smap.select(['ssm_c_m'],['smap_m'])
                 .addBands(smap_c)   
                 .addBands(slope)
                 .addBands(sar_m)
                 .addBands(sar_c)
                 .toFloat() 
                 .copyProperties(smap_c, ['system:time_start','system:time_end','ymd_millis', 'Date']);
                 
      // SAR data properties are being copied from above
                       
    });
    
    
    return smap_m
    // return data_final_renamed
    
      
    };
    
var slope_downscaling=beta(sarsmapconst_c_m);//Añadido por Jonas Valdivieso.
var smap_downscaled = downscale(downscaling_set1, slope_downscaling)
.map(function(image){return image.clip(table)});//Añadido por Jonas Valdivieso.

// Verificación en Mapa de la pendiente derivada de la regresión lineal entre
// el cruce de datos SAR y SMAP. Añadido por Jonas Valdivieso.  
var slope_map = smap_downscaled.select('lr_slope_ssm');
var soilMoistureVis = {
  min: -1.0,
  max: 1.0,
  palette: ['0300ff', '418504', 'efff07', 'efff07', 'ff0303'],
};
Map.setCenter(-6.746, 46.529, 2);
Map.addLayer(slope_map, soilMoistureVis, 'Slope');

// Verificación en Mapa de los datos SMAP originales.
// Añadido por Jonas Valdivieso.  
var soilMoisture = smap.select('ssm');
var soilMoistureVis = {
  min: 0.0,
  max: 28.0,
  palette: ['0300ff', '418504', 'efff07', 'efff07', 'ff0303'],
};
Map.setCenter(-6.746, 46.529, 2);
Map.addLayer(soilMoisture, soilMoistureVis, "Soil Moisture Original");




// Verificación en Mapa de los datos SMAP luego del downscaling.
// Añadido por Jonas Valdivieso.   
var soilMoisture_downscaled = smap_downscaled.select('smap_m');
var soilMoistureVis = {
  min: 0.0,
  max: 28.0,
  palette: ['0300ff', '418504', 'efff07', 'efff07', 'ff0303'],
};
Map.setCenter(-6.746, 46.529, 2);
Map.addLayer(soilMoisture_downscaled, soilMoistureVis, 'Soil Moisture Downscaled');






// Gráfico de la humedad de suelo SMAP datos originales. 
// Añadido por Jonas Valdivieso.
var chart_downscaling = ui.Chart.image.series({
  imageCollection: smap.select('ssm'),
  region: 
  table,
  reducer: ee.Reducer.mean(),
  scale: 500
}).setOptions({title: 'Soil Moisture downscaling in mm'});


print(chart_downscaling);



// Gráfico de la humedad de suelo SMAP datos posteriores al downscaling. 
// Añadido por Jonas Valdivieso.
var chart_downscaled = ui.Chart.image.series({
  imageCollection: smap_downscaled.select('smap_m'),
  region: 
  table,
  reducer: ee.Reducer.mean(),
  scale: 500
}).setOptions({title: 'Soil Moisture downscaled in mm'});


print(chart_downscaled);



// Gráfico de VV datos SAR posteriores al resampling. 
// Añadido por Jonas Valdivieso.
var chart_sar_m = ui.Chart.image.series({
  imageCollection: sar_m.select('VV'),
  region: 
  table,
  reducer: ee.Reducer.mean(),
  scale: 500
}).setOptions({title: 'SAR_m VV'});


print(chart_sar_m);


