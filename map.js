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

// Fungsi membuat tabel pop-up otomatis dari atribut
function createPopupContent(title, properties) {
    let rows = '';
    const ignoredKeys = ['FID', 'OBJECTID', 'Shape_Length', 'Shape_Area', 'Id'];
    
    for (let key in properties) {
        if (properties[key] !== null && properties[key] !== '' && !ignoredKeys.includes(key)) {
            rows += `<tr><td>${key}</td><td>${properties[key]}</td></tr>`;
        }
    }

    if (rows === '') {
        rows = '<tr><td colspan="2"><em>Tidak ada keterangan atribut tambahan</em></td></tr>';
    }

    return `
        <div style="min-width: 180px;">
            <strong style="color: #064e3b; font-size: 0.92rem; display: block; margin-bottom: 4px;">${title}</strong>
            <table class="popup-table">${rows}</table>
        </div>
    `;
}

// Konverter otomatis jika file dari ArcGIS masih berupa Esri JSON
function normalizeToGeoJSON(rawData) {
    if (rawData.type === 'FeatureCollection') {
        return rawData;
    }
    const features = (rawData.features || []).map(f => {
        let geometry = null;
        if (f.geometry) {
            if (f.geometry.rings) {
                geometry = { type: 'Polygon', coordinates: f.geometry.rings };
            } else if (f.geometry.paths) {
                geometry = { type: 'MultiLineString', coordinates: f.geometry.paths };
            } else if (f.geometry.x !== undefined && f.geometry.y !== undefined) {
                geometry = { type: 'Point', coordinates: [f.geometry.x, f.geometry.y] };
            }
        }
        return {
            type: 'Feature',
            properties: f.attributes || {},
            geometry: geometry
        };
    });
    return { type: 'FeatureCollection', features: features };
}

// Fungsi mengklasifikasikan sarana dan memberikan ikon + warna
function classifyFacility(properties) {
    const text = Object.values(properties).join(' ').toLowerCase();

    if (text.includes('kantor desa') || text.includes('balai desa') || text.includes('kelurahan') || text.includes('pemerintah')) {
        return { group: 'kantorDesa', label: 'Kantor Pemerintahan / Desa', icon: 'fa-landmark', color: '#d97706' };
    } 
    if (text.includes('kantor') || text.includes('perkantoran')) {
        return { group: 'kantorBiasa', label: 'Perkantoran / Kantor Biasa', icon: 'fa-building', color: '#334155' };
    } 
    if (text.includes('kesehatan') || text.includes('puskesmas') || text.includes('klinik') || text.includes('posyandu') || text.includes('bidan') || text.includes('rumah sakit')) {
        return { group: 'kesehatan', label: 'Sarana Kesehatan', icon: 'fa-hospital', color: '#dc2626' };
    } 
    if (text.includes('pendidikan') || text.includes('sekolah') || text.includes('sd') || text.includes('smp') || text.includes('sma') || text.includes('tk') || text.includes('paud') || text.includes('madrasah') || text.includes('mi')) {
        return { group: 'pendidikan', label: 'Sarana Pendidikan', icon: 'fa-school', color: '#2563eb' };
    } 
    if (text.includes('masjid') || text.includes('mushola') || text.includes('ibadah')) {
        return { group: 'ibadah', label: 'Sarana Ibadah', icon: 'fa-mosque', color: '#10b981' };
    } 
    if (text.includes('lapangan') || text.includes('olahraga') || text.includes('taman')) {
        return { group: 'lainnya', label: 'Fasilitas Olahraga / RTH', icon: 'fa-futbol', color: '#16a34a' };
    } 
    if (text.includes('toko') || text.includes('pasar') || text.includes('warung') || text.includes('ekonomi') || text.includes('perdagangan')) {
        return { group: 'lainnya', label: 'Fasilitas Perdagangan', icon: 'fa-store', color: '#7c3aed' };
    }

    return { group: 'lainnya', label: 'Fasilitas & Toponim', icon: 'fa-map-pin', color: '#059669' };
}

// 3. Layer Batas Desa Purwosari
let layerBatas;
fetch('data/admin_purwosari_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerBatas = L.geoJSON(data, {
            interactive: false,
            style: {
                color: '#065f46',
                weight: 2.5,
                dashArray: '6, 6',
                fillColor: '#10b981',
                fillOpacity: 0.05
            }
        }).addTo(map);

        layerBatas.bringToBack();
        map.fitBounds(layerBatas.getBounds());
    })
    .catch(err => console.error('Gagal memuat admin_purwosari_json_new.json:', err));

// 4. Layer Penggunaan Lahan
let layerPL;
fetch('data/pl_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerPL = L.geoJSON(data, {
            style: {
                color: '#16a34a',
                weight: 1,
                fillColor: '#4ade80',
                fillOpacity: 0.3
            },
            onEachFeature: function (feature, layer) {
                layer.bindPopup(createPopupContent('Penggunaan Lahan', feature.properties));
            }
        }).addTo(map);
        
        layerPL.bringToBack();
    })
    .catch(err => console.error('Gagal memuat pl_json_new.json:', err));

// 5. Layer Jaringan Jalan
let layerJalan;
fetch('data/jalan_ln_json_new.json')
    .then(res => res.json())
    .then(raw => {
        const data = normalizeToGeoJSON(raw);
        layerJalan = L.geoJSON(data, {
            style: {
                color: '#ef4444',
                weight: 2.5
            },
            onEachFeature: function (feature, layer) {
                layer.bindPopup(createPopupContent('Jaringan Jalan', feature.properties));
            }
        }).addTo(map);
    })
    .catch(err => console.error('Gagal memuat jalan_ln_json_new.json:', err));

// 6. Layer Bangunan Purwosari
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
                layer.bindPopup(createPopupContent('Informasi Bangunan', feature.properties));
                layer.on('mouseover', function () {
                    this.setStyle({ fillOpacity: 0.95, weight: 2.5 });
                });
                layer.on('mouseout', function () {
                    this.setStyle({ fillOpacity: 0.75, weight: 1.2 });
                });
            }
        }).addTo(map);
        
        layerBangunan.bringToFront();
    })
    .catch(err => console.error('Gagal memuat bangunan_purwosari_json_new.json:', err));

// 7. Grup Layer Sarana & Toponim (Dipisah per kategori)
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
                return marker;
            }
        });
    })
    .catch(err => console.error('Gagal memuat toponim_json_new.json:', err));

// 8. Kontrol Checkbox Sidebar (Termasuk per Sarana)
const toggles = [
    { id: 'layerBatas', getLayer: () => layerBatas },
    { id: 'layerPL', getLayer: () => layerPL },
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

// 9. Toggle Sidebar
document.getElementById('toggleSidebar').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 310);
});
