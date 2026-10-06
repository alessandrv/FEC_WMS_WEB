import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pagination, Spin, Tag, Tooltip, Typography } from 'antd';
import WarehouseGridSystem from '../WarehouseGridSystem';
import { useWarehouseMap } from './useWarehouseMap';
import { findShelfPage, shelvesOutsideMap } from './mapUtils';

const { Text } = Typography;

/**
 * The warehouse map used by every page (layout edited from "Editor mappa").
 *
 * Props:
 *  - onCellClick(shelfId)        click on a shelf (also on a shelf outside the map)
 *  - getShelfStatus(shelfId)     css status class; default: 'full' when the shelf holds packages
 *  - highlightedShelves          Set of shelf ids ('C-01-1') or column ids ('C-01')
 *  - tooltipContent(shelfId)
 *  - showFloorNumber             false = show only the column ('C-01')
 *  - transformSections(sections, page)  page-specific view of the layout (Ispezione columns)
 *  - page / onPageChange         optional controlled page number
 *  - autoPage                    jump to the page holding the highlighted shelves (default true)
 *  - showOutsideShelves          list shelves with packages missing from the map (default true)
 *  - height                      grid height (default '70vh')
 */
const WarehouseMap = ({
  onCellClick = () => {},
  getShelfStatus,
  highlightedShelves,
  tooltipContent,
  showFloorNumber = true,
  transformSections,
  page: controlledPage,
  onPageChange,
  autoPage = true,
  showOutsideShelves = true,
  height = '70vh',
}) => {
  const { map, occupancy, loading, error } = useWarehouseMap();
  const [internalPage, setInternalPage] = useState(null);

  const pages = useMemo(() => [...(map?.pages || [])].sort((a, b) => a.page - b.page), [map]);
  const currentPageNumber = controlledPage ?? internalPage ?? pages[0]?.page;
  const pageIndex = Math.max(0, pages.findIndex((p) => p.page === currentPageNumber));
  const currentPage = pages[pageIndex];

  const setPage = (pageNumber) => {
    setInternalPage(pageNumber);
    if (onPageChange) onPageChange(pageNumber);
  };

  // Show the page that contains the highlighted shelves (only when the highlight changes)
  useEffect(() => {
    if (!autoPage || !map || !highlightedShelves || highlightedShelves.size === 0) return;
    const pagesWithHighlight = [...highlightedShelves]
      .map((shelf) => findShelfPage(map, shelf) ?? findColumnPage(map, shelf))
      .filter((p) => p !== null && p !== undefined);
    if (pagesWithHighlight.length > 0 && !pagesWithHighlight.includes(currentPageNumber)) {
      setPage(pagesWithHighlight[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedShelves, map]);

  const occupiedShelves = useMemo(() => new Set(occupancy.map((loc) => loc.shelf_id)), [occupancy]);
  const defaultShelfStatus = (shelfId) => (occupiedShelves.has(shelfId) ? 'full' : 'available');

  const sections = useMemo(() => {
    if (!currentPage) return [];
    return transformSections ? transformSections(currentPage.sections, currentPage.page) : currentPage.sections;
  }, [currentPage, transformSections]);

  const outside = useMemo(() => shelvesOutsideMap(map, occupancy), [map, occupancy]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="Caricamento mappa..." /></div>;
  }
  if (!map || !currentPage) {
    return <Alert type="error" showIcon message="Mappa del magazzino non disponibile" description={error} />;
  }

  return (
    <div className="warehouse-map">
      <WarehouseGridSystem
        warehouseLayout={sections}
        GRID_ROWS={currentPage.rows}
        GRID_COLS={currentPage.cols}
        onCellClick={onCellClick}
        getShelfStatus={getShelfStatus || defaultShelfStatus}
        tooltipContent={tooltipContent}
        highlightedShelves={highlightedShelves}
        showFloorNumber={showFloorNumber}
        height={height}
      />

      {pages.length > 1 && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Pagination
            simple
            current={pageIndex + 1}
            total={pages.length}
            pageSize={1}
            onChange={(index) => setPage(pages[index - 1].page)}
          />
          {currentPage.title && <Text type="secondary">{currentPage.title}</Text>}
        </div>
      )}

      {showOutsideShelves && outside.length > 0 && (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message={`Scaffali con articoli non presenti nella mappa (${outside.length})`}
          description={
            <div>
              <div style={{ marginBottom: 6 }}>
                Queste locazioni contengono pacchi ma non sono disegnate nella mappa: ricrearle dall'Editor mappa.
              </div>
              {outside.map((loc) => (
                <Tooltip key={loc.locazione} title={`${loc.pacchi} pacchi, qta ${loc.qta}, ${loc.articoli} articoli`}>
                  <Tag
                    color={highlightedShelves?.has(loc.shelf_id) ? 'orange' : 'red'}
                    style={{ cursor: 'pointer', marginBottom: 4 }}
                    onClick={() => onCellClick(loc.shelf_id)}
                  >
                    {loc.locazione}
                  </Tag>
                </Tooltip>
              ))}
            </div>
          }
        />
      )}
    </div>
  );
};

// Column ids ('C-01', used by Ispezione) -> page of any shelf of that column
const findColumnPage = (map, columnId) => {
  if (columnId.split('-').length !== 2) return null;
  for (const page of map.pages || []) {
    for (const section of page.sections || []) {
      if (!section.shelfPattern || section.shelfPattern === 'blocked') continue;
      const start = section.startingValue || 1;
      const count = section.shelfPattern === 'horizontal'
        ? Math.ceil(section.height / (section.spanRow || 1))
        : Math.ceil(section.width / (section.spanCol || 1));
      for (let i = 0; i < count; i++) {
        if (`${section.id}-${String(start + i).padStart(2, '0')}` === columnId) return page.page;
      }
    }
  }
  return null;
};

export default WarehouseMap;
