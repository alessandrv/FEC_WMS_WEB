import React from 'react';
import { Tooltip } from 'antd';
import './GridComponent.css';

const generateShelfNames = (group, columns, rows) => {
  const shelves = [];
  for (let row = rows; row >= 1; row--) {
    for (let col = 1; col <= columns; col++) {
      const colFormatted = col.toString().padStart(2, '0');
      shelves.push(`${group}-${colFormatted}-${row}`);
    }
  }
  return shelves;
};

const WarehouseGrid = ({
  group,
  columns,
  rows,
  getShelfClass,
  onShelfClick,
  tooltipContent,
  gridClassName,
}) => {
  return (
    <div className={`grid-group ${gridClassName}`}>
      {generateShelfNames(group, columns, rows).map((shelf) => (
        <Tooltip title={tooltipContent(shelf)} key={shelf}>
          <div
            className={`grid-item ${getShelfClass(shelf)}`}
            onClick={() => onShelfClick(shelf)}
          >
            {shelf}
          </div>
        </Tooltip>
      ))}
    </div>
  );
};

export default WarehouseGrid;
