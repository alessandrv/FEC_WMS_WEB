import React, { useState } from 'react';
import { Card, Button, Tooltip } from 'antd';
import WarehouseGridSystem from './WarehouseGridSystem';
import './ViewMagazzino.css';
import { WarehouseLayouts } from './layouts';

const WarehouseGridTest = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [occupiedShelves] = useState(new Set(['A-1', 'B-2', 'C-3']));
  
  const layouts = WarehouseLayouts;

  const handleShelfClick = (shelfId) => {
    setSelectedShelf(shelfId);
    setOccupiedShelves(prev => {
      const newSet = new Set(prev);
      if (newSet.has(shelfId)) {
        newSet.delete(shelfId);
      } else {
        newSet.add(shelfId);
      }
      return newSet;
    });
  };

  const getShelfStatus = (shelfId) => {
    if (shelfId === selectedShelf) return 'selected';
    if (occupiedShelves.has(shelfId)) return 'full';
    return 'available';
  };

  const getTooltipContent = (shelfId) => {
    return `Shelf ID: ${shelfId}\nStatus: ${getShelfStatus(shelfId)}`;
  };

  return (
    <Card 
      title="Warehouse Grid System Test" 
      style={{ 
        width: '100%', 
        height: 'calc(100vh - 48px)', 
        margin: '0 auto' 
      }}
      bodyStyle={{ 
        height: 'calc(100% - 58px)', 
        padding: '12px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ marginBottom: '12px' }}>
       
        <WarehouseGridSystem
          warehouseLayout={layouts[currentPage]}
          onCellClick={handleShelfClick}
          getShelfStatus={getShelfStatus}
          tooltipContent={getTooltipContent}
        />
      </div>

      <style jsx global>{`
        .empty-cell {
          background-color: #ffffff;
        }
        
        .blocked-cell {
          background-color: #d9d9d9;
        }
        
        .shelf-cell {
          border: 1px solid #d9d9d9;
          transition: all 0.3s;
          background-color: #ffffff;
        }
        
        .shelf-cell:hover {
          opacity: 0.8;
        }
        
        .shelf-cell.available {
          background-color: #f6ffed;
          border-color: #b7eb8f;
        }
        
        .shelf-cell.full {
          background-color: #fff1f0;
          border-color: #ffa39e;
        }
        
        .shelf-cell.selected {
          background-color: #e6f7ff;
          border-color: #91d5ff;
        }
      `}</style>
    </Card>
  );
};

export default WarehouseGridTest;