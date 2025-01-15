import React, { useState } from 'react';
import { Card, Button, Tooltip } from 'antd';

import WarehouseGridSystem from './WarehouseGridSystem';

const WarehouseGridTest = () => {
  const [selectedLayout, setSelectedLayout] = useState('simple');
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [occupiedShelves, setOccupiedShelves] = useState(new Set());

  const layouts = {
    simple: [
        {
            id: 'A',
            startRow: 0,
            startCol: 0,
            width: 8,
            height: 4,
            shelfPattern: 'regular'
          },
          {
            id: 'B',
            startRow: 7,
            startCol: 0,
            width: 7,
            height: 4,
            shelfPattern: 'regular'
          },
          {
            id: 'C',
            startRow: 11,
            startCol: 0,
            width: 7,
            height: 5,
            shelfPattern: 'regular'
          },
          {
            id: 'D',
            startRow: 19,
            startCol: 0,
            width: 2,
            height: 6,
            shelfPattern: 'regular'
          },
          {
            id: 'D',
            startRow: 19,
            startCol: 3,
            width: 5,
            height: 6,
            startingValue: 3,
            shelfPattern: 'regular'
          },
    ],
    complex: [
      {
        id: 'A',
        startRow: 0,
        startCol: 0,
        width: 4,
        height: 8,
        shelfPattern: 'regular'
      },
      {
        id: 'B',
        startRow: 10,
        startCol: 0,
        width: 4,
        height: 7,
        shelfPattern: 'regular'
      },
      {
        id: 'C',
        startRow: 0,
        startCol: 6,
        width: 4,
        height: 7,
        shelfPattern: 'regular'
      },
      {
        id: 'D',
        startRow: 10,
        startCol: 6,
        width: 4,
        height: 8,
        shelfPattern: 'regular'
      },
      {
        id: 'X1',
        startRow: 0,
        startCol: 4,
        width: 2,
        height: 30,
        shelfPattern: 'blocked'
      }
    ]
  };

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
          warehouseLayout={layouts[selectedLayout]}
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