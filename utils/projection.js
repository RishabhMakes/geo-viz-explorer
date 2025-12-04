/**
 * Projection Utilities for Geo Visualization Widget
 * Handles coordinate transformation and projection calculations
 */

const ProjectionUtils = {
    /**
     * Create a D3 projection configured for the container
     * @param {number} width - Container width
     * @param {number} height - Container height
     * @param {string} type - Projection type ('naturalEarth1', 'mercator', 'equirectangular')
     * @returns {Object} - D3 projection
     */
    createProjection(width, height, type = 'naturalEarth1') {
        let projection;
        
        switch (type) {
            case 'mercator':
                projection = d3.geoMercator();
                break;
            case 'equirectangular':
                projection = d3.geoEquirectangular();
                break;
            case 'naturalEarth1':
            default:
                projection = d3.geoNaturalEarth1();
                break;
        }
        
        // Configure projection to fit container
        projection
            .scale(width / 5.5)
            .translate([width / 2, height / 2]);
        
        return projection;
    },

    /**
     * Project geo coordinates [longitude, latitude] to screen coordinates [x, y]
     * @param {Object} projection - D3 projection
     * @param {number} longitude - Longitude (-180 to 180)
     * @param {number} latitude - Latitude (-90 to 90)
     * @returns {Array|null} - [x, y] coordinates or null if projection fails
     */
    projectCoordinates(projection, longitude, latitude) {
        if (!projection) return null;
        
        // Validate coordinates
        if (!this.isValidCoordinate(longitude, latitude)) {
            console.warn(`Invalid coordinates: [${longitude}, ${latitude}]`);
            return null;
        }
        
        const point = projection([longitude, latitude]);
        
        if (!point || isNaN(point[0]) || isNaN(point[1])) {
            return null;
        }
        
        return point;
    },

    /**
     * Unproject screen coordinates [x, y] to geo coordinates [longitude, latitude]
     * @param {Object} projection - D3 projection
     * @param {number} x - Screen x coordinate
     * @param {number} y - Screen y coordinate
     * @returns {Array|null} - [longitude, latitude] or null
     */
    unprojectCoordinates(projection, x, y) {
        if (!projection || !projection.invert) return null;
        
        const coords = projection.invert([x, y]);
        
        if (!coords || isNaN(coords[0]) || isNaN(coords[1])) {
            return null;
        }
        
        return coords;
    },

    /**
     * Check if coordinates are valid
     * @param {number} longitude - Longitude
     * @param {number} latitude - Latitude
     * @returns {boolean}
     */
    isValidCoordinate(longitude, latitude) {
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
            return false;
        }
        
        if (isNaN(longitude) || isNaN(latitude)) {
            return false;
        }
        
        if (longitude < -180 || longitude > 180) {
            return false;
        }
        
        if (latitude < -90 || latitude > 90) {
            return false;
        }
        
        return true;
    },

    /**
     * Calculate the bounding box for a set of coordinates
     * @param {Array} coordinates - Array of [longitude, latitude] pairs
     * @returns {Object} - { minLon, maxLon, minLat, maxLat }
     */
    calculateBoundingBox(coordinates) {
        if (!coordinates || coordinates.length === 0) {
            return null;
        }
        
        let minLon = Infinity;
        let maxLon = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;
        
        coordinates.forEach(([lon, lat]) => {
            if (this.isValidCoordinate(lon, lat)) {
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            }
        });
        
        if (minLon === Infinity) return null;
        
        return { minLon, maxLon, minLat, maxLat };
    },

    /**
     * Calculate center point of a bounding box
     * @param {Object} bbox - Bounding box from calculateBoundingBox
     * @returns {Array} - [centerLon, centerLat]
     */
    calculateCenter(bbox) {
        if (!bbox) return [0, 0];
        
        return [
            (bbox.minLon + bbox.maxLon) / 2,
            (bbox.minLat + bbox.maxLat) / 2
        ];
    },

    /**
     * Calculate zoom scale to fit bounding box
     * @param {Object} bbox - Bounding box
     * @param {number} width - Container width
     * @param {number} height - Container height
     * @param {number} padding - Padding factor (0-1)
     * @returns {number} - Zoom scale
     */
    calculateFitScale(bbox, width, height, padding = 0.8) {
        if (!bbox) return 1;
        
        const lonSpan = bbox.maxLon - bbox.minLon;
        const latSpan = bbox.maxLat - bbox.minLat;
        
        // Avoid division by zero
        if (lonSpan === 0 && latSpan === 0) return 8;
        
        const scaleX = width / Math.max(lonSpan * 20, 1);
        const scaleY = height / Math.max(latSpan * 20, 1);
        
        return Math.min(scaleX, scaleY) * padding;
    },

    /**
     * Calculate zoom transform to center on a point
     * @param {Object} projection - D3 projection
     * @param {Array} coordinates - [longitude, latitude]
     * @param {number} width - Container width
     * @param {number} height - Container height
     * @param {number} scale - Zoom scale
     * @returns {Object} - D3 zoom transform
     */
    calculateZoomTransform(projection, coordinates, width, height, scale) {
        const [lon, lat] = coordinates;
        const [x, y] = projection([lon, lat]) || [width / 2, height / 2];
        
        const translateX = width / 2 - x * scale;
        const translateY = height / 2 - y * scale;
        
        return d3.zoomIdentity
            .translate(translateX, translateY)
            .scale(scale);
    },

    /**
     * Get visible bounds for a zoom transform
     * @param {Object} transform - D3 zoom transform
     * @param {Object} projection - D3 projection
     * @param {number} width - Container width
     * @param {number} height - Container height
     * @returns {Object} - Visible bounds in geo coordinates
     */
    getVisibleBounds(transform, projection, width, height) {
        const invertedProjection = (point) => {
            const invertedPoint = [(point[0] - transform.x) / transform.k, 
                                   (point[1] - transform.y) / transform.k];
            return projection.invert ? projection.invert(invertedPoint) : null;
        };
        
        const topLeft = invertedProjection([0, 0]);
        const topRight = invertedProjection([width, 0]);
        const bottomLeft = invertedProjection([0, height]);
        const bottomRight = invertedProjection([width, height]);
        
        if (!topLeft || !bottomRight) return null;
        
        return {
            minLon: Math.min(topLeft[0], bottomLeft[0]),
            maxLon: Math.max(topRight[0], bottomRight[0]),
            minLat: Math.min(bottomLeft[1], bottomRight[1]),
            maxLat: Math.max(topLeft[1], topRight[1])
        };
    },

    /**
     * Check if a point is within visible bounds
     * @param {Array} coordinates - [longitude, latitude]
     * @param {Object} bounds - Visible bounds
     * @returns {boolean}
     */
    isPointInBounds(coordinates, bounds) {
        if (!coordinates || !bounds) return true;
        
        const [lon, lat] = coordinates;
        
        return lon >= bounds.minLon && lon <= bounds.maxLon &&
               lat >= bounds.minLat && lat <= bounds.maxLat;
    },

    /**
     * Calculate distance between two geo points in kilometers
     * @param {Array} coord1 - [longitude, latitude]
     * @param {Array} coord2 - [longitude, latitude]
     * @returns {number} - Distance in kilometers
     */
    calculateDistance(coord1, coord2) {
        const R = 6371; // Earth's radius in km
        
        const lat1 = coord1[1] * Math.PI / 180;
        const lat2 = coord2[1] * Math.PI / 180;
        const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
        const deltaLon = (coord2[0] - coord1[0]) * Math.PI / 180;
        
        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    },

    /**
     * Detect and handle overlapping markers
     * @param {Array} markers - Array of marker objects with x, y positions
     * @param {number} minDistance - Minimum distance between markers
     * @returns {Array} - Markers with adjusted positions
     */
    resolveOverlaps(markers, minDistance = 30) {
        const adjusted = markers.map(m => ({ ...m }));
        
        for (let i = 0; i < adjusted.length; i++) {
            for (let j = i + 1; j < adjusted.length; j++) {
                const dx = adjusted[j].x - adjusted[i].x;
                const dy = adjusted[j].y - adjusted[i].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < minDistance && distance > 0) {
                    // Push markers apart
                    const overlap = minDistance - distance;
                    const angle = Math.atan2(dy, dx);
                    
                    adjusted[j].x += Math.cos(angle) * overlap / 2;
                    adjusted[j].y += Math.sin(angle) * overlap / 2;
                    adjusted[i].x -= Math.cos(angle) * overlap / 2;
                    adjusted[i].y -= Math.sin(angle) * overlap / 2;
                }
            }
        }
        
        return adjusted;
    }
};

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectionUtils;
}

