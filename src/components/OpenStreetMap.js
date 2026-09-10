import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// The page itself is built exactly once and never changes — Leaflet and the
// tiles load a single time. Every subsequent point update is pushed in via
// injectJavaScript (window.updateMap), which just moves markers and extends
// polylines on the already-running map. Previously the whole HTML string was
// rebuilt on every GPS update and handed to the WebView as a new `source`,
// which forces a full page reload each time — with GPS now firing roughly
// once a second, that meant a full reload (and a visible flicker) every
// second. This is what that fixes.
const STATIC_HTML = `<!doctype html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html,body,#map{margin:0;width:100%;height:100%;background:#e8f0ff}.leaflet-control-attribution{font-size:9px}
  .site-pin{width:30px;height:30px;display:flex;align-items:center;justify-content:center}
  .site-pin svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))}
  .live-dot{width:18px;height:18px;border-radius:50%;background:#E5484D;border:3px solid #fff;box-shadow:0 0 0 2px #E5484D,0 1px 4px rgba(0,0,0,0.5)}
  </style>
</head><body><div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    let map = null;
    let liveMarker = null;
    let outboundLine = null, outboundStartMarker = null, siteMarker = null;
    let inboundLine = null, inboundStartMarker = null, inboundEndMarker = null;
    let hasFitBounds = false;
    const DEFAULT_CENTER = [20.5937, 78.9629];

    function ensureMap(center) {
      if (map) return;
      map = L.map('map', { zoomControl: true, attributionControl: true }).setView(center, 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '${OSM_ATTRIBUTION}' }).addTo(map);
    }

    function sitePinIcon() {
      const svg = '<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.7 23.3 0 15 0z" fill="#FF7A00"/>' +
        '<circle cx="15" cy="15" r="6" fill="#fff"/></svg>';
      return L.divIcon({ className: 'site-pin', html: svg, iconSize: [30, 38], iconAnchor: [15, 38], popupAnchor: [0, -34] });
    }

    // Called repeatedly (roughly once a second while a trip is live) with
    // the latest snapshot. Never recreates the map — only ever moves
    // existing markers / extends existing polylines, or creates them once
    // the first time real data shows up.
    window.updateMap = function (data) {
      const center = data.center;
      const outbound = data.outbound || [];
      const inbound = data.inbound || [];
      const live = !!data.live;

      const initialCenter = center || outbound[0] || inbound[0] || DEFAULT_CENTER;
      ensureMap(initialCenter);

      if (live && center) {
        if (!liveMarker) {
          const liveIcon = L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
          liveMarker = L.marker(center, { icon: liveIcon, zIndexOffset: 1000 }).bindPopup('Current location').addTo(map);
        } else {
          liveMarker.setLatLng(center);
        }
      }

      if (outbound.length > 0) {
        if (!outboundLine) {
          outboundLine = L.polyline(outbound, { color: '#0B5FFF', weight: 5, opacity: 0.9 }).addTo(map);
          outboundStartMarker = L.circleMarker(outbound[0], { radius: 7, color: '#0B5FFF', fillColor: '#0B5FFF', fillOpacity: 1, weight: 2 })
            .bindPopup('Outbound start').addTo(map);
        } else {
          outboundLine.setLatLngs(outbound);
        }
        const sitePoint = outbound[outbound.length - 1];
        if (!siteMarker) {
          siteMarker = L.marker(sitePoint, { icon: sitePinIcon(), zIndexOffset: 900 }).bindPopup('Site reached').addTo(map);
        } else {
          siteMarker.setLatLng(sitePoint);
        }
      }

      if (inbound.length > 0) {
        if (!inboundLine) {
          inboundLine = L.polyline(inbound, { color: '#1FAA59', weight: 5, opacity: 0.9 }).addTo(map);
          inboundStartMarker = L.circleMarker(inbound[0], { radius: 7, color: '#1FAA59', fillColor: '#1FAA59', fillOpacity: 1, weight: 2 })
            .bindPopup('Return start').addTo(map);
        } else {
          inboundLine.setLatLngs(inbound);
        }
        if (inbound.length > 1) {
          const endPoint = inbound[inbound.length - 1];
          if (!inboundEndMarker) {
            inboundEndMarker = L.circleMarker(endPoint, { radius: 7, color: '#1FAA59', fillColor: '#1FAA59', fillOpacity: 1, weight: 2 })
              .bindPopup('Return end').addTo(map);
          } else {
            inboundEndMarker.setLatLng(endPoint);
          }
        }
      }

      // Frame the whole route once, the first time there's enough to frame —
      // then leave the user free to pan/zoom without the map yanking back
      // underneath them on every update.
      if (!hasFitBounds) {
        const bounds = [initialCenter, ...outbound, ...inbound];
        if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
          hasFitBounds = true;
        }
      }
    };
  </script>
</body></html>`;

export default function OpenStreetMap({ center, outboundPoints = [], returnPoints = [], live = true }) {
  const webViewRef = useRef(null);
  const readyRef = useRef(false);

  const payload = useMemo(
    () => ({
      center: center ? [center.latitude, center.longitude] : null,
      outbound: outboundPoints.map((p) => [p.latitude, p.longitude]),
      inbound: returnPoints.map((p) => [p.latitude, p.longitude]),
      live: !!live,
    }),
    [center, outboundPoints, returnPoints, live]
  );

  useEffect(() => {
    if (readyRef.current && webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
    }
  }, [payload]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: STATIC_HTML }}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
        onLoadEnd={() => {
          readyRef.current = true;
          webViewRef.current?.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#E8F0FF' },
});
