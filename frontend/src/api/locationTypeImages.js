/** api/locationTypeImages.js — global default pin images by location size_type (admin-managed). */

import { client } from './client';

export const locationTypeImagesApi = {
  // { size_type: dataUrl } — readable by any authenticated user (the map needs it).
  getAll: () => client.get('/location-type-images'),
  // Set (base64 data URL) or clear (null) the default for a size_type. Admin only.
  set: (sizeType, image_data) => client.put(`/location-type-images/${sizeType}`, { image_data }),
};
