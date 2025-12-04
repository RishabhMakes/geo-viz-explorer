/**
 * Selection Management Utilities for Geo Visualization Widget
 * Handles multi-selection logic and state management
 */

class SelectionManager {
    constructor(options = {}) {
        this.selectedMarkers = new Map(); // Map<markerId, markerData>
        this.selectionHierarchyLevel = null;
        this.maxSelections = options.maxSelections || 10;
        this.onSelectionChange = options.onSelectionChange || (() => {});
        this.debug = options.debug || false;
    }

    /**
     * Log debug messages
     */
    log(...args) {
        if (this.debug) {
            console.log('[SelectionManager]', ...args);
        }
    }

    /**
     * Check if a marker can be added to the current selection
     * @param {Object} marker - Marker to check
     * @param {number} markerLevel - Hierarchy level of the marker
     * @returns {Object} - { compatible, reason }
     */
    isSelectionCompatible(marker, markerLevel) {
        // If no current selection, any marker is compatible
        if (this.selectedMarkers.size === 0) {
            return { compatible: true, reason: null };
        }

        // Check if marker is already selected
        if (this.selectedMarkers.has(marker.id)) {
            return { compatible: true, reason: 'already_selected' };
        }

        // Check if marker level matches current selection level
        if (this.selectionHierarchyLevel !== markerLevel) {
            return { 
                compatible: false, 
                reason: 'level_mismatch',
                message: `Cannot select marker at level ${markerLevel} when current selection is at level ${this.selectionHierarchyLevel}`
            };
        }

        // Check max selections
        if (this.selectedMarkers.size >= this.maxSelections) {
            return {
                compatible: false,
                reason: 'max_selections',
                message: `Maximum selections (${this.maxSelections}) reached`
            };
        }

        return { compatible: true, reason: null };
    }

    /**
     * Select a marker
     * @param {Object} marker - Marker to select
     * @param {number} level - Hierarchy level of the marker
     * @param {boolean} isMultiSelect - Whether this is a multi-select action (Ctrl/Cmd+Click)
     * @returns {Object} - Selection result
     */
    selectMarker(marker, level, isMultiSelect = false) {
        this.log('selectMarker', marker.id, 'level:', level, 'multi:', isMultiSelect);

        // If marker is already selected, toggle it off
        if (this.selectedMarkers.has(marker.id)) {
            return this.deselectMarker(marker.id);
        }

        // Check compatibility
        const compatibility = this.isSelectionCompatible(marker, level);

        if (!compatibility.compatible) {
            if (compatibility.reason === 'level_mismatch') {
                // Clear current selection and start fresh with this marker
                this.log('Level mismatch - clearing selection and starting fresh');
                this.clearSelection(false); // Don't emit event yet
                this.selectedMarkers.set(marker.id, { ...marker, _level: level });
                this.selectionHierarchyLevel = level;
                this.emitChange();
                return {
                    success: true,
                    action: 'replaced',
                    marker,
                    clearedPrevious: true
                };
            }

            if (compatibility.reason === 'max_selections') {
                this.log('Max selections reached');
                return {
                    success: false,
                    reason: compatibility.reason,
                    message: compatibility.message
                };
            }
        }

        // For single click without multi-select modifier, clear other selections
        if (!isMultiSelect && this.selectedMarkers.size > 0) {
            this.clearSelection(false);
        }

        // Add marker to selection
        this.selectedMarkers.set(marker.id, { ...marker, _level: level });
        this.selectionHierarchyLevel = level;
        
        this.emitChange();

        return {
            success: true,
            action: 'added',
            marker
        };
    }

    /**
     * Deselect a marker
     * @param {string} markerId - ID of marker to deselect
     * @returns {Object} - Deselection result
     */
    deselectMarker(markerId) {
        if (!this.selectedMarkers.has(markerId)) {
            return {
                success: false,
                reason: 'not_selected'
            };
        }

        const marker = this.selectedMarkers.get(markerId);
        this.selectedMarkers.delete(markerId);

        // Reset hierarchy level if no more selections
        if (this.selectedMarkers.size === 0) {
            this.selectionHierarchyLevel = null;
        }

        this.emitChange();

        return {
            success: true,
            action: 'removed',
            marker
        };
    }

    /**
     * Toggle selection state of a marker
     * @param {Object} marker - Marker to toggle
     * @param {number} level - Hierarchy level
     * @param {boolean} isMultiSelect - Multi-select mode
     * @returns {Object} - Toggle result
     */
    toggleSelection(marker, level, isMultiSelect = false) {
        if (this.selectedMarkers.has(marker.id)) {
            return this.deselectMarker(marker.id);
        } else {
            return this.selectMarker(marker, level, isMultiSelect);
        }
    }

    /**
     * Clear all selections
     * @param {boolean} emit - Whether to emit change event
     */
    clearSelection(emit = true) {
        this.log('clearSelection');
        this.selectedMarkers.clear();
        this.selectionHierarchyLevel = null;
        
        if (emit) {
            this.emitChange();
        }
    }

    /**
     * Check if a marker is selected
     * @param {string} markerId - ID to check
     * @returns {boolean}
     */
    isSelected(markerId) {
        return this.selectedMarkers.has(markerId);
    }

    /**
     * Get all selected markers
     * @returns {Array} - Array of selected marker objects
     */
    getSelection() {
        return Array.from(this.selectedMarkers.values());
    }

    /**
     * Get selected marker IDs
     * @returns {Array} - Array of marker IDs
     */
    getSelectedIds() {
        return Array.from(this.selectedMarkers.keys());
    }

    /**
     * Get selection count
     * @returns {number}
     */
    getSelectionCount() {
        return this.selectedMarkers.size;
    }

    /**
     * Get the hierarchy level of current selection
     * @returns {number|null}
     */
    getSelectionLevel() {
        return this.selectionHierarchyLevel;
    }

    /**
     * Remove markers that no longer exist (e.g., due to filtering)
     * @param {Array} existingMarkerIds - Array of currently visible marker IDs
     */
    pruneInvalidSelections(existingMarkerIds) {
        const existingSet = new Set(existingMarkerIds);
        let changed = false;

        for (const markerId of this.selectedMarkers.keys()) {
            if (!existingSet.has(markerId)) {
                this.selectedMarkers.delete(markerId);
                changed = true;
            }
        }

        if (this.selectedMarkers.size === 0) {
            this.selectionHierarchyLevel = null;
        }

        if (changed) {
            this.emitChange();
        }

        return changed;
    }

    /**
     * Set selection from an array of markers
     * @param {Array} markers - Array of markers to select
     * @param {number} level - Hierarchy level
     */
    setSelection(markers, level) {
        this.clearSelection(false);
        
        markers.slice(0, this.maxSelections).forEach(marker => {
            this.selectedMarkers.set(marker.id, { ...marker, _level: level });
        });
        
        this.selectionHierarchyLevel = markers.length > 0 ? level : null;
        this.emitChange();
    }

    /**
     * Emit selection change event
     */
    emitChange() {
        this.onSelectionChange(this.getSelection());
    }

    /**
     * Get selection state for persistence
     * @returns {Object}
     */
    getState() {
        return {
            selectedIds: this.getSelectedIds(),
            hierarchyLevel: this.selectionHierarchyLevel
        };
    }

    /**
     * Restore selection state
     * @param {Object} state - State object from getState()
     * @param {Function} markerLookup - Function to look up marker by ID
     */
    restoreState(state, markerLookup) {
        if (!state || !state.selectedIds) return;

        this.clearSelection(false);
        
        state.selectedIds.forEach(id => {
            const marker = markerLookup(id);
            if (marker) {
                this.selectedMarkers.set(id, { 
                    ...marker, 
                    _level: state.hierarchyLevel 
                });
            }
        });
        
        this.selectionHierarchyLevel = state.hierarchyLevel;
        this.emitChange();
    }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SelectionManager;
}

