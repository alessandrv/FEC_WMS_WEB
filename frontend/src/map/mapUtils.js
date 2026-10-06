// Shelf ids and lookups for the warehouse map ({ pages: [{ page, title, rows, cols, sections }] }).
// A shelf id is 'SCAFFALE-COLONNA-PIANO' (e.g. 'C-01-1'); the area ('A') is not part of the map.

export const isShelfSection = (section) =>
  (section.type || 'shelf') === 'shelf' &&
  (section.shelfPattern === 'regular' || section.shelfPattern === 'horizontal');

// Shelf id of the cell (r, c) inside a shelf section
export const getShelfId = (section, r, c) => {
  const { id, shelfPattern, startingValue = 1, startingFloor = 1, spanRow = 1, spanCol = 1, height } = section;
  let shelfNumber;
  let floorNumber;
  if (shelfPattern === 'horizontal') {
    shelfNumber = startingValue + Math.floor(r / spanRow);
    floorNumber = startingFloor + c;
  } else {
    shelfNumber = startingValue + Math.floor(c / spanCol);
    floorNumber = height - Math.floor(r / spanRow) + (startingFloor - 1);
  }
  return `${id}-${String(shelfNumber).padStart(2, '0')}-${floorNumber}`;
};

// All shelf ids drawn by a section
export const sectionShelfIds = (section) => {
  const ids = new Set();
  if (!isShelfSection(section)) return ids;
  for (let r = 0; r < section.height; r++) {
    for (let c = 0; c < section.width; c++) {
      ids.add(getShelfId(section, r, c));
    }
  }
  return ids;
};

export const pageShelfIds = (page) => {
  const ids = new Set();
  (page?.sections || []).forEach((section) => sectionShelfIds(section).forEach((id) => ids.add(id)));
  return ids;
};

export const mapShelfIds = (map) => {
  const ids = new Set();
  (map?.pages || []).forEach((page) => pageShelfIds(page).forEach((id) => ids.add(id)));
  return ids;
};

// Page number containing the shelf, or null
export const findShelfPage = (map, shelfId) => {
  const page = (map?.pages || []).find((p) => pageShelfIds(p).has(shelfId));
  return page ? page.page : null;
};

// Locations with packages that the map does not show (e.g. after a shelf was removed in the editor)
export const shelvesOutsideMap = (map, occupancy) => {
  const ids = mapShelfIds(map);
  return (occupancy || []).filter((loc) => !ids.has(loc.shelf_id));
};
