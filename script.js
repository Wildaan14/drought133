script // ===================== APP SETUP =====================
// jalankan HTML via server lokal (Live Server) agar .tif/.geojson bisa dimuat

(function () {
  // ===================== MAP INIT =====================
  const map = L.map('map', { zoomControl: true }).setView([-6.9, 107.6], 8);

  // ===================== BASEMAPS =====================
  const osm = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
  );

  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}',
    { maxZoom: 19, attribution: 'Tiles &copy; Esri — World Imagery' }
  );

  const terrain = L.tileLayer(
    'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
    { maxZoom: 18, attribution: 'Map tiles &copy; Stamen, Data &copy; OpenStreetMap' }
  );

  const topographic = L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { maxZoom: 17, attribution: 'Map &copy; OpenTopoMap (CC-BY-SA)' }
  );

  // default basemap
  osm.addTo(map);

  // control basemap (dipindah ke kiri-atas supaya tidak ketimpa panel info)
  const baseLayers = {
    '🌐 OpenStreetMap': osm,
    '🛰 Satellite': satellite,
    '🏔 Terrain': terrain,
    '🗺 Topographic': topographic
  };
  L.control.layers(baseLayers, null, { position: 'topleft', collapsed: false }).addTo(map);

  // ===================== KONTROL TAMBAHAN =====================
  L.control.scale({ metric: true, imperial: false }).addTo(map);
  if (L.Control.Geocoder) L.Control.geocoder({ defaultMarkGeocode: true }).addTo(map);
  if (L.Control.Measure) {
    new L.Control.Measure({
      primaryLengthUnit: 'meters',
      secondaryLengthUnit: 'kilometers',
      primaryAreaUnit: 'sqmeters',
      activeColor: '#10b981',
      completedColor: '#059669'
    }).addTo(map);
  }

  // ===================== HUD KOORDINAT =====================
  const hud = document.getElementById('hud');
  if (hud) {
    map.on('mousemove', e => {
      hud.textContent = Lat: ${e.latlng.lat.toFixed(6)}, Lng: ${e.latlng.lng.toFixed(6)};
    });
  }

  // ===================== PANEL INFO & MARKER =====================
  window.toggleInfo = function toggleInfo() {
    const p = document.getElementById('infoPanel');
    if (p) p.classList.toggle('hide');
  };

  map.on('click', e => {
    L.marker(e.latlng)
      .addTo(map)
      .bindPopup(Lat: ${e.latlng.lat.toFixed(6)}<br>Lng: ${e.latlng.lng.toFixed(6)})
      .openPopup();
  });

  // ===================== LEGEND UTILS =====================
  const legendStack = document.getElementById('legendStack') || (function () {
    // buat kontainer legend kalau belum ada
    const div = document.createElement('div');
    div.id = 'legendStack';
    div.className = 'legend-stack';
    // gaya minimal kalau belum ada CSS
    div.style.position = 'absolute';
    div.style.right = '16px';
    div.style.bottom = '64px';
    div.style.display = 'grid';
    div.style.gap = '10px';
    div.style.zIndex = 380;
    (document.getElementById('map') || document.body).appendChild(div);
    return div;
  })();

  const legends = {}; // id -> DOM

  function makeLegend(id, title, colorScale, min, max, unit = '') {
    removeLegend(id);
    const el = document.createElement('div');
    el.className = 'legend';
    el.id = 'legend-' + id;
    el.style.background = '#fff';
    el.style.border = '1px solid #e2e8f0';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 8px 20px rgba(2,6,23,.12)';
    el.style.padding = '10px';
    el.style.minWidth = '180px';

    const h = document.createElement('div');
    h.textContent = title;
    h.style.fontWeight = '700';
    h.style.margin = '0 0 8px';
    el.appendChild(h);

    const bar = document.createElement('div');
    bar.style.height = '12px';
    bar.style.borderRadius = '6px';
    bar.style.border = '1px solid #e2e8f0';
    bar.style.background = 'linear-gradient(to top, #440154, #21918c, #fde725)'; // fallback
    try {
      const cs = plotty.colorscales[colorScale];
      if (cs && cs.colors) {
        const stops = cs.colors.map(([p, c]) => ${c} ${Math.round(p * 100)}%).join(', ');
        bar.style.background = linear-gradient(to top, ${stops});
      }
    } catch (e) {}
    el.appendChild(bar);

    const scale = document.createElement('div');
    scale.style.display = 'flex';
    scale.style.justifyContent = 'space-between';
    scale.style.fontSize = '.8rem';
    scale.style.color = '#475569';
    scale.style.marginTop = '6px';
    scale.innerHTML = <span>${(min ?? 'min')}</span><span>${unit}</span><span>${(max ?? 'max')}</span>;
    el.appendChild(scale);

    legendStack.appendChild(el);
    legends[id] = el;
  }
  function removeLegend(id) {
    if (legends[id]) {
      legends[id].remove();
      delete legends[id];
    }
  }

  // ===================== GEO-TIFF UTILS =====================
  async function getTiffStats(url) {
    try {
      const tiff = await GeoTIFF.fromUrl(url);
      const img = await tiff.getImage();
      const ras = await img.readRasters({ interleave: true, samples: [0] });
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < ras.length; i++) {
        const v = ras[i];
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      return { min, max };
    } catch (e) {
      console.warn('Gagal ambil statistik:', url, e);
      return { min: undefined, max: undefined };
    }
  }

  // ===================== RASTER LAYERS =====================
  const LAYER_DEF = {
    dem:   { url: 'Data/AspekLingkungan/DEM',        title: 'DEM (m)',          colorScale: 'terrain',   opacity: 0.7, unit: 'm'  },
    curah: { url: 'Data/AspekLingkungan/CurahHujan', title: 'Curah Hujan',      colorScale: 'rainbow',   opacity: 0.7, unit: 'mm' },
    lst:   { url: 'Data/AspekLingkungan/LST',        title: 'LST (°C)',         colorScale: 'jet',       opacity: 0.7, unit: '°C' },
    ndvi:  { url: 'Data/AspekLingkungan/NDVI',       title: 'NDVI',             colorScale: 'greengold', opacity: 0.6, unit: ''   },
    ndmi:  { url: 'Data/AspekLingkungan/NDMI',       title: 'NDMI',             colorScale: 'viridis',   opacity: 0.6, unit: ''   },
    ndwi:  { url: 'Data/AspekLingkungan/NDWI',       title: 'NDWI',             colorScale: 'blues',     opacity: 0.6, unit: ''   }
  };

  const rasterOpts = (opacity = 0.7, colorScale = 'viridis') => ({
    opacity,
    renderer: new L.LeafletGeotiff.Plotty({ colorScale })
  });

  const lyrDEM   = L.leafletGeotiff(LAYER_DEF.dem.url,   rasterOpts(LAYER_DEF.dem.opacity,   LAYER_DEF.dem.colorScale));
  const lyrCurah = L.leafletGeotiff(LAYER_DEF.curah.url, rasterOpts(LAYER_DEF.curah.opacity, LAYER_DEF.curah.colorScale));
  const lyrLST   = L.leafletGeotiff(LAYER_DEF.lst.url,   rasterOpts(LAYER_DEF.lst.opacity,   LAYER_DEF.lst.colorScale));
  const lyrNDVI  = L.leafletGeotiff(LAYER_DEF.ndvi.url,  rasterOpts(LAYER_DEF.ndvi.opacity,  LAYER_DEF.ndvi.colorScale));
  const lyrNDMI  = L.leafletGeotiff(LAYER_DEF.ndmi.url,  rasterOpts(LAYER_DEF.ndmi.opacity,  LAYER_DEF.ndmi.colorScale));
  const lyrNDWI  = L.leafletGeotiff(LAYER_DEF.ndwi.url,  rasterOpts(LAYER_DEF.ndwi.opacity,  LAYER_DEF.ndwi.colorScale));

  const mapLayers = { dem:lyrDEM, curah:lyrCurah, lst:lyrLST, ndvi:lyrNDVI, ndmi:lyrNDMI, ndwi:lyrNDWI };

  function bindRaster(id, sliderId) {
    const def = LAYER_DEF[id];
    const layer = mapLayers[id];
    const chk = document.getElementById(id);
    const slider = document.getElementById(sliderId);

    if (!chk) { console.warn('Checkbox tidak ditemukan:', id); return; }

    let stats = null;

    chk.addEventListener('change', async () => {
      if (chk.checked) {
        layer.addTo(map);
        if (!stats) stats = await getTiffStats(def.url);
        makeLegend(id, def.title, def.colorScale, stats?.min, stats?.max, def.unit);
      } else {
        map.removeLayer(layer);
        removeLegend(id);
      }
    });

    if (slider) {
      slider.addEventListener('input', () => {
        layer.setOpacity(parseFloat(slider.value));
      });
    }
  }

  bindRaster('dem',   'demOpacity');
  bindRaster('curah', 'curahOpacity');
  bindRaster('lst',   'lstOpacity');
  bindRaster('ndvi',  'ndviOpacity');
  bindRaster('ndmi',  'ndmiOpacity');
  bindRaster('ndwi',  'ndwiOpacity');

  // ===================== GEOJSON MODEL =====================
  let lyrModel2025;
  fetch('ModelPrediksi/MODEL2025.geojson')
    .then(r => r.json())
    .then(data => {
      lyrModel2025 = L.geoJSON(data, {
        style: { color: '#ef4444', weight: 2, fillOpacity: 0.15 }
      });

      const chk = document.getElementById('model2025');
      if (chk) {
        chk.addEventListener('change', () => {
          if (chk.checked) {
            lyrModel2025.addTo(map);
            try { map.fitBounds(lyrModel2025.getBounds(), { maxZoom: 11 }); } catch (e) {}
          } else {
            map.removeLayer(lyrModel2025);
          }
        });
      }
    })
    .catch(() => console.warn('MODEL2025.geojson tidak ditemukan / gagal dimuat.'));
})();
