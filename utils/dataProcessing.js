/**
 * Data Processing Utilities for Geo Visualization Widget
 * Handles data transformation, aggregation, and filtering
 */

const DataProcessing = {
    /**
     * Calculate the count of all descendant leaf nodes
     * @param {Object} node - The node to count descendants for
     * @param {Object} filters - Active filter criteria
     * @returns {number} - Total count of matching leaf nodes
     */
    calculateCounts(node, filters = {}) {
        if (!node) return 0;
        
        // If node has no children, it's a leaf node
        if (!node.children || node.children.length === 0) {
            return this.matchesFilters(node, filters) ? 1 : 0;
        }
        
        // Recursively count children
        let count = 0;
        for (const child of node.children) {
            count += this.calculateCounts(child, filters);
        }
        
        return count;
    },

    /**
     * Check if a node matches the given filters
     * @param {Object} node - Node to check
     * @param {Object} filters - Filter criteria
     * @returns {boolean} - True if node matches filters
     */
    matchesFilters(node, filters = {}) {
        const { region, location, datacentre } = filters;
        
        // Get node properties
        const nodeRegion = this.getPropertyValue(node, 'CategoryValue') || 
                          this.getPropertyValue(node, 'Region');
        const nodeLocation = node.label;
        
        // Check region filter
        if (region && region !== 'All') {
            // Check if this node or any ancestor matches the region
            if (!this.nodeMatchesRegion(node, region)) {
                return false;
            }
        }
        
        // Check location filter
        if (location && location !== 'All') {
            if (!this.nodeMatchesLocation(node, location)) {
                return false;
            }
        }
        
        // Check datacentre filter
        if (datacentre && datacentre !== 'All') {
            if (node.label !== datacentre) {
                return false;
            }
        }
        
        return true;
    },

    /**
     * Check if node matches a region filter (including ancestors)
     */
    nodeMatchesRegion(node, region) {
        const nodeRegion = this.getPropertyValue(node, 'CategoryValue');
        if (nodeRegion === region) return true;
        
        // Also check the label for continent-level nodes
        if (node.label === region) return true;
        
        return false;
    },

    /**
     * Check if node matches a location filter
     */
    nodeMatchesLocation(node, location) {
        return node.label === location;
    },

    /**
     * Get a property value from node's properties array
     * @param {Object} node - Node to get property from
     * @param {string} propertyKey - Key to look for
     * @returns {string|null} - Property value or null
     */
    getPropertyValue(node, propertyKey) {
        if (!node.properties) return null;
        
        const prop = node.properties.find(p => p.propertyKey === propertyKey);
        return prop ? prop.propertyValue : null;
    },

    /**
     * Extract unique filter values from data
     * @param {Object} data - GeoLocations data object
     * @returns {Object} - Object with arrays of unique values for each filter
     */
    extractFilterOptions(data) {
        const regions = new Set();
        const locations = new Set();
        const datacentres = new Set();
        
        const processNode = (node, level = 1) => {
            if (!node) return;
            
            // Extract region (top level)
            if (level === 1) {
                const region = this.getPropertyValue(node, 'CategoryValue') || node.label;
                if (region) regions.add(region);
            }
            
            // Extract location (country level)
            if (level === 2) {
                locations.add(node.label);
            }
            
            // Extract datacentre (city/leaf level)
            if (level === 3 || (!node.children || node.children.length === 0)) {
                datacentres.add(node.label);
            }
            
            // Process children
            if (node.children) {
                node.children.forEach(child => processNode(child, level + 1));
            }
        };
        
        if (data && data.GeoLocations) {
            data.GeoLocations.forEach(node => processNode(node, 1));
        }
        
        return {
            regions: ['All', ...Array.from(regions).sort()],
            locations: ['All', ...Array.from(locations).sort()],
            datacentres: ['All', ...Array.from(datacentres).sort()]
        };
    },

    /**
     * Filter data based on active filters
     * @param {Object} data - Original GeoLocations data
     * @param {Object} filters - Active filters
     * @returns {Object} - Filtered data structure
     */
    filterData(data, filters = {}) {
        if (!data || !data.GeoLocations) return data;
        
        const filterNode = (node, level = 1) => {
            if (!node) return null;
            
            // Check if this node should be visible
            const matchesRegion = !filters.region || filters.region === 'All' ||
                                  this.nodeMatchesRegion(node, filters.region);
            
            // For non-leaf nodes, recursively filter children
            if (node.children && node.children.length > 0) {
                const filteredChildren = node.children
                    .map(child => filterNode(child, level + 1))
                    .filter(child => child !== null);
                
                // Only include parent if it has matching children
                if (filteredChildren.length > 0) {
                    return {
                        ...node,
                        children: filteredChildren,
                        _filteredCount: filteredChildren.reduce(
                            (sum, child) => sum + (child._filteredCount || 1), 0
                        )
                    };
                }
                
                // Check if this region matches
                if (matchesRegion && level === 1) {
                    return {
                        ...node,
                        children: [],
                        _filteredCount: 0
                    };
                }
                
                return null;
            }
            
            // For leaf nodes, check if they match
            if (this.matchesFilters(node, filters)) {
                return { ...node, _filteredCount: 1 };
            }
            
            return null;
        };
        
        const filteredLocations = data.GeoLocations
            .map(node => filterNode(node, 1))
            .filter(node => node !== null);
        
        return {
            ...data,
            GeoLocations: filteredLocations
        };
    },

    /**
     * Get nodes at a specific hierarchy level
     * @param {Object} data - GeoLocations data
     * @param {number} level - Target hierarchy level (1, 2, or 3)
     * @returns {Array} - Array of nodes at that level
     */
    getNodesAtLevel(data, level) {
        if (!data || !data.GeoLocations) return [];
        
        const nodes = [];
        
        const collectNodes = (node, currentLevel, parent = null) => {
            if (currentLevel === level) {
                nodes.push({ ...node, _parent: parent });
                return;
            }
            
            if (node.children) {
                node.children.forEach(child => 
                    collectNodes(child, currentLevel + 1, node)
                );
            }
        };
        
        data.GeoLocations.forEach(node => collectNodes(node, 1, null));
        
        return nodes;
    },

    /**
     * Get children of a specific node
     * @param {Object} data - GeoLocations data
     * @param {string} nodeId - ID of the parent node
     * @returns {Array} - Array of child nodes
     */
    getChildrenOfNode(data, nodeId) {
        if (!data || !data.GeoLocations) return [];
        
        const findNode = (node) => {
            if (node.id === nodeId) {
                return node.children || [];
            }
            
            if (node.children) {
                for (const child of node.children) {
                    const result = findNode(child);
                    if (result) return result;
                }
            }
            
            return null;
        };
        
        for (const location of data.GeoLocations) {
            const children = findNode(location);
            if (children) return children;
        }
        
        return [];
    },

    /**
     * Find a node by ID in the data structure
     * @param {Object} data - GeoLocations data
     * @param {string} nodeId - ID to find
     * @returns {Object|null} - Found node or null
     */
    findNodeById(data, nodeId) {
        if (!data || !data.GeoLocations) return null;
        
        const searchNode = (node) => {
            if (node.id === nodeId) return node;
            
            if (node.children) {
                for (const child of node.children) {
                    const found = searchNode(child);
                    if (found) return found;
                }
            }
            
            return null;
        };
        
        for (const location of data.GeoLocations) {
            const found = searchNode(location);
            if (found) return found;
        }
        
        return null;
    },

    /**
     * Get the hierarchy level of a node
     * @param {Object} data - GeoLocations data
     * @param {string} nodeId - ID of the node
     * @returns {number} - Hierarchy level (1, 2, 3, etc.)
     */
    getNodeLevel(data, nodeId) {
        if (!data || !data.GeoLocations) return 0;
        
        const findLevel = (node, currentLevel) => {
            if (node.id === nodeId) return currentLevel;
            
            if (node.children) {
                for (const child of node.children) {
                    const level = findLevel(child, currentLevel + 1);
                    if (level > 0) return level;
                }
            }
            
            return 0;
        };
        
        for (const location of data.GeoLocations) {
            const level = findLevel(location, 1);
            if (level > 0) return level;
        }
        
        return 0;
    },

    /**
     * Get parent node of a given node
     * @param {Object} data - GeoLocations data
     * @param {string} nodeId - ID of the child node
     * @returns {Object|null} - Parent node or null
     */
    getParentNode(data, nodeId) {
        if (!data || !data.GeoLocations) return null;
        
        const findParent = (node, parent) => {
            if (node.id === nodeId) return parent;
            
            if (node.children) {
                for (const child of node.children) {
                    const found = findParent(child, node);
                    if (found) return found;
                }
            }
            
            return null;
        };
        
        for (const location of data.GeoLocations) {
            const parent = findParent(location, null);
            if (parent) return parent;
        }
        
        return null;
    },

    /**
     * Validate data structure
     * @param {Object} data - Data to validate
     * @returns {Object} - Validation result with isValid and errors
     */
    validateData(data) {
        const errors = [];
        
        if (!data) {
            errors.push('Data is null or undefined');
            return { isValid: false, errors };
        }
        
        if (!data.GeoLocations || !Array.isArray(data.GeoLocations)) {
            errors.push('Missing or invalid GeoLocations array');
            return { isValid: false, errors };
        }
        
        const validateNode = (node, path) => {
            if (!node.id) {
                errors.push(`Missing id at ${path}`);
            }
            
            if (!node.label) {
                errors.push(`Missing label at ${path}`);
            }
            
            if (!node.geometry) {
                errors.push(`Missing geometry at ${path}`);
            } else if (!node.geometry.coordinates || 
                       !Array.isArray(node.geometry.coordinates) ||
                       node.geometry.coordinates.length < 2) {
                errors.push(`Invalid coordinates at ${path}`);
            } else {
                const [lon, lat] = node.geometry.coordinates;
                if (lon < -180 || lon > 180) {
                    errors.push(`Invalid longitude ${lon} at ${path}`);
                }
                if (lat < -90 || lat > 90) {
                    errors.push(`Invalid latitude ${lat} at ${path}`);
                }
            }
            
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach((child, i) => {
                    validateNode(child, `${path}.children[${i}]`);
                });
            }
        };
        
        data.GeoLocations.forEach((node, i) => {
            validateNode(node, `GeoLocations[${i}]`);
        });
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
};

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataProcessing;
}

