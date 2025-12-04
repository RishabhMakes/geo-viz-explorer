/**
 * GeoMapWidget - Interactive D3.js Geographic Visualization Widget
 * 
 * A hierarchical location visualization widget for displaying datacenter
 * or resource distribution across regions with interactive features.
 * 
 * @version 1.0.0
 * @author Geo Viz Explorer
 */

class GeoMapWidget {
    constructor(options = {}) {
        // Configuration
        this.container = options.container || '#geo-map-container';
        this.width = options.width || null;
        this.height = options.height || 600;
        this.debug = options.debug || false;
        this.maxSelections = options.maxSelections || 10;
        
        // Callbacks
        this.onMarkerClick = options.onMarkerClick || (() => {});
        this.onMarkerDoubleClick = options.onMarkerDoubleClick || (() => {});
        this.onSelectionChange = options.onSelectionChange || (() => {});
        this.onZoomLevelChange = options.onZoomLevelChange || (() => {});
        this.onFilterChange = options.onFilterChange || (() => {});
        
        // State
        this.state = {
            currentZoomLevel: 1,
            activeFilters: {
                region: 'All',
                location: 'All',
                datacentre: 'All'
            },
            visibleMarkers: [],
            zoomTransform: d3.zoomIdentity,
            isTransitioning: false,
            clickTimeout: null,
            lastClickTime: 0,
            currentParentId: null // Track which parent's children are being shown
        };
        
        // Debounce timers
        this.debounceTimers = {};
        
        // Data
        this.originalData = null;
        this.filteredData = null;
        this.worldMapData = null;
        
        // D3 elements
        this.svg = null;
        this.g = null;
        this.projection = null;
        this.path = null;
        this.zoom = null;
        this.markersGroup = null;
        
        // Selection Manager
        this.selectionManager = new SelectionManager({
            maxSelections: this.maxSelections,
            debug: this.debug,
            onSelectionChange: (selection) => {
                this.onSelectionChange(selection);
                this.updateMarkerStyles();
            }
        });
        
        // Marker sizing
        this.markerSizes = {
            1: { outer: 36, inner: 28, icon: 16 },
            2: { outer: 30, inner: 24, icon: 14 },
            3: { outer: 24, inner: 18, icon: 12 }
        };
        
        // Zoom scale thresholds for hierarchy levels
        this.zoomThresholds = {
            continent: 1,      // Default view
            country: 2.5,      // Zoom level to show countries
            city: 5            // Zoom level to show cities
        };
        
        // Initialize
        if (options.data) {
            this.init(options.data);
        }
    }

    /**
     * Logging utility
     */
    log(...args) {
        if (this.debug) {
            console.log('[GeoMapWidget]', ...args);
        }
    }

    /**
     * Debounce utility
     */
    debounce(key, fn, delay = 150) {
        if (this.debounceTimers[key]) {
            clearTimeout(this.debounceTimers[key]);
        }
        this.debounceTimers[key] = setTimeout(() => {
            fn();
            delete this.debounceTimers[key];
        }, delay);
    }

    /**
     * Throttle utility - limit execution rate
     */
    throttle(key, fn, limit = 100) {
        const now = Date.now();
        const lastRun = this.debounceTimers[`${key}_last`] || 0;
        
        if (now - lastRun >= limit) {
            this.debounceTimers[`${key}_last`] = now;
            fn();
        }
    }

    /**
     * Initialize the widget
     */
    async init(data) {
        this.log('Initializing widget...');
        
        try {
            // Store and validate data
            const validation = DataProcessing.validateData(data);
            if (!validation.isValid) {
                console.error('Data validation errors:', validation.errors);
                throw new Error('Invalid data structure');
            }
            
            this.originalData = data;
            this.filteredData = data;
            
            // Load world map data
            await this.loadWorldMap();
            
            // Initialize map
            this.initMap();
            
            // Render initial markers
            this.renderMarkers();
            
            // Populate filters
            this.populateFilters();
            
            this.log('Widget initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize widget:', error);
            this.showError('Failed to initialize map');
        }
    }

    /**
     * Load world map TopoJSON data
     */
    async loadWorldMap() {
        try {
            // Try to fetch world map data
            const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
            if (!response.ok) throw new Error('Failed to fetch world map');
            this.worldMapData = await response.json();
        } catch (error) {
            this.log('Using inline world map fallback');
            // Create a simple fallback - we'll still render markers
            this.worldMapData = null;
        }
    }

    /**
     * Initialize the D3 map
     */
    initMap() {
        const containerEl = d3.select(this.container);
        const containerNode = containerEl.node();
        
        // Get container dimensions
        const rect = containerNode.getBoundingClientRect();
        this.width = this.width || rect.width || 1200;
        this.height = rect.height || this.height;
        
        // Clear container
        containerEl.html('');
        
        // Create SVG
        this.svg = containerEl.append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('role', 'img')
            .attr('aria-label', 'Geographic distribution map');
        
        // Add defs for filters/gradients
        const defs = this.svg.append('defs');
        
        // Add glow filter for selected markers
        const filter = defs.append('filter')
            .attr('id', 'marker-glow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');
        
        filter.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');
        
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
        
        // Create main group for zoom/pan
        this.g = this.svg.append('g').attr('class', 'map-group');
        
        // Create projection
        this.projection = ProjectionUtils.createProjection(this.width, this.height, 'naturalEarth1');
        this.path = d3.geoPath().projection(this.projection);
        
        // Render base map
        this.renderBaseMap();
        
        // Create markers group
        this.markersGroup = this.g.append('g').attr('class', 'markers-group');
        
        // Setup zoom behavior
        this.setupZoom();
        
        // Add zoom controls
        this.addZoomControls();
        
        // Add level indicator
        this.addLevelIndicator();
        
        // Add tooltip
        this.addTooltip();
        
        // Handle resize
        this.setupResizeHandler();
    }

    /**
     * Render the base world map
     */
    renderBaseMap() {
        // Add ocean background
        this.g.append('rect')
            .attr('class', 'ocean')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('fill', 'var(--bg-map, #1a2744)');
        
        // Add graticule (grid lines)
        const graticule = d3.geoGraticule();
        this.g.append('path')
            .datum(graticule)
            .attr('class', 'graticule')
            .attr('d', this.path);
        
        // Render countries if world map data is available
        if (this.worldMapData) {
            const countries = topojson.feature(
                this.worldMapData,
                this.worldMapData.objects.countries
            );
            
            this.g.append('g')
                .attr('class', 'countries')
                .selectAll('path')
                .data(countries.features)
                .enter()
                .append('path')
                .attr('class', 'land')
                .attr('d', this.path);
            
            // Add country borders
            const borders = topojson.mesh(
                this.worldMapData,
                this.worldMapData.objects.countries,
                (a, b) => a !== b
            );
            
            this.g.append('path')
                .datum(borders)
                .attr('class', 'country-border')
                .attr('d', this.path);
        }
    }

    /**
     * Setup zoom behavior
     */
    setupZoom() {
        this.zoom = d3.zoom()
            .scaleExtent([1, 12])
            .on('zoom', (event) => this.handleZoom(event));
        
        this.svg.call(this.zoom);
        
        // Disable double-click zoom (we handle it manually)
        this.svg.on('dblclick.zoom', null);
    }

    /**
     * Handle zoom events
     */
    handleZoom(event) {
        const transform = event.transform;
        this.state.zoomTransform = transform;
        
        // Apply transform to main group
        this.g.attr('transform', transform);
        
        // Determine hierarchy level based on zoom scale
        const previousLevel = this.state.currentZoomLevel;
        let newLevel = 1;
        
        if (transform.k >= this.zoomThresholds.city) {
            newLevel = 3;
        } else if (transform.k >= this.zoomThresholds.country) {
            newLevel = 2;
        } else {
            newLevel = 1;
        }
        
        // Update markers if level changed
        if (newLevel !== previousLevel) {
            this.state.currentZoomLevel = newLevel;
            this.onZoomLevelChange(newLevel);
            this.updateLevelIndicator();
            
            // Transition markers for new level
            this.transitionToLevel(newLevel, previousLevel);
        }
        
        // Scale marker elements (circles and icons) inversely to zoom
        this.scaleMarkerElements(transform.k);
        
        // Scale marker labels inversely to zoom
        this.scaleMarkerLabels(transform.k);
        
        // Update zoom buttons state
        this.updateZoomButtons(transform.k);
    }

    /**
     * Scale marker labels based on zoom
     */
    scaleMarkerLabels(scale) {
        const labelScale = 1 / Math.sqrt(scale);
        this.markersGroup.selectAll('.marker-label')
            .attr('transform', function() {
                const y = parseFloat(d3.select(this).attr('data-base-y') || 0);
                return `translate(0, ${y}) scale(${labelScale})`;
            });
    }

    /**
     * Scale marker elements (circles and icons) based on zoom level
     * Keeps markers at a reasonable visual size when zooming in/out
     */
    scaleMarkerElements(scale) {
        // Calculate inverse scale factor with a minimum to prevent markers from becoming too small
        // Using sqrt for a gentler scaling curve that feels more natural
        const markerScale = 1 / Math.sqrt(scale);
        const clampedScale = Math.max(0.3, Math.min(1, markerScale));
        
        const level = this.state.currentZoomLevel;
        const baseSizes = this.markerSizes[level] || this.markerSizes[1];
        
        // Scale outer circles
        this.markersGroup.selectAll('.marker-outer')
            .attr('r', (baseSizes.outer / 2) * clampedScale);
        
        // Scale inner circles
        this.markersGroup.selectAll('.marker-inner')
            .attr('r', (baseSizes.inner / 2) * clampedScale);
        
        // Scale icons
        const iconSize = baseSizes.icon * clampedScale;
        this.markersGroup.selectAll('.marker-icon')
            .attr('transform', `translate(${-iconSize/2}, ${-iconSize/2})`)
            .select('svg')
            .attr('width', iconSize)
            .attr('height', iconSize);
        
        // Update label positions to maintain constant visual gap from marker edge
        // The gap needs to be divided by zoom scale so it appears constant after zoom transform
        const scaledMarkerRadius = (baseSizes.outer / 2) * clampedScale;
        const constantVisualGap = 14; // Desired visual gap in pixels
        const labelOffset = scaledMarkerRadius + (constantVisualGap / scale);
        this.markersGroup.selectAll('.marker-label')
            .attr('data-base-y', labelOffset);
    }

    /**
     * Transition markers to new hierarchy level
     */
    transitionToLevel(newLevel, previousLevel) {
        if (this.state.isTransitioning) return;
        
        this.log(`Transitioning from level ${previousLevel} to ${newLevel}`);
        this.state.isTransitioning = true;
        
        // For zooming out, clear parent tracking and handle smooth transition
        if (newLevel < previousLevel) {
            this.state.currentParentId = null;
            
            // Announce to screen readers
            this.announceToScreenReader(`Zoomed out to ${this.getLevelName(newLevel)} view`);
        } else {
            this.announceToScreenReader(`Zoomed in to ${this.getLevelName(newLevel)} view`);
        }
        
        // Render markers for new level with animation
        this.renderMarkers(true);
        
        setTimeout(() => {
            this.state.isTransitioning = false;
        }, 500);
    }

    /**
     * Get human-readable level name
     */
    getLevelName(level) {
        const names = { 1: 'continents', 2: 'countries', 3: 'datacenters' };
        return names[level] || 'locations';
    }

    /**
     * Announce message to screen readers
     */
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    /**
     * Render location markers based on current hierarchy level
     */
    renderMarkers(animate = false) {
        const level = this.state.currentZoomLevel;
        const data = this.filteredData;
        
        // Get nodes to display based on level and parent context
        let nodesToShow = [];
        
        if (this.state.currentParentId && level > 1) {
            // Show children of specific parent
            const children = DataProcessing.getChildrenOfNode(data, this.state.currentParentId);
            nodesToShow = children.map(child => ({
                ...child,
                _level: level,
                _count: DataProcessing.calculateCounts(child, this.state.activeFilters)
            }));
        } else {
            // Show nodes at current level
            nodesToShow = DataProcessing.getNodesAtLevel(data, level).map(node => ({
                ...node,
                _level: level,
                _count: DataProcessing.calculateCounts(node, this.state.activeFilters)
            }));
        }
        
        // Filter out nodes with invalid geometry or zero count
        nodesToShow = nodesToShow.filter(node => {
            if (!node.geometry || !node.geometry.coordinates) {
                this.log('Skipping node with invalid geometry:', node.id);
                return false;
            }
            // Validate coordinates
            const [lon, lat] = node.geometry.coordinates;
            if (!ProjectionUtils.isValidCoordinate(lon, lat)) {
                this.log('Skipping node with invalid coordinates:', node.id, [lon, lat]);
                return false;
            }
            // Allow nodes with count 0 if they have children (for navigation)
            if (node._count === 0 && (!node.children || node.children.length === 0)) return false;
            return true;
        });
        
        this.state.visibleMarkers = nodesToShow;
        
        // Handle empty state
        if (nodesToShow.length === 0) {
            this.showEmptyState();
        } else {
            this.hideEmptyState();
        }
        this.log(`Rendering ${nodesToShow.length} markers at level ${level}`);
        
        // Data join
        const markerGroups = this.markersGroup.selectAll('.marker-group')
            .data(nodesToShow, d => d.id);
        
        // Exit
        markerGroups.exit()
            .classed('exiting', true)
            .transition()
            .duration(animate ? 300 : 0)
            .style('opacity', 0)
            .remove();
        
        // Enter
        const enterGroups = markerGroups.enter()
            .append('g')
            .attr('class', 'marker-group')
            .attr('data-level', d => d._level)
            .attr('data-id', d => d.id)
            .attr('tabindex', 0)
            .attr('role', 'button')
            .attr('aria-label', d => `${d.label} with ${d._count} locations`)
            .style('opacity', animate ? 0 : 1)
            .attr('transform', d => {
                const [lon, lat] = d.geometry.coordinates;
                const [x, y] = this.projection([lon, lat]) || [0, 0];
                return `translate(${x}, ${y})`;
            });
        
        // Add marker elements
        const sizes = this.markerSizes[level] || this.markerSizes[1];
        
        // Outer circle
        enterGroups.append('circle')
            .attr('class', 'marker-outer')
            .attr('r', sizes.outer / 2);
        
        // Inner circle
        enterGroups.append('circle')
            .attr('class', 'marker-inner')
            .attr('r', sizes.inner / 2);
        
        // Icon (datacenter/server icon)
        enterGroups.append('g')
            .attr('class', 'marker-icon')
            .attr('transform', `translate(${-sizes.icon/2}, ${-sizes.icon/2})`)
            .html(this.getMarkerIcon(sizes.icon));
        
        // Label
        enterGroups.append('text')
            .attr('class', 'marker-label')
            .attr('y', sizes.outer / 2 + 16)
            .attr('data-base-y', sizes.outer / 2 + 16)
            .text(d => this.formatLabel(d.label, d._count));
        
        // Animate entrance
        if (animate) {
            enterGroups
                .classed('entering', true)
                .transition()
                .duration(500)
                .style('opacity', 1)
                .on('end', function() {
                    d3.select(this).classed('entering', false);
                });
        }
        
        // Update existing markers
        markerGroups
            .attr('transform', d => {
                const [lon, lat] = d.geometry.coordinates;
                const [x, y] = this.projection([lon, lat]) || [0, 0];
                return `translate(${x}, ${y})`;
            })
            .attr('aria-label', d => `${d.label} with ${d._count} locations`);
        
        markerGroups.select('.marker-label')
            .text(d => this.formatLabel(d.label, d._count));
        
        // Add event listeners to all markers (enter + update)
        const allMarkers = this.markersGroup.selectAll('.marker-group');
        this.setupMarkerEvents(allMarkers);
        
        // Update selection styling
        this.updateMarkerStyles();
        
        // Scale marker elements for current zoom
        this.scaleMarkerElements(this.state.zoomTransform.k);
        
        // Scale labels for current zoom
        this.scaleMarkerLabels(this.state.zoomTransform.k);
        
        // Prune invalid selections
        const visibleIds = nodesToShow.map(n => n.id);
        this.selectionManager.pruneInvalidSelections(visibleIds);
    }

    /**
     * Get SVG icon for marker
     */
    getMarkerIcon(size) {
        // Datacenter/server icon
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="4" rx="1"/>
                <rect x="4" y="10" width="16" height="4" rx="1"/>
                <rect x="4" y="16" width="16" height="4" rx="1"/>
                <circle cx="7" cy="6" r="1"/>
                <circle cx="7" cy="12" r="1"/>
                <circle cx="7" cy="18" r="1"/>
            </svg>
        `;
    }

    /**
     * Format marker label with count
     */
    formatLabel(label, count) {
        // Truncate long labels
        const maxLength = 15;
        const displayLabel = label.length > maxLength 
            ? label.substring(0, maxLength - 2) + '...'
            : label;
        
        return count !== undefined ? `${displayLabel} (${count})` : displayLabel;
    }

    /**
     * Setup event listeners for markers
     */
    setupMarkerEvents(markers) {
        const self = this;
        
        markers
            .on('click', function(event, d) {
                event.stopPropagation();
                self.handleMarkerClick(event, d, this);
            })
            .on('dblclick', function(event, d) {
                event.stopPropagation();
                event.preventDefault();
                self.handleMarkerDoubleClick(event, d, this);
            })
            .on('mouseenter', function(event, d) {
                self.handleMarkerHover(event, d, this, true);
            })
            .on('mouseleave', function(event, d) {
                self.handleMarkerHover(event, d, this, false);
            })
            .on('keydown', function(event, d) {
                if (event.key === 'Enter') {
                    self.handleMarkerClick(event, d, this);
                } else if (event.key === ' ') {
                    event.preventDefault();
                    self.handleMarkerDoubleClick(event, d, this);
                }
            });
    }

    /**
     * Handle single click on marker
     */
    handleMarkerClick(event, marker, element) {
        if (this.state.isTransitioning) return;
        
        // Clear any pending double-click timeout
        if (this.state.clickTimeout) {
            clearTimeout(this.state.clickTimeout);
            this.state.clickTimeout = null;
            // This was a double-click, let dblclick handler manage it
            return;
        }
        
        // Set timeout to distinguish from double-click
        this.state.clickTimeout = setTimeout(() => {
            this.state.clickTimeout = null;
            this.performSingleClick(event, marker, element);
        }, 250);
    }

    /**
     * Perform single click action
     */
    performSingleClick(event, marker, element) {
        // Debounce rapid clicks
        const now = Date.now();
        if (now - this.state.lastClickTime < 100) {
            this.log('Rapid click ignored');
            return;
        }
        this.state.lastClickTime = now;
        
        this.log('Single click on:', marker.label);
        
        const isMultiSelect = event.ctrlKey || event.metaKey;
        const level = this.state.currentZoomLevel;
        
        const result = this.selectionManager.toggleSelection(marker, level, isMultiSelect);
        
        this.log('Selection result:', result);
        
        // Emit callback
        this.onMarkerClick(marker, this.selectionManager.isSelected(marker.id));
    }

    /**
     * Handle double click on marker
     */
    handleMarkerDoubleClick(event, marker, element) {
        if (this.state.isTransitioning) return;
        
        // Clear single click timeout
        if (this.state.clickTimeout) {
            clearTimeout(this.state.clickTimeout);
            this.state.clickTimeout = null;
        }
        
        this.log('Double click on:', marker.label);
        
        // Check if marker has children to reveal
        const hasChildren = marker.children && marker.children.length > 0;
        
        if (!hasChildren) {
            this.log('No children to reveal');
            return;
        }
        
        // Zoom to marker and reveal children
        this.zoomToMarkerAndRevealChildren(marker);
        
        // Emit callback
        this.onMarkerDoubleClick(marker);
    }

    /**
     * Zoom to a marker and reveal its children
     */
    zoomToMarkerAndRevealChildren(marker) {
        const [lon, lat] = marker.geometry.coordinates;
        const currentLevel = this.state.currentZoomLevel;
        
        // Calculate target zoom level
        let targetScale;
        if (currentLevel === 1) {
            targetScale = this.zoomThresholds.country + 0.5;
        } else if (currentLevel === 2) {
            targetScale = this.zoomThresholds.city + 0.5;
        } else {
            // Already at deepest level
            targetScale = Math.min(this.state.zoomTransform.k * 1.5, 12);
        }
        
        // Set parent context for child rendering
        this.state.currentParentId = marker.id;
        
        // Calculate zoom transform
        const [x, y] = this.projection([lon, lat]) || [this.width / 2, this.height / 2];
        const transform = d3.zoomIdentity
            .translate(this.width / 2 - x * targetScale, this.height / 2 - y * targetScale)
            .scale(targetScale);
        
        // Animate zoom
        this.svg.transition()
            .duration(800)
            .ease(d3.easeCubicInOut)
            .call(this.zoom.transform, transform);
    }

    /**
     * Handle marker hover
     */
    handleMarkerHover(event, marker, element, isEntering) {
        const group = d3.select(element);
        
        if (isEntering) {
            group.raise(); // Bring to front
            this.showTooltip(event, marker);
        } else {
            this.hideTooltip();
        }
    }

    /**
     * Update marker visual styles based on selection
     */
    updateMarkerStyles() {
        const selectedIds = new Set(this.selectionManager.getSelectedIds());
        
        this.markersGroup.selectAll('.marker-group')
            .classed('selected', d => selectedIds.has(d.id));
    }

    /**
     * Add zoom controls to the map
     */
    addZoomControls() {
        const containerEl = d3.select(this.container);
        
        const controls = containerEl.append('div')
            .attr('class', 'zoom-controls');
        
        // Zoom in button
        controls.append('button')
            .attr('class', 'zoom-btn zoom-in')
            .attr('aria-label', 'Zoom in')
            .html('+')
            .on('click', () => this.handleZoomIn());
        
        // Zoom out button
        controls.append('button')
            .attr('class', 'zoom-btn zoom-out')
            .attr('aria-label', 'Zoom out')
            .html('−')
            .on('click', () => this.handleZoomOut());
    }

    /**
     * Handle zoom in button click
     */
    handleZoomIn() {
        const currentScale = this.state.zoomTransform.k;
        const newScale = Math.min(currentScale * 1.5, 12);
        
        this.svg.transition()
            .duration(300)
            .call(this.zoom.scaleTo, newScale);
    }

    /**
     * Handle zoom out button click
     */
    handleZoomOut() {
        const currentScale = this.state.zoomTransform.k;
        const newScale = Math.max(currentScale / 1.5, 1);
        
        // Clear parent context when zooming out
        if (newScale < this.zoomThresholds.country) {
            this.state.currentParentId = null;
        }
        
        this.svg.transition()
            .duration(300)
            .call(this.zoom.scaleTo, newScale);
    }

    /**
     * Update zoom buttons state
     */
    updateZoomButtons(scale) {
        d3.select(this.container).select('.zoom-in')
            .attr('disabled', scale >= 12 ? true : null);
        
        d3.select(this.container).select('.zoom-out')
            .attr('disabled', scale <= 1 ? true : null);
    }

    /**
     * Add level indicator
     */
    addLevelIndicator() {
        const containerEl = d3.select(this.container);
        
        containerEl.append('div')
            .attr('class', 'level-indicator')
            .html(this.getLevelIndicatorHTML());
    }

    /**
     * Update level indicator
     */
    updateLevelIndicator() {
        d3.select(this.container).select('.level-indicator')
            .html(this.getLevelIndicatorHTML());
    }

    /**
     * Get level indicator HTML
     */
    getLevelIndicatorHTML() {
        const levelNames = {
            1: 'Continents',
            2: 'Countries',
            3: 'Datacenters'
        };
        
        return `Level: <strong>${this.state.currentZoomLevel}</strong> (${levelNames[this.state.currentZoomLevel] || 'Unknown'})`;
    }

    /**
     * Add tooltip element
     */
    addTooltip() {
        d3.select(this.container).append('div')
            .attr('class', 'marker-tooltip')
            .attr('id', 'marker-tooltip');
    }

    /**
     * Show tooltip for a marker
     */
    showTooltip(event, marker) {
        const tooltip = d3.select('#marker-tooltip');
        const count = marker._count !== undefined ? marker._count : '?';
        
        tooltip.html(`
            <div class="tooltip-title">${marker.label}</div>
            <div class="tooltip-count">${count} location${count !== 1 ? 's' : ''}</div>
        `);
        
        // Position tooltip
        const containerRect = d3.select(this.container).node().getBoundingClientRect();
        const x = event.clientX - containerRect.left + 15;
        const y = event.clientY - containerRect.top - 10;
        
        tooltip
            .style('left', `${x}px`)
            .style('top', `${y}px`)
            .classed('visible', true);
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        d3.select('#marker-tooltip').classed('visible', false);
    }

    /**
     * Populate filter dropdowns
     */
    populateFilters() {
        const options = DataProcessing.extractFilterOptions(this.originalData);
        
        // Populate region filter
        const regionSelect = document.getElementById('regionFilter');
        if (regionSelect) {
            regionSelect.innerHTML = options.regions
                .map(r => `<option value="${r}">${r}</option>`)
                .join('');
        }
        
        // Populate location filter
        const locationSelect = document.getElementById('locationFilter');
        if (locationSelect) {
            locationSelect.innerHTML = options.locations
                .map(l => `<option value="${l}">${l}</option>`)
                .join('');
        }
        
        // Populate datacentre filter
        const datacentreSelect = document.getElementById('datacentreFilter');
        if (datacentreSelect) {
            datacentreSelect.innerHTML = options.datacentres
                .map(d => `<option value="${d}">${d}</option>`)
                .join('');
        }
    }

    /**
     * Apply filters to the data
     */
    applyFilters(filters) {
        this.log('Applying filters:', filters);
        
        this.state.activeFilters = { ...this.state.activeFilters, ...filters };
        
        // Filter data
        this.filteredData = DataProcessing.filterData(this.originalData, this.state.activeFilters);
        
        // Re-render markers with transition
        this.renderMarkers(true);
        
        // Emit callback
        this.onFilterChange(this.state.activeFilters);
    }

    /**
     * Handle window resize
     */
    setupResizeHandler() {
        let resizeTimeout;
        
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
    }

    /**
     * Handle resize event
     */
    handleResize() {
        const containerEl = d3.select(this.container);
        const rect = containerEl.node().getBoundingClientRect();
        
        this.width = rect.width;
        this.height = rect.height;
        
        // Update SVG viewBox
        this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
        
        // Update projection
        this.projection = ProjectionUtils.createProjection(this.width, this.height, 'naturalEarth1');
        this.path = d3.geoPath().projection(this.projection);
        
        // Re-render
        this.renderBaseMap();
        this.renderMarkers();
    }

    /**
     * Show error message
     */
    showError(message) {
        const containerEl = d3.select(this.container);
        containerEl.html(`<div class="error-message">${message}</div>`);
    }

    /**
     * Show empty state when no data matches filters
     */
    showEmptyState(message = 'No locations match the current filters') {
        // Check if empty state already exists
        const existing = d3.select(this.container).select('.empty-state');
        if (!existing.empty()) return;
        
        d3.select(this.container).append('div')
            .attr('class', 'empty-state')
            .html(`
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 12h8M12 8v8"/>
                </svg>
                <h3>No Results</h3>
                <p>${message}</p>
            `);
    }

    /**
     * Hide empty state
     */
    hideEmptyState() {
        d3.select(this.container).select('.empty-state').remove();
    }

    /**
     * Handle edge case: overlapping markers
     */
    resolveMarkerOverlaps(markers) {
        if (markers.length < 2) return markers;
        
        const minDistance = 50 / this.state.zoomTransform.k;
        
        return ProjectionUtils.resolveOverlaps(
            markers.map(m => {
                const [x, y] = this.projection(m.geometry.coordinates) || [0, 0];
                return { ...m, x, y };
            }),
            minDistance
        );
    }

    /**
     * Handle edge case: single location
     */
    handleSingleLocation() {
        if (!this.filteredData || !this.filteredData.GeoLocations) return;
        
        const totalLocations = this.filteredData.GeoLocations.length;
        
        if (totalLocations === 1) {
            const location = this.filteredData.GeoLocations[0];
            const [lon, lat] = location.geometry.coordinates;
            
            // Center on the single location
            const [x, y] = this.projection([lon, lat]) || [this.width / 2, this.height / 2];
            const transform = d3.zoomIdentity
                .translate(this.width / 2 - x, this.height / 2 - y);
            
            this.svg.transition()
                .duration(500)
                .call(this.zoom.transform, transform);
        }
    }

    // ==========================================
    // Public API Methods
    // ==========================================

    /**
     * Update data programmatically
     */
    updateData(newData) {
        this.log('Updating data...');
        
        const validation = DataProcessing.validateData(newData);
        if (!validation.isValid) {
            console.error('Data validation errors:', validation.errors);
            return false;
        }
        
        this.originalData = newData;
        this.filteredData = DataProcessing.filterData(newData, this.state.activeFilters);
        
        this.populateFilters();
        this.renderMarkers(true);
        
        return true;
    }

    /**
     * Get current selection
     */
    getSelection() {
        return this.selectionManager.getSelection();
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectionManager.clearSelection();
    }

    /**
     * Zoom to a specific level programmatically
     */
    zoomToLevel(level) {
        let targetScale;
        
        switch (level) {
            case 1:
                targetScale = 1;
                this.state.currentParentId = null;
                break;
            case 2:
                targetScale = this.zoomThresholds.country + 0.5;
                break;
            case 3:
                targetScale = this.zoomThresholds.city + 0.5;
                break;
            default:
                targetScale = 1;
        }
        
        this.svg.transition()
            .duration(500)
            .call(this.zoom.scaleTo, targetScale);
    }

    /**
     * Get current zoom level
     */
    getZoomLevel() {
        return this.state.currentZoomLevel;
    }

    /**
     * Get current filters
     */
    getFilters() {
        return { ...this.state.activeFilters };
    }

    /**
     * Reset to initial state
     */
    reset() {
        this.state.activeFilters = {
            region: 'All',
            location: 'All',
            datacentre: 'All'
        };
        this.state.currentParentId = null;
        
        this.filteredData = this.originalData;
        this.clearSelection();
        
        // Reset filters UI
        ['regionFilter', 'locationFilter', 'datacentreFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = 'All';
        });
        
        // Reset zoom
        this.svg.transition()
            .duration(500)
            .call(this.zoom.transform, d3.zoomIdentity);
        
        this.renderMarkers(true);
    }

    /**
     * Destroy the widget
     */
    destroy() {
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        
        // Clear container
        d3.select(this.container).html('');
        
        this.log('Widget destroyed');
    }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeoMapWidget;
}

