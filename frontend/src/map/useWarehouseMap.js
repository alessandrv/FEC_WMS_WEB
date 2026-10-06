import { useEffect, useState } from 'react';
import axios from 'axios';

// One copy of the map and of the shelf occupancy for the whole app: every WarehouseMap and the
// map editor read the same store, and a save in the editor refreshes all of them.
const store = {
  map: null,
  occupancy: [],
  loading: false,
  error: null,
  listeners: new Set(),
  promise: null,
};

const notify = () => store.listeners.forEach((listener) => listener());

export const reloadWarehouseMap = () => {
  store.loading = true;
  notify();
  store.promise = Promise.all([
    axios.get(`${process.env.REACT_APP_API_URL}/api/map-layout`),
    axios.get(`${process.env.REACT_APP_API_URL}/api/map-occupancy`),
  ])
    .then(([mapResponse, occupancyResponse]) => {
      store.map = mapResponse.data;
      store.occupancy = Array.isArray(occupancyResponse.data) ? occupancyResponse.data : [];
      store.error = null;
    })
    .catch((error) => {
      store.error = error.response?.data?.error || error.message;
    })
    .finally(() => {
      store.loading = false;
      notify();
    });
  return store.promise;
};

export const useWarehouseMap = () => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    store.listeners.add(listener);
    if (!store.map && !store.promise) {
      reloadWarehouseMap();
    } else if (store.map) {
      // Occupancy changes with every deposit/pick: refresh it when a page with a map opens
      axios.get(`${process.env.REACT_APP_API_URL}/api/map-occupancy`)
        .then((response) => { store.occupancy = response.data || []; notify(); })
        .catch(() => {});
    }
    return () => store.listeners.delete(listener);
  }, []);

  return {
    map: store.map,
    occupancy: store.occupancy,
    loading: store.loading && !store.map,
    error: store.error,
    reload: reloadWarehouseMap,
  };
};
