// Shared map engine for index.html (editable) and view.html (read-only).
// Both pages call initBuildingMap({ editable }) after loading maplibre-gl and
// this file — that single flag is the only thing that differs between them:
// the suggest-a-year popup form, its /suggest network calls, and a couple of
// wording tweaks. Everything else (layers, colors, popup, hover) is common,
// so edit it here once instead of in both files.

function initBuildingMap({ editable }) {
  // year to use for coloring: exact year if known, else estimated midpoint
  const YEAR_EXPR = ['coalesce', ['get', 'year_built'], ['get', 'year_est']];

  const COLOR_STOPS = [
    1880, '#7b2d98',
    1950, '#214e91',
    2020, '#d6c41d',
  ];
  // no-data buildings need a different grey depending on theme so they stay
  // visible against either background — dark theme is the default
  const NO_DATA_COLORS = { dark: '#2f2f2f', light: '#c6c6c6' };
  const MAP_BACKGROUND = { dark: '#000000', light: '#eef0f2' };
  let theme = 'dark';

  // whether a building counts as "on" for the current year filter: always
  // true with no bounds (fromYear/toYear both null), otherwise it needs a
  // year AND that year must fall within [fromYear, toYear] (either bound can
  // be omitted independently). Buildings that don't match are never hidden —
  // they're just recolored/dimmed exactly like no-data buildings already
  // are, via the same expressions below.
  function yearMatchExpr(fromYear, toYear) {
    const clauses = [['!=', YEAR_EXPR, null]];
    if (fromYear !== null) clauses.push(['>=', YEAR_EXPR, fromYear]);
    if (toYear !== null) clauses.push(['<=', YEAR_EXPR, toYear]);
    return clauses.length === 1 ? clauses[0] : ['all', ...clauses];
  }
  function colorExpr(fromYear, toYear) {
    return ['case', yearMatchExpr(fromYear, toYear), ['interpolate', ['linear'], YEAR_EXPR, ...COLOR_STOPS], NO_DATA_COLORS[theme]];
  }
  // known/estimated years render identically — the popup's ~ prefix and
  // confidence badge are what signal an estimate, not a dimmer building
  function fillOpacityExpr(fromYear, toYear) {
    return ['case', yearMatchExpr(fromYear, toYear), 0.88, 0.15];
  }
  function glowOpacityExpr(fromYear, toYear) {
    return ['case', yearMatchExpr(fromYear, toYear), 0.35, 0];
  }
  function edgeOpacityExpr(fromYear, toYear) {
    return ['case', yearMatchExpr(fromYear, toYear), 0.95, 0.12];
  }

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {},
      layers: [{
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#000000' }
      }]
    },
    center: [44.5136, 40.1872],
    zoom: 13
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');

  map.on('load', () => {
    const themeToggle = document.getElementById('theme-toggle');
    let refreshBuildingPaint = null; // set once the buildings layers exist, below

    function applyTheme() {
      document.documentElement.dataset.theme = theme;
      map.setPaintProperty('background', 'background-color', MAP_BACKGROUND[theme]);
      if (refreshBuildingPaint) refreshBuildingPaint();
    }

    themeToggle.addEventListener('change', () => {
      theme = themeToggle.checked ? 'light' : 'dark';
      applyTheme();
    });
    applyTheme();

    fetch('buildings.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — run fetch_buildings.py first`);
        return r.json();
      })
      .then(geojson => {
        document.getElementById('loader').style.display = 'none';
        document.getElementById('stats').style.display = 'block';

        // confidence isn't sent over the wire (see fetch_buildings.py) — it's
        // fully derivable from year_built/year_est/year_tag, so reconstruct
        // it once here and the rest of the code reads it as before
        function deriveConfidence(p) {
          if (p.year_tag === 'suggested') return 'suggested';
          if (p.year_built !== null && p.year_built !== undefined) return 'known';
          if (p.year_est !== null && p.year_est !== undefined) return 'inferred';
          return null;
        }
        for (const f of geojson.features) f.properties.confidence = deriveConfidence(f.properties);

        const fmt = n => n.toLocaleString();
        function updateStats() {
          const props = geojson.features.map(f => f.properties);
          const known     = props.filter(p => p.confidence === 'known').length;
          const suggested = props.filter(p => p.confidence === 'suggested').length;
          const inferred  = props.filter(p => p.confidence === 'inferred').length;
          const unknown   = props.length - known - suggested - inferred;

          document.getElementById('s-known').textContent     = fmt(known);
          document.getElementById('s-suggested').textContent = fmt(suggested);
          document.getElementById('s-inferred').textContent  = fmt(inferred);
          document.getElementById('s-unknown').textContent   = fmt(unknown);
        }
        updateStats();

        map.addSource('buildings', {
          type: 'geojson',
          data: geojson,
          generateId: true
        });

        map.addLayer({
          id: 'buildings-fill',
          type: 'fill',
          source: 'buildings',
          paint: {
            'fill-color': colorExpr(null, null),
            'fill-opacity': fillOpacityExpr(null, null)
          }
        });

        // wide blurred line = glow halo
        map.addLayer({
          id: 'buildings-glow',
          type: 'line',
          source: 'buildings',
          paint: {
            'line-color': colorExpr(null, null),
            'line-width': 4,
            'line-blur': 6,
            'line-opacity': glowOpacityExpr(null, null)
          }
        });

        // tight bright edge
        map.addLayer({
          id: 'buildings-edge',
          type: 'line',
          source: 'buildings',
          paint: {
            'line-color': colorExpr(null, null),
            'line-width': 0.8,
            'line-opacity': edgeOpacityExpr(null, null)
          }
        });

        // hover border — wide blurred white glow
        map.addLayer({
          id: 'buildings-hover-glow',
          type: 'line',
          source: 'buildings',
          paint: {
            'line-color': '#ffffff',
            'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 6, 0],
            'line-blur':  4,
            'line-opacity': 0.45
          }
        });

        // hover border — sharp bright edge
        map.addLayer({
          id: 'buildings-hover-edge',
          type: 'line',
          source: 'buildings',
          paint: {
            'line-color': '#ffffff',
            'line-width':   ['case', ['boolean', ['feature-state', 'hover'], false], 1.5, 0],
            'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0]
          }
        });

        // ── year filter — historical snapshot ───────────────────────────────────
        // a two-sided range: buildings outside [from, to] grey out the same
        // way no-data buildings already render — nothing is ever hidden,
        // only recolored. Either bound can be left blank. Two number fields
        // and a dual-handle slider (two overlaid native <input type=range>,
        // see map.css) both drive the same state and stay in sync, so people
        // who'd rather type a year than drag a handle can just do that.
        const fromInput = document.getElementById('year-filter-from');
        const toInput = document.getElementById('year-filter-to');
        const rangeMin = document.getElementById('year-range-min');
        const rangeMax = document.getElementById('year-range-max');
        const rangeFill = document.getElementById('year-range-fill');

        const dataYears = geojson.features
          .map(f => f.properties.year_built ?? f.properties.year_est)
          .filter(y => y !== null && y !== undefined);
        const dataMinYear = dataYears.length ? Math.min(...dataYears) : 1800;
        const dataMaxYear = dataYears.length ? Math.max(...dataYears) : new Date().getFullYear();

        rangeMin.min = rangeMax.min = dataMinYear;
        rangeMin.max = rangeMax.max = dataMaxYear;
        rangeMin.value = dataMinYear;
        rangeMax.value = dataMaxYear;
        fromInput.placeholder = `${dataMinYear}`;
        toInput.placeholder = `${dataMaxYear}`;

        function parseYearOr(input, fallback) {
          const v = parseInt(input.value, 10);
          return Number.isFinite(v) ? Math.max(dataMinYear, Math.min(v, dataMaxYear)) : fallback;
        }

        function updateRangeFill() {
          const span = dataMaxYear - dataMinYear || 1;
          const lo = Math.min(+rangeMin.value, +rangeMax.value);
          const hi = Math.max(+rangeMin.value, +rangeMax.value);
          rangeFill.style.left = `${((lo - dataMinYear) / span) * 100}%`;
          rangeFill.style.width = `${((hi - lo) / span) * 100}%`;
        }
        updateRangeFill();

        refreshBuildingPaint = function () {
          const fromYear = parseYearOr(fromInput, null);
          const toYear = parseYearOr(toInput, null);

          map.setPaintProperty('buildings-fill', 'fill-color', colorExpr(fromYear, toYear));
          map.setPaintProperty('buildings-fill', 'fill-opacity', fillOpacityExpr(fromYear, toYear));
          map.setPaintProperty('buildings-glow', 'line-color', colorExpr(fromYear, toYear));
          map.setPaintProperty('buildings-glow', 'line-opacity', glowOpacityExpr(fromYear, toYear));
          map.setPaintProperty('buildings-edge', 'line-color', colorExpr(fromYear, toYear));
          map.setPaintProperty('buildings-edge', 'line-opacity', edgeOpacityExpr(fromYear, toYear));
        };

        function syncFromSliders() {
          fromInput.value = rangeMin.value;
          toInput.value = rangeMax.value;
          updateRangeFill();
          refreshBuildingPaint();
        }
        function syncFromInputs() {
          rangeMin.value = parseYearOr(fromInput, dataMinYear);
          rangeMax.value = parseYearOr(toInput, dataMaxYear);
          updateRangeFill();
          refreshBuildingPaint();
        }

        rangeMin.addEventListener('input', () => {
          if (+rangeMin.value > +rangeMax.value) rangeMin.value = rangeMax.value;
          syncFromSliders();
        });
        rangeMax.addEventListener('input', () => {
          if (+rangeMax.value < +rangeMin.value) rangeMax.value = rangeMin.value;
          syncFromSliders();
        });
        fromInput.addEventListener('input', syncFromInputs);
        toInput.addEventListener('input', syncFromInputs);

        // ── popup ────────────────────────────────────────────────────────────
        function popupHTML(p, lngLat) {
          const isApproxSuggestion = p.confidence === 'suggested' &&
            (p.year_built === null || p.year_built === undefined);
          const suggestedLabel = editable ? 'Your suggestion' : 'Manually confirmed';

          let yearHTML, confHTML;
          if (p.confidence === 'suggested' && isApproxSuggestion) {
            yearHTML = `<div class="p-year" style="color:inherit">~${p.year_est}</div>`;
            confHTML = `<div class="p-conf suggested">✎ ${suggestedLabel} · approx</div>`;
          } else if (p.confidence === 'suggested') {
            yearHTML = `<div class="p-year">${p.year_built}</div>`;
            confHTML = `<div class="p-conf suggested">✎ ${suggestedLabel}</div>`;
          } else if (p.year_built !== null && p.year_built !== undefined) {
            yearHTML = `<div class="p-year">${p.year_built}</div>`;
            confHTML = `<div class="p-conf known">✓ Confirmed (${p.year_tag || 'OSM'})</div>`;
          } else if (p.year_est !== null && p.year_est !== undefined) {
            confHTML = `<div class="p-conf inferred">≈ Inferred · ~${p.year_est}</div>`;
            yearHTML = `<div class="p-year" style="color:inherit">~${p.year_est}</div>`;
          } else {
            yearHTML = `<div class="p-year no-data">—</div>`;
            confHTML = `<div class="p-conf none">No year data</div>`;
          }

          const nameHTML = p.name ? `<div class="p-name">${p.name}</div>` : '';
          const addr     = [p.addr_street, p.addr_number].filter(Boolean).join(' ');
          const addrHTML = addr ? `<div class="p-addr">${addr}</div>` : '';

          const gmaps = `https://www.google.com/maps?q=${lngLat.lat.toFixed(6)},${lngLat.lng.toFixed(6)}`;

          let suggestHTML = '';
          if (editable) {
            // prefilled with the current suggestion, else the inferred estimate as a starting guess
            const prefill = p.confidence === 'suggested' ? (isApproxSuggestion ? p.year_est : p.year_built)
                           : (p.year_est ?? '');
            const approxChecked = isApproxSuggestion ? 'checked' : '';
            const clearBtn = p.confidence === 'suggested'
              ? `<button class="p-suggest-clear" type="button">Clear</button>` : '';
            suggestHTML = `
              <div class="p-suggest">
                <input class="p-suggest-input" type="number" min="1" max="2030"
                       placeholder="year" value="${prefill}">
                <label class="p-suggest-approx">
                  <input type="checkbox" class="p-suggest-approx-cb" ${approxChecked}> ~ approx
                </label>
                <button class="p-suggest-save" type="button">Suggest year</button>
                ${clearBtn}
                <div class="p-suggest-msg"></div>
              </div>`;
          }

          return `${yearHTML}${confHTML}${nameHTML}${addrHTML}${suggestHTML}
                  <a class="p-gmaps" href="${gmaps}" target="_blank">Open in Google Maps ↗</a>`;
        }

        // POST a suggested year (or null to clear) to the local save server.
        // Requires running `python server.py` — a plain static server has no /suggest route.
        async function postSuggestion(id, year, approx) {
          const res = await fetch('/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, year, approx })
          });
          if (!res.ok) throw new Error(`save failed (HTTP ${res.status}) — is server.py running?`);
          return res.json();
        }

        // apply a freshly-saved suggestion to the in-memory data so the map
        // recolors immediately, without waiting for the next fetch_buildings.py run.
        // an approximate suggestion is stored like an inferred estimate (year_est,
        // ~ prefix) rather than a confirmed exact year (year_built).
        function applySuggestionLocally(id, year, approx) {
          const feature = geojson.features.find(f => f.properties.id === id);
          if (!feature) return;
          feature.properties.confidence = 'suggested';
          feature.properties.year_tag = 'suggested';
          if (approx) {
            feature.properties.year_built = null;
            feature.properties.year_est = year;
          } else {
            feature.properties.year_built = year;
            feature.properties.year_est = null;
          }
          map.getSource('buildings').setData(geojson);
          updateStats();
        }

        function wireSuggestForm(feat) {
          const el = popup.getElement();
          if (!el) return;
          const input     = el.querySelector('.p-suggest-input');
          const approxCb  = el.querySelector('.p-suggest-approx-cb');
          const saveBtn   = el.querySelector('.p-suggest-save');
          const clearBtn  = el.querySelector('.p-suggest-clear');
          const msg       = el.querySelector('.p-suggest-msg');
          const id        = feat.properties.id;

          saveBtn.addEventListener('click', async () => {
            const year = parseInt(input.value, 10);
            if (!year || year < 1 || year > 2030) {
              msg.textContent = 'Enter a year between 1–2030';
              return;
            }
            const approx = approxCb.checked;
            msg.textContent = 'Saving…';
            try {
              await postSuggestion(id, year, approx);
              applySuggestionLocally(id, year, approx);
              msg.textContent = 'Saved ✓';
            } catch (err) {
              msg.textContent = err.message;
            }
          });

          if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
              msg.textContent = 'Clearing…';
              try {
                await postSuggestion(id, null, false);
                msg.textContent = 'Cleared — re-run fetch_buildings.py to refresh this building';
              } catch (err) {
                msg.textContent = err.message;
              }
            });
          }
        }

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: false,
          maxWidth: '260px',
          offset: 8
        });

        // hover — border only, no popup
        let hoveredId = null;
        map.on('mousemove', 'buildings-fill', e => {
          map.getCanvas().style.cursor = 'pointer';
          const id = e.features[0].id;
          if (hoveredId === id) return;
          if (hoveredId !== null)
            map.setFeatureState({ source: 'buildings', id: hoveredId }, { hover: false });
          hoveredId = id;
          map.setFeatureState({ source: 'buildings', id: hoveredId }, { hover: true });
        });

        map.on('mouseleave', 'buildings-fill', () => {
          map.getCanvas().style.cursor = '';
          if (hoveredId !== null)
            map.setFeatureState({ source: 'buildings', id: hoveredId }, { hover: false });
          hoveredId = null;
        });

        // click — show popup
        map.on('click', 'buildings-fill', e => {
          const feat = e.features[0];
          popup
            .setLngLat(e.lngLat)
            .setHTML(popupHTML(feat.properties, e.lngLat))
            .addTo(map);
          if (editable) wireSuggestForm(feat);
        });

        // click on empty map — close popup
        map.on('click', e => {
          const hits = map.queryRenderedFeatures(e.point, { layers: ['buildings-fill'] });
          if (!hits.length) popup.remove();
        });
      })
      .catch(err => {
        const hint = editable
          ? `<p>Run: <code style="background:#333;padding:2px 6px;border-radius:4px">
             python fetch_buildings.py</code> then refresh</p>`
          : '';
        document.getElementById('loader').innerHTML =
          `<div style="color:#f88;font-size:15px">⚠ ${err.message}</div>${hint}`;
      });
  });
}
