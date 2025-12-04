# Geo Visualization Widget

An interactive D3.js geographic visualization widget that displays hierarchical location data (continents → countries → cities) on a world map. Designed for enterprise infrastructure monitoring dashboards to show datacenter or resource distribution across regions.

## Features

- 🌍 **Interactive World Map** - Rendered with D3.js using Natural Earth projection
- 📍 **Hierarchical Markers** - Three-level hierarchy: continents → countries → cities/datacenters
- 🖱️ **Rich Interactions** - Single click selection, double-click zoom, multi-select support
- 🔍 **Smart Zoom** - Automatic hierarchy level transitions based on zoom scale
- 🔄 **Smooth Animations** - Elegant transitions for zoom, pan, and marker updates
- 🎛️ **Filtering System** - Filter by region, location, and datacenter
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- ♿ **Accessible** - Keyboard navigation and ARIA labels

## Quick Start

1. Clone or download this project
2. Serve the files with a local web server:

```bash
# Using Python 3
python3 -m http.server 8080

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8080
```

3. Open `http://localhost:8080` in your browser

## Data Format

The widget expects JSON data in this structure:

```json
{
  "type": "GeoLocations",
  "GeoLocations": [
    {
      "id": "continent1",
      "label": "Asia",
      "properties": [
        { "propertyKey": "CategoryName", "propertyValue": "Region" },
        { "propertyKey": "CategoryValue", "propertyValue": "Asia" }
      ],
      "geometry": {
        "type": "Point",
        "coordinates": [100.6197, 34.0479]
      },
      "children": [
        {
          "id": "country1",
          "label": "Japan",
          "properties": [...],
          "geometry": {...},
          "children": [
            {
              "id": "city1",
              "label": "Tokyo DC",
              "properties": [...],
              "geometry": {...}
            }
          ]
        }
      ]
    }
  ]
}
```

## Usage

### Basic Initialization

```javascript
const geoWidget = new GeoMapWidget({
    container: '#geo-map-container',
    data: geoLocationData,
    height: 600,
    onMarkerClick: (location, isSelected) => {
        console.log('Selected:', location.label, isSelected);
    }
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `container` | string | `'#geo-map-container'` | CSS selector for container |
| `data` | object | required | GeoLocations data object |
| `width` | number | auto | Widget width (auto-sizes to container) |
| `height` | number | `600` | Widget height in pixels |
| `debug` | boolean | `false` | Enable debug logging |
| `maxSelections` | number | `10` | Maximum simultaneous selections |

### Event Callbacks

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onMarkerClick` | `(location, isSelected)` | Fired on single click |
| `onMarkerDoubleClick` | `(location)` | Fired on double click |
| `onSelectionChange` | `(selectedMarkers[])` | Fired when selection changes |
| `onZoomLevelChange` | `(level)` | Fired when hierarchy level changes |
| `onFilterChange` | `(filters)` | Fired when filters change |

### API Methods

```javascript
// Update data
geoWidget.updateData(newData);

// Apply filters
geoWidget.applyFilters({
    region: 'Asia',
    location: 'Japan',
    datacentre: 'All'
});

// Get current selections
const selected = geoWidget.getSelection();

// Clear selections
geoWidget.clearSelection();

// Zoom to level (1=continents, 2=countries, 3=cities)
geoWidget.zoomToLevel(1);

// Reset to initial state
geoWidget.reset();

// Destroy widget
geoWidget.destroy();
```

## Interaction Patterns

### Single Click
- Selects/deselects a marker
- Applies selected state styling (blue highlight)
- Does NOT zoom the map

### Double Click
- Zooms and pans to the clicked marker
- Reveals children at the next hierarchy level
- Parent marker fades out, children fade in

### Multi-Selection
- **Ctrl/Cmd + Click**: Add to selection
- Multi-select only works within same hierarchy level
- Attempting cross-level selection clears previous selections

### Zoom Controls
- **+/- buttons**: Zoom in/out with smooth animation
- **Mouse wheel**: Continuous zoom
- **Click and drag**: Pan the map

## File Structure

```
GeoMapWidget/
├── index.html          # Main HTML file
├── geoMap.js           # Main widget code
├── styles.css          # CSS styling
├── README.md           # Documentation
├── data/
│   └── sample-data.json    # Sample location data
└── utils/
    ├── dataProcessing.js   # Data aggregation/filtering
    ├── projection.js       # Coordinate transformation
    └── selection.js        # Multi-selection logic
```

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## Dependencies

- D3.js v7 (loaded via CDN)
- TopoJSON v3 (loaded via CDN)

## Customization

### Theming

The widget uses CSS variables for theming. Override these in your stylesheet:

```css
:root {
    --color-primary: #2563eb;
    --color-selected: #2563eb;
    --bg-map: #1a2744;
    --bg-land: #2d3a4f;
    /* ... see styles.css for all variables */
}
```

### Marker Sizes

Modify marker sizes in `geoMap.js`:

```javascript
this.markerSizes = {
    1: { outer: 36, inner: 28, icon: 16 },  // Continents
    2: { outer: 30, inner: 24, icon: 14 },  // Countries
    3: { outer: 24, inner: 18, icon: 12 }   // Cities
};
```

### Zoom Thresholds

Adjust when hierarchy levels change:

```javascript
this.zoomThresholds = {
    continent: 1,      // Default view
    country: 2.5,      // Show countries at this zoom
    city: 5            // Show cities at this zoom
};
```

## Known Limitations

- Maximum of 500 markers recommended for smooth performance
- World map data loaded from CDN (requires internet connection)
- Touch/pinch zoom not fully optimized for mobile

## License

MIT License - feel free to use in your projects.

