// 1. Inisialisasi Peta (Desa Purwosari, Tegalrejo)
const map = L.map('map').setView([-7.4750, 110.2680], 15);

// 2. Pilihan Basemap
const basemaps = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri World Imagery'
    }),
    light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO'
    })
};

let currentBasemap = basemaps.osm.addTo(map);

document.getElementById('basemapSelect').addEventListener('change', function (e) {
    map.removeLayer(currentBasemap);
    currentBasemap = basemaps[e.target.value].addTo(map);
});

// Penyimpanan Indeks Pencarian & Statistik
const searchIndex = [];
const statsData = {
    bidangCount: 0,
    bidangAreaM2: 0,
    plAreaM2: 0,
    bangunanTotal: 0,
    bangunanHunian: 0,
    bangunanNonHunian: 0,
    jalanCount: 0,
    saranaCount: 0
};

function updateStatsPanel() {
    const el = document.getElementById('statsContent');
    if (!el) return;
    const luasBidangHa = (statsData.bidangAreaM2 / 10000).toFixed(2);
    const luasPLHa = (statsData.plAreaM2 / 10000).toFixed(2);
    el.innerHTML = `
        <div><span>Total Bidang Tanah:</span><strong>${statsData.bidangCount} persil (${luasBidangHa} Ha)</strong></div>
        <div><span>Luas Penggunaan Lahan:</span><strong>${luasPLHa} Ha</strong></div>
        <div><span>Total Bangunan:</span><strong>${statsData.bangunanTotal} unit</strong></div>
        <div><span>• Bangunan Hunian:</span><strong>${statsData.bangunanHunian} unit</strong></div>
        <div><span>• Non-Hunian:</span><strong>${statsData.bangunanNonHunian} unit</strong></div>
        <div><span>Ruas Jaringan Jalan:</span><strong>${statsData.jalanCount} segmen</strong></div>
        <div><span>Titik Sarana & Toponim:</span><strong>${statsData.saranaCount} titik</strong></div>
    `;
}

// Kalkulasi Luas Geodesik Poligon (m2)
function calculatePolygonAreaM2(latlngs) {
    if (!latlngs || latlngs.length < 3) return 0;
    const R = 6378137;
    let area = 0;
    for (let i = 0; i < latlngs.length; i++) {
        const p1 = latlngs[i];
        const p2 = latlngs[(i + 1) % latlngs.length];
        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const dLon = (p2.lng - p1.lng) * Math.PI / 180;
        area += dLon * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    return Math.abs(area * R * R / 2);
}

function getFeatureAreaM2(feature, layer) {
    const props = feature.properties || {};
    const areaVal = props.LUAS || props.Luas || props.luas || props.Shape_Area || props.SHAPE_Area;
    if (areaVal && !isNaN(parseFloat(areaVal)) && parseFloat(areaVal) > 1) {
        return parseFloat(areaVal);
    }
    if (layer && layer.getLatLngs) {
        const coords = layer.getLatLngs();
        const ring = Array.isArray(coords[0][0]) ? coords[0][0] : coords[0];
        return calculatePolygonAreaM2(ring);
    }
    return 0;
}

// Fungsi Pop-up Lengkap dengan Kalkulasi Luas
function createPopupContent(title, properties, areaM2 = 0) {
    let rows = '';
    const ignoredKeys = ['FID', 'OBJECTID', 'Shape_Length', 'Id'];
    
    for (let key in properties) {
        if (properties[key] !== null && properties[key] !== '' && !ignoredKeys.includes(key)) {
            if (key === 'Shape_Area') continue;
            rows += `<tr><td>${key}</td><td>${properties[key]}</td></tr>`;
        }
    }

    if (areaM2 > 0) {
        const ha = (areaM2 / 10000).toFixed(4);
        rows += `<tr><td>Luas Terhitung</td><td><strong>${areaM2.toFixed(1)} m²</strong> (${ha} Ha)</td></tr>`;
    }

    if (rows === '') {
        rows = '<tr><td colspan="2"><em>Tidak ada keterangan atribut tambahan</em></td></tr>';
    }

    return `
        <div style="min-width: 195px;">
            <strong style="color: #064e3b; font-size: 0.92rem; display: block; margin-bottom: 4px; border-bottom: 2px solid #f59e0b; padding-bottom: 3px;">${title}</strong>
            <table class="popup-table">${rows}</table>
        </div>
    `;
}

// Konverter Esri JSON -> GeoJSON
function normalizeToGeoJSON(rawData) {
    if (rawData.type === 'FeatureCollection') return rawData;
    const features = (rawData.features || []).map(f => {
        let geometry = null;
        if (f.geometry) {
            if (f.geometry.rings) geometry = { type: 'Polygon', coordinates: f.geometry.rings };
            else if (f.geometry.paths) geometry = { type: 'MultiLineString', coordinates: f.geometry.paths };
            else if (f.geometry.x !== undefined && f.geometry.y !== undefined) geometry = { type: 'Point', coordinates: [f.geometry.x, f.geometry.y] };
        }
        return { type: 'Feature', properties: f.attributes || {}, geometry: geometry };
    });
    return { type: 'FeatureCollection', features: features };
}

// Simbologi Standar Penatagunaan Tanah (PGT)
function classifyPGT(properties) {
    const text = Object.values(properties).join(' ').toLowerCase();
    if (text.includes('sawah')) {
        return { code: 'SAWAH', label: 'Sawah', fill: '#86efac', stroke: '#16a34a' };
    }
    if (text.includes('permukiman') || text.includes('kampung') || text.includes('perumahan') || text.includes('bangunan')) {
        return { code: 'PERMUKIMAN', label: 'Permukiman', fill: '#fdba74', stroke: '#ea580c' };
    }
    if (text.includes('tegal') || text.includes('ladang') || text.includes('pertanian lahan kering')) {
        return { code: 'TEGALAN', label: 'Tegalan / Ladang', fill: '#fef08a', stroke: '#ca8a04' };
    }
    if (text.includes('kebun') || text.includes('perkebunan') || text.includes('hutan') || text.includes('semak')) {
        return { code: 'KEBUN', label: 'Kebun Campur', fill: '#22c55e', stroke: '#15803d' };
    }
    if (text.includes('sungai') || text.includes('air') || text.includes('embung') || text.includes('irigasi')) {
        return { code: 'AIR', label: 'Tubuh Air / Sungai', fill: '#7dd3fc', stroke: '#0284c7' };
    }
    if (text.includes('fasilitas') || text.includes('pendidikan') || text.includes('ibadah') || text.includes('olahraga') || text.includes('makam')) {
        return { code: 'FASILITAS', label: 'Fasilitas Umum / Sosial', fill: '#f472b6', stroke: '#db2777' };
    }
    return { code: 'KEBUN', label: 'Penggunaan Lahan Lainnya', fill: '#bbf7d0', stroke: '#15803d' };
}

// Simbologi Gradasi Zona Nilai Tanah (ZNT)
function classifyZNT(properties) {
    const text = Object.values(properties).join(' ').toLowerCase();
    const numMatch = text.match(/(\d[\d.,]*)/);
    const val = numMatch ? parseFloat(numMatch[1].replace(/[.,]/g, '')) : 0;

    if (text.includes('sangat tinggi') || text.includes('kelas 1') || val >= 1000000) {
        return { fill: '#b91c1c', stroke: '#7f1d1d' };
    }
    if (text.includes('tinggi') || text.includes('kelas 2') || (val >= 500000 && val < 1000000)) {
        return { fill: '#f87171', stroke: '#dc2626' };
    }
    if (text.includes('menengah') || text.includes('sedang') || text.includes('kelas 3') || (val >= 200000 && val < 500000)) {
        return { fill: '#fdba74', stroke: '#f97316' };
    }
    return { fill: '#fef9c3', stroke: '#eab308' };
}

// Klasifikasi Ikon Sarana & Toponim
function classifyFacility(properties) {
    const text = Object.values(properties).join(' ').toLowerCase();
    if (text.includes('kantor desa') || text.includes('balai desa') || text.includes('kelurahan') || text.includes('pemerintah')) {
        return { group: 'kantorDesa', label: 'Kantor Pemerintahan / Desa', icon: 'fa-landmark', color: '#d97706' };
    }
    if (text.includes('kantor') || text.includes('perkantoran')) {
        return { group: 'kantorBiasa', label: 'Perkantoran / Kantor Biasa', icon: 'fa-building', color: '#334155' };
    }
    if (text.includes('kesehatan') || text.includes('puskesmas') || text.includes('klinik') || text.includes('posyandu') || text.includes('bidan')) {
        return { group: 'kesehatan', label: 'Sarana Kesehatan', icon: 'fa-hospital', color: '#dc2626' };
    }
    if (text.includes('pendidikan') || text.includes('sekolah') || text.includes('sd') || text.includes('smp') || text.includes('sma') || text.includes('tk') || text.includes('paud') || text.includes('madrasah') || text.includes('mi')) {
        return { group: 'pendidikan', label: 'Sarana Pendidikan', icon: 'fa-school', color: '#2563eb' };
    }
    if (text.includes('masjid') || text.includes('mushola') || text.includes('ibadah')) {
        return { group: 'ibadah', label: 'Sarana Ibadah', icon: 'fa-mosque', color: '#10b981' };
    }
    return { group: 'lainnya', label: 'Fasilitas & Toponim', icon: 'fa-map-pin', color: '#059669' };
}

// 3. Layer Batas Administrasi Desa
let layerBatas;
fetch('data/admin_purwosari_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerBatas = L.geoJSON(data, {
            interactive: false,
            style: { color: '#065f46', weight: 2.5, dashArray: '6, 6', fillColor: '#10b981', fillOpacity: 0.04 }
        }).addTo(map);
        layerBatas.bringToBack();
        map.fitBounds(layerBatas.getBounds());
    })
    .catch(err => console.warn('Info batas admin:', err));

// 4A. Layer Penggunaan Lahan (Standar PGT)
let layerPL;
fetch('data/pl_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerPL = L.geoJSON(data, {
            style: function (feature) {
                const pgt = classifyPGT(feature.properties);
                return { color: pgt.stroke, weight: 1, fillColor: pgt.fill, fillOpacity: 0.52 };
            },
            onEachFeature: function (feature, layer) {
                const pgt = classifyPGT(feature.properties);
                feature._pgtCode = pgt.code;
                const area = getFeatureAreaM2(feature, layer);
                statsData.plAreaM2 += area;
                layer.bindPopup(createPopupContent(`Penggunaan Lahan (PGT): ${pgt.label}`, feature.properties, area));
            }
        }).addTo(map);
        layerPL.bringToBack();
        if (layerBatas) layerBatas.bringToBack();
        updateStatsPanel();
    })
    .catch(err => console.warn('Info pl_json_new:', err));

// 4B. Layer Pola Ruang Eksisting
let layerPolaRuang;
fetch('data/pola_ruang_json.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerPolaRuang = L.geoJSON(data, {
            style: function (feature) {
                const pgt = classifyPGT(feature.properties);
                return { color: pgt.stroke, weight: 1.2, fillColor: pgt.fill, fillOpacity: 0.52 };
            },
            onEachFeature: function (feature, layer) {
                const pgt = classifyPGT(feature.properties);
                feature._pgtCode = pgt.code;
                const area = getFeatureAreaM2(feature, layer);
                layer.bindPopup(createPopupContent(`Pola Ruang Eksisting: ${pgt.label}`, feature.properties, area));
            }
        });
    })
    .catch(err => console.warn('Info pola_ruang_json:', err));

// Filter Query Kelas PGT (Berlaku untuk Penggunaan Lahan & Pola Ruang)
document.getElementById('filterPGT').addEventListener('change', function (e) {
    const selected = e.target.value;
    [layerPL, layerPolaRuang].forEach(targetLayer => {
        if (!targetLayer) return;
        targetLayer.eachLayer(layer => {
            const code = layer.feature._pgtCode;
            const pgt = classifyPGT(layer.feature.properties);
            if (selected === 'ALL' || code === selected) {
                layer.setStyle({ fillOpacity: 0.55, opacity: 1, fillColor: pgt.fill });
            } else {
                layer.setStyle({ fillOpacity: 0.05, opacity: 0.15 });
            }
        });
    });
});

// 5. Layer Bidang Tanah (Persil)
let layerBidang;
fetch('data/bidang_tanah_json.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerBidang = L.geoJSON(data, {
            style: { color: '#b45309', weight: 1.3, fillColor: '#fbbf24', fillOpacity: 0.22 },
            onEachFeature: function (feature, layer) {
                const area = getFeatureAreaM2(feature, layer);
                statsData.bidangCount++;
                statsData.bidangAreaM2 += area;

                const props = feature.properties || {};
                const label = props.NIB || props.NO_HAK || props.PEMILIK || props.Nama || `Bidang #${statsData.bidangCount}`;
                searchIndex.push({
                    title: `Persil: ${label}`,
                    sub: Object.values(props).filter(Boolean).slice(0, 3).join(' • '),
                    layer: layer
                });

                layer.bindPopup(createPopupContent('Informasi Bidang Tanah', props, area));
                layer.on('mouseover', function () { this.setStyle({ fillOpacity: 0.5, weight: 2.5 }); });
                layer.on('mouseout', function () { this.setStyle({ fillOpacity: 0.22, weight: 1.3 }); });
            }
        }).addTo(map);
        updateStatsPanel();
    })
    .catch(err => console.warn('Info bidang_tanah_json:', err));

// 6. Layer Zona Nilai Tanah (ZNT)
let layerZNT;
fetch('data/znt_json.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerZNT = L.geoJSON(data, {
            style: function (feature) {
                const znt = classifyZNT(feature.properties);
                return { color: znt.stroke, weight: 1.5, fillColor: znt.fill, fillOpacity: 0.55 };
            },
            onEachFeature: function (feature, layer) {
                const area = getFeatureAreaM2(feature, layer);
                layer.bindPopup(createPopupContent('Zona Nilai Tanah (ZNT)', feature.properties, area));
            }
        });
    })
    .catch(err => console.warn('Info znt_json:', err));

// 7. Layer Jaringan Jalan
let layerJalan;
fetch('data/jalan_ln_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerJalan = L.geoJSON(data, {
            style: { color: '#ef4444', weight: 2.5 },
            onEachFeature: function (feature, layer) {
                statsData.jalanCount++;
                layer.bindPopup(createPopupContent('Jaringan Jalan', feature.properties));
            }
        }).addTo(map);
        updateStatsPanel();
    })
    .catch(err => console.warn('Info jalan:', err));

// 8. Layer Bangunan Purwosari
let layerBangunan;
fetch('data/bangunan_purwosari_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerBangunan = L.geoJSON(data, {
            style: function (feature) {
                const jenis = feature.properties.jenis_bang || feature.properties.JENIS_BANG || '';
                const isHunian = jenis.toLowerCase().includes('hunian');
                return {
                    color: isHunian ? '#d97706' : '#7c3aed',
                    weight: 1.2,
                    fillColor: isHunian ? '#f59e0b' : '#8b5cf6',
                    fillOpacity: 0.75
                };
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties || {};
                const jenis = (props.jenis_bang || props.JENIS_BANG || '').toLowerCase();
                statsData.bangunanTotal++;
                if (jenis.includes('hunian') && !jenis.includes('non')) statsData.bangunanHunian++;
                else statsData.bangunanNonHunian++;

                const area = getFeatureAreaM2(feature, layer);
                const namaBgn = props.NAMA || props.nama || props.keterangan || props.KETERANGAN;
                if (namaBgn) {
                    searchIndex.push({
                        title: `Bangunan: ${namaBgn}`,
                        sub: props.jenis_bang || props.JENIS_BANG || 'Tapak Bangunan',
                        layer: layer
                    });
                }

                layer.bindPopup(createPopupContent('Informasi Bangunan', props, area));
                layer.on('mouseover', function () { this.setStyle({ fillOpacity: 0.95, weight: 2.5 }); });
                layer.on('mouseout', function () { this.setStyle({ fillOpacity: 0.75, weight: 1.2 }); });
            }
        }).addTo(map);
        layerBangunan.bringToFront();
        updateStatsPanel();
    })
    .catch(err => console.warn('Info bangunan:', err));

// 9. Grup Layer Sarana & Toponim
const facilityGroups = {
    kantorDesa: L.layerGroup().addTo(map),
    kantorBiasa: L.layerGroup().addTo(map),
    kesehatan: L.layerGroup().addTo(map),
    pendidikan: L.layerGroup().addTo(map),
    ibadah: L.layerGroup().addTo(map),
    lainnya: L.layerGroup().addTo(map)
};

fetch('data/toponim_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        L.geoJSON(data, {
            pointToLayer: function (feature, latlng) {
                statsData.saranaCount++;
                const info = classifyFacility(feature.properties);
                const customIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="custom-pin" style="background-color: ${info.color};"><i class="fa-solid ${info.icon}"></i></div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                    popupAnchor: [0, -30]
                });
                const marker = L.marker(latlng, { icon: customIcon });
                marker.bindPopup(createPopupContent(info.label, feature.properties));
                facilityGroups[info.group].addLayer(marker);

                const namaSarana = Object.values(feature.properties || {}).filter(v => typeof v === 'string' && v.length > 2)[0] || info.label;
                searchIndex.push({
                    title: namaSarana,
                    sub: info.label,
                    layer: marker
                });

                return marker;
            }
        });
        updateStatsPanel();
    })
    .catch(err => console.warn('Info toponim:', err));

// 10. Mesin Pencarian Persil, Bangunan & Sarana
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', function (e) {
    const q = e.target.value.trim().toLowerCase();
    searchResults.innerHTML = '';
    if (q.length < 2) return;

    const matches = searchIndex.filter(item =>
        item.title.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)
    ).slice(0, 8);

    if (matches.length === 0) {
        searchResults.innerHTML = '<div class="search-item"><span>Data tidak ditemukan</span></div>';
        return;
    }

    matches.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = `<strong>${item.title}</strong><span>${item.sub}</span>`;
        div.addEventListener('click', () => {
            if (item.layer.getBounds) {
                map.fitBounds(item.layer.getBounds(), { maxZoom: 18 });
            } else if (item.layer.getLatLng) {
                map.setView(item.layer.getLatLng(), 18);
            }
            item.layer.openPopup();
            searchResults.innerHTML = '';
        });
        searchResults.appendChild(div);
    });
});

// 11. Kontrol Checkbox Layer
const toggles = [
    { id: 'layerBatas', getLayer: () => layerBatas },
    { id: 'layerBidang', getLayer: () => layerBidang },
    { id: 'layerPL', getLayer: () => layerPL },
    { id: 'layerPolaRuang', getLayer: () => layerPolaRuang },
    { id: 'layerZNT', getLayer: () => layerZNT },
    { id: 'layerBangunan', getLayer: () => layerBangunan },
    { id: 'layerJalan', getLayer: () => layerJalan },
    { id: 'layerKantorDesa', getLayer: () => facilityGroups.kantorDesa },
    { id: 'layerKantorBiasa', getLayer: () => facilityGroups.kantorBiasa },
    { id: 'layerKesehatan', getLayer: () => facilityGroups.kesehatan },
    { id: 'layerPendidikan', getLayer: () => facilityGroups.pendidikan },
    { id: 'layerIbadah', getLayer: () => facilityGroups.ibadah },
    { id: 'layerSaranaLain', getLayer: () => facilityGroups.lainnya }
];

toggles.forEach(item => {
    const checkbox = document.getElementById(item.id);
    if (!checkbox) return;
    checkbox.addEventListener('change', function (e) {
        const layer = item.getLayer();
        if (!layer) return;
        e.target.checked ? map.addLayer(layer) : map.removeLayer(layer);
    });
});

// 12. Alat Ukur Jarak & Luas Bidang Interaktif
let measureMode = null;
let measurePoints = [];
let measureLayerGroup = L.layerGroup().addTo(map);

const btnMeasureDist = document.getElementById('btnMeasureDist');
const btnMeasureArea = document.getElementById('btnMeasureArea');
const btnClearMeasure = document.getElementById('btnClearMeasure');
const measureBanner = document.getElementById('measureBanner');
const measureText = document.getElementById('measureText');

function startMeasure(mode) {
    measureMode = mode;
    measurePoints = [];
    measureLayerGroup.clearLayers();
    btnMeasureDist.classList.toggle('active', mode === 'dist');
    btnMeasureArea.classList.toggle('active', mode === 'area');
    btnClearMeasure.style.display = 'inline-flex';
    measureBanner.style.display = 'block';
    measureText.textContent = mode === 'dist'
        ? 'Mode Ukur Jarak: Klik beberapa titik di peta untuk menghitung panjang (meter).'
        : 'Mode Ukur Luas: Klik minimal 3 titik sudut bidang tanah di peta untuk menghitung luas (m²).';
}

btnMeasureDist.addEventListener('click', () => startMeasure('dist'));
btnMeasureArea.addEventListener('click', () => startMeasure('area'));
btnClearMeasure.addEventListener('click', () => {
    measureMode = null;
    measurePoints = [];
    measureLayerGroup.clearLayers();
    btnMeasureDist.classList.remove('active');
    btnMeasureArea.classList.remove('active');
    btnClearMeasure.style.display = 'none';
    measureBanner.style.display = 'none';
});

map.on('click', function (e) {
    if (!measureMode) return;
    measurePoints.push(e.latlng);
    measureLayerGroup.clearLayers();

    measurePoints.forEach(pt => {
        L.circleMarker(pt, { radius: 5, color: '#064e3b', fillColor: '#fbbf24', fillOpacity: 1 }).addTo(measureLayerGroup);
    });

    if (measureMode === 'dist' && measurePoints.length >= 2) {
        L.polyline(measurePoints, { color: '#d97706', weight: 3, dashArray: '5,5' }).addTo(measureLayerGroup);
        let totalDist = 0;
        for (let i = 1; i < measurePoints.length; i++) {
            totalDist += measurePoints[i - 1].distanceTo(measurePoints[i]);
        }
        measureText.textContent = `Hasil Ukur Jarak: ${totalDist.toFixed(2)} meter (${(totalDist / 1000).toFixed(3)} km)`;
    } else if (measureMode === 'area' && measurePoints.length >= 3) {
        L.polygon(measurePoints, { color: '#064e3b', fillColor: '#fbbf24', fillOpacity: 0.35 }).addTo(measureLayerGroup);
        const areaM2 = calculatePolygonAreaM2(measurePoints);
        measureText.textContent = `Hasil Ukur Luas Bidang: ${areaM2.toFixed(2)} m² (${(areaM2 / 10000).toFixed(4)} Ha)`;
    }
});

// 13. Toggle Sidebar
document.getElementById('toggleSidebar').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 310);
});
