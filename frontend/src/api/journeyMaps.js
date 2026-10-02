/** api/journeyMaps.js — Journey maps, locations, distances, paths */

import { client } from './client';

export const journeyMapsApi = {
  list:   (cid)   => client.get(`/campaigns/${cid}/journey-maps`),
  create: (cid, d)=> client.post(`/campaigns/${cid}/journey-maps`, d),
  remove: (id)    => client.del(`/journey-maps/${id}`),

  getImage:  (id)   => client.get(`/journey-maps/${id}/image`),
  saveImage: (id, d)=> client.put(`/journey-maps/${id}/image`, d),
  share:     (id)   => client.post(`/journey-maps/${id}/share`),

  // Locations
  listLocations:   (id)        => client.get(`/journey-maps/${id}/locations`),
  addLocation:     (id, d)     => client.post(`/journey-maps/${id}/locations`, d),
  updateLocation:  (id, lid, d)=> client.put(`/journey-maps/${id}/locations/${lid}`, d),
  removeLocation:  (id, lid)   => client.del(`/journey-maps/${id}/locations/${lid}`),

  // Distances
  listDistances: (id)    => client.get(`/journey-maps/${id}/distances`),
  saveDistance:  (id, d) => client.put(`/journey-maps/${id}/distances`, d),

  // Paths
  listPaths:  (id)        => client.get(`/journey-maps/${id}/paths`),
  addPath:    (id, d)     => client.post(`/journey-maps/${id}/paths`, d),
  updatePath: (id, pid, d)=> client.put(`/journey-maps/${id}/paths/${pid}`, d),
  removePath: (id, pid)   => client.del(`/journey-maps/${id}/paths/${pid}`),

  // Public
  publicData: (token) => client.get(`/journey-map-public/${token}`),
};
