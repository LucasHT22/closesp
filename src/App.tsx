import { useState, useEffect, useRef, useCallback } from "react";
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const API_KEY = import.meta.env.VITE_ORS_KEY
const DEFAULT_CENTER = [
  parseFloat(import.meta.env.VITE_DEFAULT_LAT),
  parseFloat(import.meta.env.VITE_DEFAULT_LNG)
]
const DEFAULT_ZOOM = parseInt(import.meta.env.VITE_DEFAULT_ZOOM)

const MODES = [
  { id: 'driving-car', icon: 'C', label: 'Car' },
  { id: 'cycling-regular', icon: 'B', label: 'Bike' },
  { id: 'foot-walking', icon: 'W', label: 'Walk' },
  { id: 'driving-hgv', icon: 'B', label: 'Bus' },
]

const ZONES = [
  { range: 1200, fill: '#4ade80', stroke: '#22c55e', fillOpacity: 0.18, label: '0 - 20 min' },
  { range: 2400, fill: '#60a5fa', stroke: '#3b82f6', fillOpacity: 0.14, label: '20 - 40 min' },
  { range: 3600, fill: '#f87171', stroke: '#ef4444', fillOpacity: 0.11, label: '40 - 60 min' },
]

export default function App() {
  const mapRef = useRef(null)
  const leafletMap = useRef(null)
  const markerLayer = useRef(null)
  const isoLayer = useRef(null)

  const [mode, setMode] = useState('driving-car')
  const [coords, setCoords] = useState(null)
  const [status, setStatus] = useState({ msg: 'Click anywhere on the map', type: 'idle' })
  const [loading, setLoading] = useState(false)

  const modeRef = useRef(mode)
  modeRef.current = mode

  const fetchIsochrone = useCallback(async (lat, lng, profile) => {
    setLoading(true)
    setCoords({ lat: lat.toFixed(4), lng: lng.toFixed(4) })
    setStatus({ msg: 'Fetching isochrone...', type: 'loading' })

    markerLayer.current.clearLayers()
    isoLayer.current.clearLayers()

    L.circleMarker([lat, lng], {
      radius: 6, color: '#ffffff', weight: 2, fillColor: '#4ade80', fillOpacity: 1,
    }).addTo(markerLayer.current)

    try {
      const res = await fetch(`https://api.openrouteservice.org/v2/isochrones/${profile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': API_KEY },
        body: JSON.stringify({
          locations: [[lng, lat]],
          range: [3600, 2400, 1200],
          range_type: 'time',
          smoothing: 10,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || 'HTTP ${res.status}')
      }

      const data = await res.json()
      const features = [...data.features].sort((a, b) => b.properties.value - a.properties.value)

      features.forEach((feature, i) => {
        const zone = ZONES[i] ?? ZONES[2]
        L.geoJSON(feature, {
          style: {
            color: zone.stroke,
            weight: 1.5,
            fillColor: zone.fill,
            fillOpacity: zone.fillOpacity,
          },
        }).bindTooltip(zone.label, { sticky: true }).addTo(isoLayer.current)
      })

      const modeLabel = MODES.find(m => m.id === profile)?.label ?? profile
      setStatus({ msg: `${modeLabel} ·  ${lat.toFixed(4)}, ${lng.toFixed(4)}`, type: 'ok' })
    } catch (err) {
      setStatus({ msg: `Error: ${err.message}`, type: 'error'})
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (leafletMap.current) return

    const map = L.map(mapRef.current, { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    markerLayer.current = L.layerGroup().addTo(map)
    isoLayer.current = L.layerGroup().addTo(map)
    leafletMap.current = map

    map.on('click', (e) => {
      fetchIsochrone(e.latlng.lat, e.latlng.lng, modeRef.current)
    })
  }, [fetchIsochrone])

  const handleModeChange = (id) => {
    setMode(id)
    if (coords) {
      fetchIsochrone(parseFloat(coords.lat), parseFloat(coords.lng), id)
    }
  }

  const clearAll = () => {
    markerLayer.current?.clearLayers()
    isoLayer.current?.clearLayers()
    setCoords(null)
    setStatus({ msg: 'Click anywhere on the map', type: 'idle' })
  }

  return (
    <div className="app">
      <div ref={mapRef} className="map" />

      <aside className="panel">
        <div className="panel-header">
          <span className="panel-eyebrow">Isochrone</span>
          <h1 className="panel-title">60-min reach</h1>
        </div>

        <div className="panel-body">
          <p className="field-label">Travel mode</p>
          <div className="mode-grid">
            {MODES.map(m => (
              <button key={m.id} className={`mode-btn ${mode === m.id ? 'active' : ''}`} onClick={() => handleModeChange(mode.id)} >
                <span className="mode-icon">{m.icon}</span>
                <span className="mode-label">{m.label}</span>
              </button>
            ))}
          </div>

          <p className="field-label">Origin</p>
          <div className={`coords-box ${!coords ? 'empty' : ''}`}>
            {coords ? `${coords.lat}, ${coords.lng}` : '— click map to set —'}
          </div>

          <p className="field-label">Legend</p>
          <ul className="legend">
            {ZONES.map(z => (
              <li key={z.label} className="legend-row">
                <span className="legend-dot" style={{ background: z.fill }} />
                <span className="legend-text">{z.label}</span>
              </li>
            ))}
          </ul>

          <button className="clear-btn" onClick={clearAll}>Clear</button>
        </div>
      </aside>

      <div className={`status-bar ${loading ? 'loading' : status.type === 'error' ? 'error' : ''}`}>
        {loading ? 'Loading...' : status.msg}
      </div>
    </div>
  )
}