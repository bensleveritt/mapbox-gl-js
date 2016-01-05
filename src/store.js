'use strict';

import createMidpoints from './lib/create_midpoints';
import createVertices from './lib/create_vertices';
import debounce from './lib/debounce';

/**
 * A store for keeping track of versions of drawings
 *
 * @param {Array<Object>} data An array of GeoJSON object
 * @returns {Store} this
 */
export default class Store {

  constructor(map) {
    this._map = map;
    this._features = {};
    this._needsRender = false;
    this._isRunning = false;
    this._render = debounce(this.render, 10, false);
  }

  /**
   * add a feature
   *
   * @param {Object} feature - GeoJSON feature
   */
  set(feature) {
    this._features[feature.drawId] = feature;
    this._needsRender = true;

    this._map.fire('draw.set', {
      id: feature.drawId,
      geojson: feature.geojson
    });

    this._render();
    return feature.drawId;
  }

  /**
   * get a feature
   *
   * @param {string} id - draw id
   */

  get(id) {
    return this._features[id];
  }

  /**
   * get a list of ids for all features
   */

  getAllIds() {
    return Object.keys(this._features);
  }

  /**
   * get a list of ids currently being selected
   */

  getSelectedIds() {
    return Object.keys(this._features).filter(id => this._features[id].selected === true);
  }

  /**
   * delete a feature
   *
   * @param {String} id - feature id
   */
  delete(id) {
    if (this._features[id]) {
      this._map.fire('draw.delete', {
        id: id,
        geojson: this._features[id].geojson
      });
    }
    delete this._features[id];
    this._render();
  }

  /**
   * removes all selected features from the store
   */
  clearSelected() {
    this.getSelectedIds().forEach(id => {
      this.delete(id);
    });
  }

   /**
   * remove all features from the store
   */
  deleteAll() {
    Object.keys(this._features).forEach(id => {
      this.delete(id);
    });
  }

  /**
   * select a feature
   *
   * @param {String} id - the drawId of a feature
   */
  select(id) {
    if (this._features[id] && !this._features[id].selected) {
      this._features[id].selected = true;
      this._render();
      this._map.fire('draw.select.start', {
        id: id,
        geojson: this._features[id].geojson
      });
    }
  }

  /**
   * commit changes to a feature and deselect
   *
   * @param {String} id - the drawId of a feature
   */
  commit(id) {
    if (this._features[id] && this._features[id].selected) {
      this._features[id].selected = false;
      this._render();
      this._map.fire('draw.select.end', {
        id: id,
        geojson: this._features[id].geojson
      });

      // TODO: make this emit only if there was a change
      this._map.fire('draw.set', {
        id: id,
        geojson: this._features[id].geojson
      });
    }
  }

  isSelected() {
    return Object.keys(this._features).some(id => this._features[id].selected === true);
  }

  /**
   * @param {Object} p1 - the pixel coordinates of the first point
   * @param {Object} p2 - the pixel coordinates of the second point
   */
  selectFeaturesIn(p1, p2) {
    var xMin = p1.x < p2.x ? p1.x : p2.x;
    var yMin = p1.y < p2.y ? p1.y : p2.y;
    var xMax = p1.x > p2.x ? p1.x : p2.x;
    var yMax = p1.y > p2.y ? p1.y : p2.y;
    var bbox = [ [xMin, yMin], [xMax, yMax] ];
    var drawLayers = [ 'gl-draw-polygon', 'gl-draw-line', 'gl-draw-point' ];
    this._map.featuresIn(bbox, { layers: drawLayers, type: 'vector' }, (err, features) => {
      if (err) throw err;
      // featuresIn can return the same feature multiple times
      // handle this with a reduce
      features.reduce((set, feature) => {
        var id = feature.properties.drawId;
        if (this._features[id] && set[id] === undefined) {
          set[id] = 1;
          this.select(id);
        }
        return set;
      }, {});
    });
  }

  render() {
    this._needsRender = true;
    var isStillAlive = this._map.getSource('draw') !== undefined;
    if (isStillAlive) { // checks to make sure we still have a map
      if (this._needsRender) {
        this._needsRender = false;
        var featureBuckets = Object.keys(this._features).reduce((buckets, id) => {
          if (this._features[id].ready) {
            if (this._features[id].selected === true) {
              let geojson = this._features[id].toGeoJSON();
              geojson.properties.drawId = id;
              buckets.selected.push(geojson);
              buckets.selected = buckets.selected.concat(createMidpoints([this._features[id]], this._map), createVertices([this._features[id]]));
            }
            else {
              let geojson = this._features[id].toGeoJSON();
              geojson.properties.drawId = id;
              buckets.draw.push(geojson);
            }
          }
          return buckets;
        }, { draw: [], selected: [] });

        // currently we are updating both of these sources
        // even if only one of them is changing. This is an
        // optimization we need to figure out soon

        this._map.getSource('draw').setData({
          type: 'FeatureCollection',
          features: featureBuckets.draw
        });

        this._map.getSource('draw-selected').setData({
          type: 'FeatureCollection',
          features: featureBuckets.selected
        });
      }
    }
  }
}