//Código basado en el repositorio https://github.com/QianqianHan96/GSSM1km

//La variable "table" corresponde al asset Rectangulo_Chile la geometría (.shp) que acota el downscaling y debe ser cargada en GEE. 
//Link: https://cirencl-my.sharepoint.com/:u:/g/personal/ccalvo_ciren_cl/ERfCBnlNpttNqCyzAuX8YEkB_lSetiTLgpP_EWOsiAnNzg?e=Cvyd9d

//La variable "image" corresponde al asset LST_2019_Day_EEUU_Chile y debe ser cargado en GEE. 
//Link:https://cirencl-my.sharepoint.com/:i:/g/personal/ccalvo_ciren_cl/EXEeRrVXP-xFtbOrp_Tck_EBkjgoHZt3OMYlJTS6A-9pLA?e=7IgWVN

//La variable "image2" corresponde al asset LST_2019_Night_EEUU_Chile y debe ser cargado en GEE. 
//Link:https://cirencl-my.sharepoint.com/:i:/g/personal/ccalvo_ciren_cl/EZKm6pabwFJInsdWJv7emckBKE9ZoPkFCdLDm84OESkevA?e=5S0knD

var MERIT = ee.Image("MERIT/Hydro/v1_0_1").clip(table),
    MOD13A2 = ee.ImageCollection("MODIS/061/MOD13A2").filterBounds(table),
    ERA5Land = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR").filterBounds(table),
    WTD=ee.Image("users/ccalvocm/WTD").clip(table),
    DTB = ee.Image("users/ccalvocm/DTB").clip(table),
    trainTest = ee.FeatureCollection("users/ccalvocm/GlobalSSM2022/trainTestFinal2022-0509coor"),
    valiEva = ee.FeatureCollection("users/ccalvocm/GlobalSSM2022/valiEvaFinal2022-0509coor"),
    NLsamples = ee.FeatureCollection("users/ccalvocm/NLsamples/trainTestNL2022-0509coor"),
    TIele = ee.Image("users/ccalvocm/GlobalSSM2022/TIele1000resample0709").clip(table),
    ERA5LandHour = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY").filterBounds(table);


var WTD=WTD.reproject("EPSG:4326",null,1000).rename('WTD');
DTB = DTB.reproject("EPSG:4326",null,1000).rename('DTB');
var EuropeBoundary=table;

///////////////NDVI & EVI
var modis = MOD13A2;
var oeel=require('users/OEEL/lib:loadAll');
var firstYear = 2019;
var firstDaymodis = ee.String(ee.Number(firstYear).subtract(1)).cat('-12-13');
var lastDaymodis = ee.String(ee.Number(firstYear).add(1)).cat('-01-18');
// 26 images in the current year
modis=modis.filterDate(firstDaymodis,lastDaymodis).select(["NDVI","EVI"]);
print("originalMODIS",modis);
Map.addLayer(modis.select(["NDVI","EVI"]),{},"original NDVI&EVI");
// SG filter
var s=oeel.ImageCollection.SavatskyGolayFilter(modis,
        ee.Filter.maxDifference(1000*3600*24*48, 'system:time_start', null, 'system:time_start'),
        function(infromedImage,estimationImage){
          return ee.Image.constant(ee.Number(infromedImage.get('system:time_start'))
            .subtract(ee.Number(estimationImage.get('system:time_start'))));},
        3,["NDVI","EVI"],modis);
//print("SG NDVI & EVI in the current year and 12/19(or 12/18) of the previous year, 1/17 of the next year)",s)

///////////////////////////Linear interpolation
////24 images, filter 12/19(or 12/18) and 1/17 which have masked values
s=ee.ImageCollection(s.toList(26).slice(1,25)).select(["d_0_NDVI","d_0_EVI"])
  .map(function(img){
    return img;//.unmask(0)
  });
//print('SG NDVI & EVI only in the current year',s)
//Map.addLayer(s.select(["d_0_NDVI","d_0_EVI"]),{},'SG NDVI&EVI')
// Yr start date 
var ddStart = ee.Number(s.aggregate_min('system:time_start'));
// Yr end date
var ddEnd =  ee.Number(s.aggregate_max('system:time_start'));
// DD list
var ddList = ee.List.sequence(ddStart, ddEnd, (24*60*60*1000));
// DD list to img collection  
var ddCll = ee.ImageCollection.fromImages(
                    ddList.map(function (tuple){return ee.Image.constant(tuple).toInt64()
                              .set('system:time_start',ee.Number(tuple))
                              .select(['constant'],['time']);
                            })
);
// Original NDVI copier
function copyValue (img){
 var time = img.metadata('system:time_start');
 function mask (val){
   var timeOrig = val.metadata('system:time_start');
   var masked = timeOrig.eq(time);
   return val.mask(masked);
 }
 var ndviCll = s.map(mask);
 return img.addBands(ndviCll.max()); 
}
var filledDate = ddCll.map(copyValue);
//print('filledDate',filledDate)

var day = (24*60*60*1000);
var timeDelta = (16*day);
// when 12/19, it is 13 days
// when 12/18, it is 14 days
var timeDelta1= (13*day);
// Create a list of original calculated dates
var startDayList = s.toList(24).map(function(ele){
  ele=ee.Image(ele);
  return ele.get("system:time_start");
}).slice(0,23);
// convert it in an image collection
function toImage(tuple){
  return ee.Image.constant(ee.Number(tuple)).set('system:time_start',tuple);
}
var imgCll = ee.ImageCollection.fromImages(startDayList.map(toImage));

///////////////*******************************//////////////////////
/////////////The function to interpolate EVI
function NDVIinterpolator(img){
  img=ee.Image(img);
  // get the first day of the subsample 
  var begin = ee.Number(img.get('system:time_start'));
  // get the end day of the subsample
  //var end = begin.add(ee.Number(timeDelta));
  var difference = ee.String(ee.Date(ee.Number(img.get('system:time_start'))).format('YYYY-MM-dd')).slice(5).compareTo("12-18").neq(0)
                   .and(ee.String(ee.Date(ee.Number(img.get('system:time_start'))).format('YYYY-MM-dd')).slice(5).compareTo("12-19").neq(0));
  var end = ee.Algorithms.If(difference,
            begin.add(ee.Number(timeDelta)),
            begin.add(ee.Number(timeDelta1))
  );
  //convert to an image
  var minDD = ee.Image(filledDate.filterDate(begin).first()); 
  var maxDD = ee.Image(filledDate.filterDate(end).first());
  
  //calculate the coefficent
  var angularCoeff = ee.Algorithms.If(difference,
                     (maxDD.select('d_0_NDVI').subtract(minDD.select('d_0_NDVI'))).divide(timeDelta),
                     (maxDD.select('d_0_NDVI').subtract(minDD.select('d_0_NDVI'))).divide(timeDelta1)
  );
  var q = ee.Algorithms.If(difference,
          ((maxDD.select('time').multiply(minDD.select('d_0_NDVI'))).subtract(minDD.select('time').multiply(maxDD.select('d_0_NDVI'))))
          .divide(timeDelta),
          ((maxDD.select('time').multiply(minDD.select('d_0_NDVI'))).subtract(minDD.select('time').multiply(maxDD.select('d_0_NDVI'))))
          .divide(timeDelta1)
  );
  //refilter the out collection
  var mnth = filledDate.filterDate(begin,end);
  
  // interpolate the values
  function ndviInterpolator(img){
    var NDVI = (img.select('time').multiply(angularCoeff)).add(q);
    var result = img.select('d_0_NDVI').unmask(NDVI);
    return result;
  }
  var filledMth = mnth.map(ndviInterpolator);
  return filledMth.cast({"d_0_NDVI": "float"}, ["d_0_NDVI"]);
}
///////////////*******************************//////////////////////
/////////////The function to interpolate EVI
function EVIinterpolator(img){
  img=ee.Image(img);
  // get the first day of the subsample 
  var begin = ee.Number(img.get('system:time_start'));
  // get the end day of the subsample
  //var end = begin.add(ee.Number(timeDelta));
  var difference = ee.String(ee.Date(ee.Number(img.get('system:time_start'))).format('YYYY-MM-dd')).slice(5).compareTo("12-18").neq(0)
                   .and(ee.String(ee.Date(ee.Number(img.get('system:time_start'))).format('YYYY-MM-dd')).slice(5).compareTo("12-19").neq(0));
  var end = ee.Algorithms.If(difference,
            begin.add(ee.Number(timeDelta)),
            begin.add(ee.Number(timeDelta1))
  );
  //convert to an image
  var minDD = ee.Image(filledDate.filterDate(begin).first()); 
  var maxDD = ee.Image(filledDate.filterDate(end).first());
  
  //calculate the coefficent
  var angularCoeff = ee.Algorithms.If(difference,
                     (maxDD.select('d_0_EVI').subtract(minDD.select('d_0_EVI'))).divide(timeDelta),
                     (maxDD.select('d_0_EVI').subtract(minDD.select('d_0_EVI'))).divide(timeDelta1)
  );
  var q = ee.Algorithms.If(difference,
          ((maxDD.select('time').multiply(minDD.select('d_0_EVI'))).subtract(minDD.select('time').multiply(maxDD.select('d_0_EVI'))))
          .divide(timeDelta),
          ((maxDD.select('time').multiply(minDD.select('d_0_EVI'))).subtract(minDD.select('time').multiply(maxDD.select('d_0_EVI'))))
          .divide(timeDelta1)
  );
  //refilter the out collection
  var mnth = filledDate.filterDate(begin,end);
  
  // interpolate the values
  function ndviInterpolator(img){
    var NDVI = (img.select('time').multiply(angularCoeff)).add(q);
    var result = img.select('d_0_EVI').unmask(NDVI);
    return result;
  }
  var filledMth = mnth.map(ndviInterpolator);
  return filledMth.cast({"d_0_EVI": "float"}, ["d_0_EVI"]);
}
///////////////*******************************//////////////////////
//apply the interpolation function to NDVI
var sgliNDVICollection =  ee.ImageCollection(imgCll.map(NDVIinterpolator).flatten().toList(3000)).map(function(img){
  //.divide(10000) why the "system: time_Start" disappear after divide?
  return img.clip(EuropeBoundary);//.reproject("EPSG:4326",null,1000);
});

var NDVI=sgliNDVICollection;

print("NDVI",NDVI);
Map.addLayer(NDVI,{},"NDVI");

//apply the interpolation function to NDVI
var sgliEVICollection =  ee.ImageCollection(imgCll.map(EVIinterpolator).flatten().toList(3000)).map(function(img){
  return img.clip(EuropeBoundary);//.reproject("EPSG:4326",null,1000);;
});

var EVI=sgliEVICollection;

print("EVI",EVI);
Map.addLayer(EVI,{},"EVI");
/////////////////////////**********************************
//*******API************
//1979-01-02T00:00:00 - 2020-07-09T00:00:00
///////filter ERA5 collection according to Date
//because t=34, so we need to use 34 days data before 2018-01-01
//And drop them after API calculation
var firstDayPreci = ee.String(ee.Number(firstYear).subtract(1)).cat('-11-28');
var firstDay = ee.String(firstYear.toString()).cat('-01-01');
var lastDay  = ee.String(ee.Number(firstYear).add(1)).cat('-01-01');
 var lastDayExtra1  = ee.String(ee.Number(firstYear).add(1)).cat('-01-02');
 var ERA5LandPre = ERA5LandHour.filterDate(firstDayPreci,lastDayExtra1).map(function(img){
                     return img.select(["total_precipitation",'total_evaporation']).clip(EuropeBoundary)
                           // 20151129T00 represents total precipitation of 20151128 (T01-T00), so one hour shift earlier
                           .set("system:time_start",ee.Number(img.get("system:time_start")).subtract(86400000))
                   })
           .filterDate(firstDayPreci,lastDay)
           .filterMetadata("hour","equals",00)
           

 print("ERA5LandPre",ERA5LandPre)
 print("ERA5LandPresize",ERA5LandPre.size())
 Map.addLayer(ERA5LandPre,{min:0,max:0.05},'ERA5LandPre')
 ERA5LandPre = ERA5LandPre.map(function(img){
   return img.select("total_precipitation").add(img.select('total_evaporation'))
         .set("system:time_start",ee.Number(img.get("system:time_start")))
         .set('hour',img.get('hour'))
 })
 
//t=34(0-33) k=0.91 
 var lagRange = 33;
// Looks for all images up to 'lagRange' days away from the current image.
 var maxDiffFilter = ee.Filter([
   ee.Filter.maxDifference({
     difference: lagRange * 24 * 60 * 60 * 1000,
     leftField: 'system:time_start',
     rightField: 'system:time_start'
   })]);

//Images before, sorted in ascending order (so closest is last).
//here we cannot remove the equals, otherwise the timeseries will lost first element
 var FilterBefore = ee.Filter.and(maxDiffFilter, ee.Filter.greaterThanOrEquals('system:time_start', null, 'system:time_start'))
 var ERA5LandPre_BeforeJoinedCols = ee.Join.saveAll('before', 'system:time_start', true).apply(ERA5LandPre, ERA5LandPre, FilterBefore)
 
 print('ERA5LandPre_BeforeJoinedCols',ERA5LandPre_BeforeJoinedCols);

// ////////////calculate apiCollection over all precipitation datasets
 var apiLandCollection = ERA5LandPre_BeforeJoinedCols.map(function(image1) {
   image1 = ee.Image(image1);
   var beforeImages=ee.List(image1.get('before'))
   beforeImages=beforeImages.map(function(image2){
   image2=ee.Image(image2)
   var startTime=ee.Number(image1.get('system:time_start'))
   var id=startTime.subtract(ee.Number(image2.get('system:time_start'))).divide(86400000);
   return ee.Image(image2).set('id',id)
 })
   beforeImages=ee.ImageCollection(beforeImages)//.filterMetadata("id","not_equals",0)
   var k=ee.Image(0.91)
   var apiItem=beforeImages.map(function(image3){
     image3=ee.Image(image3)
     var id=ee.Image(ee.Number(image3.get('id')));
     var api=image3.multiply(k.pow(id))
     return api
   })
   var api=ee.ImageCollection(apiItem).sum()
   //return api.rename([ee.String('band').cat(ee.String('_')).cat(image1.get('system:index')).cat("_APEI")])
   return api.rename([ee.String('band').cat(ee.String('_')).cat("_APEI")])
             .set('system:index1',ee.String(image1.get('system:index')).slice(0,8))
             .set("system:time_start",image1.get("system:time_start"))
 })
 
   apiLandCollection=ee.ImageCollection(apiLandCollection
                   .filterMetadata("system:index","not_less_than",ee.String(ee.Number(firstYear)).cat("0102T00")))
 print('APILand',apiLandCollection);
 var APILand = apiLandCollection
 
 Map.addLayer(APILand.toBands(),{min:0,max:0.04},"APILand")
/////////////////////*****************************
//air temperature
// var preImgCol = ERA5LandHour.filterDate(firstDay.cat("T01"),lastDay.cat("T01")).select("temperature_2m").map(function(col){
//   //0102T00(equals to 0101T24) -> 0101T23
//   //0101T01+0101T02+...+0102T00(equals to 0101T24)
//   var system_time_start = ee.Number(col.get('system:time_start')).subtract(3600000)
//   var system_time_end = ee.Number(col.get('system:time_end')).subtract(3600000)
//   var date=ee.Date(ee.Number(col.get('system:time_start')).subtract(3600000)).format("YYYY-MM-dd")
//   var preImgCol=col.set('date',date).set('system:time_start',system_time_start).set('system:time_end',system_time_end);
//   return preImgCol
// })
// print(preImgCol.size())
// print("preImgCol Tair",ee.ImageCollection(preImgCol.toList(8784).slice(8000,8784)))
// // //merge data from hourly into daily with join function
// var join = ee.Join.saveAll("matches");
// var filter = ee.Filter.equals({ 
//   leftField: "date", 
//   rightField: "date" 
// }); 
// var joinImgs = join.apply(preImgCol.filterMetadata("hour","equals",1), preImgCol, filter); 
// print("joinImgs",joinImgs.first())
// var TairCollection = joinImgs.map(function(image) { 
//   var _imgList = ee.List(image.get("matches")); 
//   var _tempCol = ee.ImageCollection.fromImages(_imgList); 
//   //due to it is hourly, so we need to calculate the average of everyday
//   //Temperature measured in kelvin can be converted to degrees Celsius (°C) by subtracting 273.15.
//   var _dayImg = _tempCol.mean().subtract(273.15); 
//   var _date = image.get("date"); 
//   _dayImg = _dayImg.set("system:time_start", ee.Date.parse("yyyy-MM-dd", _date).millis())
//                   .set('date',_date)
//   return _dayImg.rename("Tair")//.reproject("EPSG:4326",null,1000); 
// }); 
// TairCollection=ERA5Land
var TairCollection=ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR").filterBounds(table)
                    .map(function(img){return img.select("temperature_2m").rename('Tair')})
                    .filterDate(firstDay,lastDay);
print("TairCollection",TairCollection);
Map.addLayer(ee.ImageCollection(TairCollection),{min:0,max:0.05},'TairCollection');

////evaporation

var evapoCollection=ERA5Land
                    .map(function(img){return img.select("total_evaporation_sum").rename('Evapo')})
                    .filterDate(firstDay,lastDay);
print("evapoCollection",evapoCollection);

////precipitacion
var precipCollection=ERA5Land
                    .map(function(img){return img.select("total_precipitation_sum").rename('Preci')})
                    .filterDate(firstDay,lastDay);
print("precipCollection",precipCollection);

///////////////////////////***********************************
//LST
//var LST=ee.ImageCollection("users/qianrswaterAmerica/LSTEuropeMOD11A1");
//print("LSTEurope",LST);
//var dayLSTfilter = ee.String("MODIS_LST_Blended_Day_Europe").cat(ee.String(ee.Number(firstYear)));
//var nightLSTfilter = ee.String("MODIS_LST_Blended_Night_Europe").cat(ee.String(ee.Number(firstYear)));
//var dayLST = LST.filterMetadata("system:index","equals",dayLSTfilter).first().divide(100);
//var nightLST = LST.filterMetadata("system:index","equals",nightLSTfilter).first().divide(100);
//print("dayLST",dayLST);
//print("nightLST",nightLST);
//print("Band_Names_LST_day",dayLST.bandNames());
//print("Band_Names_LST_night",nightLST.bandNames());


//JV: Por qué divide en 100??
//var dayLST_2019 = ee.ImageCollection(image).first().divide(100);
//var nightLST_2019 = ee.ImageCollection(image2).first().divide(100);

var dayLST_2019 = ee.ImageCollection(image).first().divide(100).clip(table);
var nightLST_2019 = ee.ImageCollection(image2).first().divide(100).clip(table);

print("dayLST_2019",dayLST_2019);
print("nightLST_2019",nightLST_2019);
print("Band_Names_LST_day_2019",dayLST_2019.bandNames());
print("Band_Names_LST_night_2019",nightLST_2019.bandNames());

function batchRename_dailyLST(image){
  var rename=image.bandNames().map(function(name){
    return ee.String("band_").cat(ee.String(name).slice(-10)).cat(ee.String("_dailyLST"));
  });
  return image.rename(rename);
}

function batchRename_dailyLSTDiff(image){
  var rename=image.bandNames().map(function(name){
    return ee.String("band_").cat(ee.String(name).slice(-10)).cat(ee.String("_dailyLSTDiff"));
  });
  return image.rename(rename);
}

var dailyLST0=batchRename_dailyLST(dayLST_2019.add(nightLST_2019).divide(ee.Number(2)))
.reproject("EPSG:4326",null,1000);
print("dailyLST0",dailyLST0);


function batchRename_dailyLSTDiff(image){
  var rename=image.bandNames().map(function(name){
    return ee.String("band_").cat(ee.String(name).slice(-10)).cat(ee.String("_dailyLSTDiff"));
  });
  return image.rename(rename);
}

var dailyLSTDiff0=batchRename_dailyLSTDiff(dayLST_2019.subtract(nightLST_2019))
.reproject("EPSG:4326",null,1000);
print("dailyLSTDiff0",dailyLSTDiff0);


///dailyLST
var bandNamesdailyLST=dailyLST0.bandNames();
var dailyLST=ee.ImageCollection(bandNamesdailyLST.map(function(BandNameElement){
  var stringLength=ee.String(BandNameElement).length();
  var stryearBegin=ee.String(BandNameElement).slice(-19,-9);
  var startIndex=ee.String(BandNameElement).rindex(stryearBegin);
  var DateString=ee.String(BandNameElement).slice(startIndex,startIndex.add(10));
  var yearStr=ee.Number.parse(DateString.slice(0,4));
  var monthStr=ee.Number.parse(DateString.slice(5,7));
  var DayStr=ee.Number.parse(DateString.slice(8,10));
   
  return ee.Image(dailyLST0.select([BandNameElement])).rename(['dailyLST']).cast({"dailyLST": "double"}, ["dailyLST"])
.set('system:time_start', ee.Date.fromYMD(yearStr.int(), monthStr.int(), DayStr.int()).millis())
.set('bandName',BandNameElement)
.set("system:index",stryearBegin);
}));
print("dailyLST",dailyLST);
Map.addLayer(dailyLST,{},"dailyLST");


////dailyLSTDiff
var bandNamesdailyLSTDiff=dailyLSTDiff0.bandNames();
var dailyLSTDiff=ee.ImageCollection(bandNamesdailyLSTDiff.map(function(BandNameElement){
  var stringLength=ee.String(BandNameElement).length();
  var stryearBegin=ee.String(BandNameElement).slice(-23,-13);
  var startIndex=ee.String(BandNameElement).rindex(stryearBegin);
  var DateString=ee.String(BandNameElement).slice(startIndex,startIndex.add(10));
  var yearStr=ee.Number.parse(DateString.slice(0,4));
  var monthStr=ee.Number.parse(DateString.slice(5,7));
  var DayStr=ee.Number.parse(DateString.slice(8,10));
   
  return ee.Image(dailyLSTDiff0.select([BandNameElement])).rename(['dailyLSTDiff']).cast({"dailyLSTDiff": "double"}, ["dailyLSTDiff"])
.set('system:time_start', ee.Date.fromYMD(yearStr.int(), monthStr.int(), DayStr.int()).millis())
.set('bandName',BandNameElement)
.set("system:index",stryearBegin);
}));
print("dailyLSTDiff",dailyLSTDiff);
Map.addLayer(dailyLSTDiff,{},"dailyLSTDiff");
////////////////////////////////////////
///////////////
var modis = MOD13A2.first().reproject("EPSG:4326",null,1000);
// Get information about the MODIS projection.
var modisProjection = modis.projection();
print('MODIS projection:', modisProjection);

//soilTexture
//print(ee.Image("projects/soilgrids-isric/clay_mean").projection().nominalScale())
// divide 10, convert "g/kg" to "g/100g (%)"
var clayFraction =ee.Image("projects/soilgrids-isric/clay_mean").select("clay_0-5cm_mean").clip(table)
                  .rename("clay").divide(10).reproject("EPSG:4326",null,250);
var sandFraction =ee.Image("projects/soilgrids-isric/sand_mean").select("sand_0-5cm_mean").clip(table)
                  .rename("sand").divide(10).reproject("EPSG:4326",null,250);
var siltFraction =ee.Image("projects/soilgrids-isric/silt_mean").select("silt_0-5cm_mean").clip(table)
                  .rename("silt").divide(10).reproject("EPSG:4326",null,250);
//porosity
//divide 100, convert "cg/cm³" to "kg/dm³", which is same as "g/cm³"
var bulkDensity=ee.Image("projects/soilgrids-isric/bdod_mean").select("bdod_0-5cm_mean").clip(table)
                .divide(100).reproject("EPSG:4326",null,250);
var porosity = ee.Image(1).subtract(bulkDensity.divide(ee.Image(2.65))).clip(table)
              .rename("porosity").reproject("EPSG:4326",null,250);
//organic matter content
var soc = ee.Image("projects/soilgrids-isric/soc_mean").clip(table);
//divide 10, convert "dg/kg" to "g/kg", then divide 10, convert "g/kg" to "%"
var omc = soc.select("soc_0-5cm_mean").multiply(0.01).multiply(1.724).reproject("EPSG:4326",null,250).rename("omc");

var soilProper = clayFraction.addBands(sandFraction).addBands(siltFraction).addBands(porosity).addBands(omc);
Map.addLayer(soilProper,{min:0,max:100},"soilProper250");
var resample = function(image) {
  return image.resample('bilinear')
              .reproject({
                    crs: modisProjection,
                    scale: 1000});
};
soilProper = resample(soilProper);
Map.addLayer(soilProper,{min:0,max:100},"soilProper1000");
////////////////////////
var longitude = ee.Image.pixelLonLat().select("longitude").reproject("EPSG:4326",null,1000).rename("lon");
//Map.addLayer(longitude,{},"longitude")
var latitude = ee.Image.pixelLonLat().select("latitude").reproject("EPSG:4326",null,1000).rename("lat");
//Map.addLayer(latitude,{},"latitude")
var elevation=TIele.select("elevation").reproject("EPSG:4326",null,1000);
var TI=TIele.select("TI").reproject("EPSG:4326",null,1000);

////////////////////////combine all predictors
var predictors=dailyLST.map(function(img){
  var time=img.get("system:time_start");
  var dailyLSTDiff1=dailyLSTDiff.filterMetadata("system:time_start","equals",time).first().rename("LST_Diff");
  var NDVI1=NDVI.filterMetadata("system:time_start","equals",time).first().rename("NDVI_SG_linear").divide(10000);
  var EVI1=EVI.filterMetadata("system:time_start","equals",time).first().rename("EVI_SG_linear").divide(10000);
  var Preci1=precipCollection.filterMetadata("system:time_start","equals",time).first().rename("Preci").multiply(1000);
  var APILand1=APILand.filterMetadata("system:time_start","equals",time).first().rename("apei").multiply(1000)
  var Tair1=TairCollection.filterMetadata("system:time_start","equals",time).first().rename("Tair").subtract(273.15);
  var Evapo1=evapoCollection.filterMetadata("system:time_start","equals",time).first().rename("Evapo").multiply(-1000);
  return img.rename("LST_DAILY").addBands(dailyLSTDiff1)
            .addBands(Preci1)
            .addBands(APILand1)
            .addBands(Tair1)
            .addBands(Evapo1)
            .addBands(NDVI1)
            .addBands(EVI1)
            .addBands(TI)
            .addBands(soilProper.select("porosity")).addBands(soilProper.select("omc"))
            .addBands(soilProper.select("clay")).addBands(soilProper.select("sand")).addBands(soilProper.select("silt"))
            .addBands(longitude).addBands(latitude).addBands(elevation)
            .addBands(WTD)
            .addBands(DTB);
})
.map(function(img){
  return img.clip(EuropeBoundary).reproject("EPSG:4326",null,1000);
});
print("predictors",predictors.first());
Map.addLayer(predictors.first(),{},"predictors",false);
print("predictors_size",predictors.size())
////////////
print("/////   training /////////////////////");
Map.addLayer(trainTest,{},'trainTest',false);

print(trainTest.first());
/////////select a certain number of training and testing samples
var sample=trainTest;
var station=sample.toList(556443).map(function(a){
  return ee.Feature(a).get('station');
});

sample=sample.randomColumn();
var sampleSplit = 0.6; 
//var sampleSplit = 0.5;
sample=sample.filter(ee.Filter.lt('random', sampleSplit));
print('sampleFirst',sample.first());
print('sampleSize',sample.size());
//Map.addLayer(sample,{},'samples')
var station=sample.toList(556443).map(function(a){
  return ee.Feature(a).get('station');
});
print("station size",station.distinct())
NLsamples = NLsamples.randomColumn();
var trainingNL = NLsamples.filter(ee.Filter.lt('random', 0.75));
var testingNL = NLsamples.filter(ee.Filter.gte('random', 0.75));
print("trainingNL",trainingNL)
print("testingNL",testingNL)
sample = sample.merge(trainingNL)
print('sampleSize',sample.size())
// //////////split training and testing samples
sample = sample.randomColumn();
print('sampleSize',sample.size())
var split = 0.75;  // Roughly 75% training, 25% testing.
var training = sample.filter(ee.Filter.lt('random', split));
print('trainingSize',training.size())
var testing = sample.filter(ee.Filter.gte('random', split));
//print('testingSize',testing.size())
// Make a Random Forest classifier and train it
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees:20,
  minLeafPopulation:1, 
  bagFraction:0.5,
  seed:0
}).setOutputMode('REGRESSION')
    .train({
      features: training,
      classProperty: 'soil moisture',
      inputProperties: [
                      "apei",
                      "Preci",
                      'Tair',
                      'Evapo',
                      'LST_DAILY','LST_Diff',
                      'EVI_SG_linear','NDVI_SG_linear',
                      'clay','sand','silt',
                      'TI','elevation',
                      "lat","lon",
                      'porosity',
                      "omc"
                      ,'WTD'
                      ,'DTB'
                      ]
    });
//calculate the importance of every land surface feature
var importance=classifier.explain();
print('importance',importance)


//var SM=ee.ImageCollection(predictors.toList(366).slice(0,366)).map(function(img){
  var SM=ee.ImageCollection(predictors.toList(366).slice(0,366)).map(function(img){
  return img.classify(classifier).multiply(1000).round().toUint16();
});
print("Classifier",classifier);
//print("SM",SM);
print("SM",SM.size());
print("SM",SM);
//print("spatial resolution of SM",SM.first().projection().nominalScale().getInfo())
function batchRename(image){
  var rename=image.bandNames().map(function(name){
    return ee.String("band_").cat(ee.String(name));
  });
  return image.rename(rename);
}

//Dividr por 10 para transformar a porcentaje

SM=batchRename(SM.toBands()).divide(10);
print("SM",SM);
Export.image.toDrive({
  image: SM,
  description: ee.String("SM").cat(ee.String(ee.Number(firstYear))).cat("Chile").getInfo(),
  folder: 'LST',
  scale:1000,
  region: table,
  crs: 'EPSG:4326',
});

//Export.image.toAsset({
//          image: SM,
//          description:ee.String("SM").cat(ee.String(ee.Number(firstYear))).cat("Europe1km").getInfo(),
//          scale: 1000,
//          region: EuropeBoundary,
//          crs:"EPSG:4326",
//          assetId:ee.String("GlobalSSM1km0509/SM").cat(ee.String(ee.Number(firstYear))).cat("Europe1km").getInfo(),
//          maxPixels: 1e13,
//          pyramidingPolicy: {'.default': 'sample'}
//      });
Map.addLayer(EuropeBoundary,{},"EuropeBoundary")
Map.addLayer(SM,{},"SM")
