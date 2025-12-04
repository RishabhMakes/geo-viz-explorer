/**
 * Test Utilities for Geo Visualization Widget
 * 
 * This file provides helper functions to test all widget features
 * from the browser console.
 */

const GeoWidgetTests = {
    widget: null,

    /**
     * Initialize test suite with widget reference
     */
    init(widget) {
        this.widget = widget;
        console.log('🧪 Test utilities initialized. Run GeoWidgetTests.runAll() to test all features.');
        return this;
    },

    /**
     * Run all tests
     */
    async runAll() {
        console.log('='.repeat(60));
        console.log('🧪 STARTING GEO WIDGET TEST SUITE');
        console.log('='.repeat(60));

        const results = {
            passed: 0,
            failed: 0,
            tests: []
        };

        // Test 1: Widget initialization
        await this.test('Widget Initialization', () => {
            return this.widget && this.widget.svg;
        }, results);

        // Test 2: Markers rendered
        await this.test('Markers Rendered', () => {
            const markers = document.querySelectorAll('.marker-group');
            return markers.length > 0;
        }, results);

        // Test 3: Single click selection
        await this.test('Single Click Selection', async () => {
            this.widget.clearSelection();
            const marker = this.widget.state.visibleMarkers[0];
            if (!marker) return false;
            
            this.widget.selectionManager.selectMarker(marker, 1, false);
            return this.widget.selectionManager.isSelected(marker.id);
        }, results);

        // Test 4: Multi-selection at same level
        await this.test('Multi-Selection Same Level', async () => {
            this.widget.clearSelection();
            const markers = this.widget.state.visibleMarkers.slice(0, 2);
            if (markers.length < 2) return false;
            
            this.widget.selectionManager.selectMarker(markers[0], 1, false);
            this.widget.selectionManager.selectMarker(markers[1], 1, true);
            
            return this.widget.selectionManager.getSelectionCount() === 2;
        }, results);

        // Test 5: Cross-level selection clears previous
        await this.test('Cross-Level Selection Clears Previous', async () => {
            this.widget.clearSelection();
            const marker = this.widget.state.visibleMarkers[0];
            if (!marker) return false;
            
            // Select at level 1
            this.widget.selectionManager.selectMarker(marker, 1, false);
            
            // Try to select at level 2 (should clear previous)
            const result = this.widget.selectionManager.selectMarker(
                { id: 'test', label: 'Test' }, 2, true
            );
            
            return this.widget.selectionManager.getSelectionLevel() === 2;
        }, results);

        // Test 6: Filters populated
        await this.test('Filters Populated', () => {
            const regionFilter = document.getElementById('regionFilter');
            return regionFilter && regionFilter.options.length > 1;
        }, results);

        // Test 7: Zoom controls exist
        await this.test('Zoom Controls Exist', () => {
            const zoomIn = document.querySelector('.zoom-in');
            const zoomOut = document.querySelector('.zoom-out');
            return zoomIn && zoomOut;
        }, results);

        // Test 8: Level indicator exists
        await this.test('Level Indicator Exists', () => {
            const indicator = document.querySelector('.level-indicator');
            return indicator && indicator.textContent.includes('Level');
        }, results);

        // Test 9: Data validation
        await this.test('Data Validation Works', () => {
            const invalidData = { GeoLocations: null };
            const result = DataProcessing.validateData(invalidData);
            return !result.isValid;
        }, results);

        // Test 10: Count aggregation
        await this.test('Count Aggregation', () => {
            const data = this.widget.originalData;
            if (!data || !data.GeoLocations || !data.GeoLocations[0]) return false;
            
            const count = DataProcessing.calculateCounts(data.GeoLocations[0]);
            return count > 0;
        }, results);

        // Test 11: Filter data processing
        await this.test('Filter Data Processing', () => {
            const filtered = DataProcessing.filterData(
                this.widget.originalData,
                { region: 'Asia' }
            );
            return filtered && filtered.GeoLocations;
        }, results);

        // Test 12: Projection coordinates
        await this.test('Projection Coordinates', () => {
            const coords = this.widget.projection([0, 0]);
            return coords && coords.length === 2 && !isNaN(coords[0]);
        }, results);

        // Test 13: Clear selection
        await this.test('Clear Selection', () => {
            this.widget.selectionManager.selectMarker(
                this.widget.state.visibleMarkers[0], 1, false
            );
            this.widget.clearSelection();
            return this.widget.selectionManager.getSelectionCount() === 0;
        }, results);

        // Test 14: Get selection API
        await this.test('Get Selection API', () => {
            const selection = this.widget.getSelection();
            return Array.isArray(selection);
        }, results);

        // Test 15: Reset function
        await this.test('Reset Function', async () => {
            this.widget.reset();
            await new Promise(r => setTimeout(r, 600));
            return this.widget.state.currentZoomLevel === 1;
        }, results);

        // Print summary
        console.log('='.repeat(60));
        console.log(`✅ PASSED: ${results.passed}/${results.tests.length}`);
        console.log(`❌ FAILED: ${results.failed}/${results.tests.length}`);
        console.log('='.repeat(60));

        if (results.failed > 0) {
            console.log('Failed tests:');
            results.tests
                .filter(t => !t.passed)
                .forEach(t => console.log(`  - ${t.name}: ${t.error || 'Failed'}`));
        }

        return results;
    },

    /**
     * Run a single test
     */
    async test(name, fn, results) {
        try {
            const passed = await fn();
            results.tests.push({ name, passed });
            
            if (passed) {
                results.passed++;
                console.log(`✅ ${name}`);
            } else {
                results.failed++;
                console.log(`❌ ${name}`);
            }
        } catch (error) {
            results.tests.push({ name, passed: false, error: error.message });
            results.failed++;
            console.log(`❌ ${name}: ${error.message}`);
        }
    },

    /**
     * Test zoom functionality
     */
    async testZoom() {
        console.log('Testing zoom...');
        
        // Zoom in
        this.widget.handleZoomIn();
        await new Promise(r => setTimeout(r, 400));
        console.log('Current zoom level:', this.widget.state.currentZoomLevel);
        
        // Zoom out
        this.widget.handleZoomOut();
        await new Promise(r => setTimeout(r, 400));
        console.log('Current zoom level:', this.widget.state.currentZoomLevel);
    },

    /**
     * Test filter functionality
     */
    testFilters() {
        console.log('Testing filters...');
        
        // Apply Asia filter
        this.widget.applyFilters({ region: 'Asia' });
        console.log('Visible markers after Asia filter:', 
            this.widget.state.visibleMarkers.length);
        
        // Reset
        this.widget.applyFilters({ region: 'All' });
        console.log('Visible markers after reset:', 
            this.widget.state.visibleMarkers.length);
    },

    /**
     * Test double-click zoom to children
     */
    async testDoubleClickZoom() {
        console.log('Testing double-click zoom...');
        
        const marker = this.widget.state.visibleMarkers[0];
        if (marker) {
            this.widget.zoomToMarkerAndRevealChildren(marker);
            await new Promise(r => setTimeout(r, 1000));
            console.log('Zoomed to:', marker.label);
            console.log('Current level:', this.widget.state.currentZoomLevel);
        }
    },

    /**
     * Stress test with rapid selections
     */
    async stressTestSelections() {
        console.log('Stress testing selections...');
        
        const markers = this.widget.state.visibleMarkers;
        let successCount = 0;
        
        for (let i = 0; i < 20; i++) {
            const marker = markers[i % markers.length];
            this.widget.selectionManager.selectMarker(marker, 1, true);
            successCount++;
        }
        
        console.log(`Completed ${successCount} rapid selections`);
        console.log('Final selection count:', 
            this.widget.selectionManager.getSelectionCount());
        
        this.widget.clearSelection();
    },

    /**
     * Print current state
     */
    printState() {
        console.log('Current Widget State:');
        console.log('- Zoom Level:', this.widget.state.currentZoomLevel);
        console.log('- Visible Markers:', this.widget.state.visibleMarkers.length);
        console.log('- Selected:', this.widget.selectionManager.getSelectionCount());
        console.log('- Filters:', this.widget.state.activeFilters);
        console.log('- Transform:', this.widget.state.zoomTransform);
    }
};

// Auto-initialize when widget is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.geoWidget) {
            GeoWidgetTests.init(window.geoWidget);
        }
    }, 2000);
});

