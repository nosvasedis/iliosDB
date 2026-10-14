import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// leaflet.markercluster is a UMD plugin that extends the global `L`; expose it before the plugin loads.
(window as unknown as { L: typeof L }).L = L;

export { L };
