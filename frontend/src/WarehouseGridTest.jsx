import React, { useState } from 'react';
import { Card, Button, Tooltip } from 'antd';

import WarehouseGridSystem from './WarehouseGridSystem';

const WarehouseGridTest = () => {
  const [selectedLayout, setSelectedLayout] = useState('simple');
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [occupiedShelves, setOccupiedShelves] = useState(new Set());

  const layouts = {
    1: [
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
        {
            id: 'X',
            startRow: 25,
            startCol: 3,
            width: 5,
            height: 2,
            startingValue: 1,
            startingFloor: -1,
            spanRow: 2,
            spanCol: 5,
            shelfPattern: 'regular'
        },
        {
            id: 'M',
            startRow: 18,
            startCol: 6,
            width: 2,
            height: 1,
            startingValue: 40,
            startingFloor: 0,
            spanCol: 2,
            shelfPattern: 'regular'
        }, {
            id: 'TEXT1',
            type: 'customText',
            customText: 'SCALE',
            rotateText: false, // or false for horizontal text
            startRow: 27,
            startCol: 4,
            width: 4,
            height: 2,
            spanRow: 3,
            spanCol: 4
        },
        {
            id: 'TEXT1',
            type: 'customText',
            customText: '↓ PRODUZIONE ↓',
            rotateText: false, // or false for horizontal text
            startRow: 29,
            startCol: 1,
            width: 2,
            height: 1,
            spanRow: 1,
            spanCol: 2
        },

    ],
    2: [
        {
            id: 'E',
            startRow: 11,
            startCol: 0,
            width: 10,
            height: 5,
            shelfPattern: 'regular',
            spanCol: 2
        },
        {
            id: 'M',
            startRow: 11,
            startCol: 10,
            width: 2,
            height: 5,
            shelfPattern: 'regular',
            spanCol: 2,
            spanRow: 5,
            startingValue: 32,
            startingFloor: -4,
        },
        {
            id: 'E',
            startRow: 11,
            startCol: 12,
            width: 4,
            height: 5,
            shelfPattern: 'regular',
            spanCol: 2,
            startingValue: 7,
        },
        {
            id: 'R',
            startRow: 3,
            startCol: 9,
            width: 2,
            height: 2,
            startingValue: 1,
            shelfPattern: 'horizontal',
            startingFloor: 1,
            rotateText: true,
            spanRow: 2
        },
        {
            id: 'R',
            startRow: 3,
            startCol: 11,
            width: 3,
            height: 2,
            startingValue: 1,
            shelfPattern: 'horizontal',
            startingFloor: 0,
            rotateText: true,

            startingValue: 2,
            spanRow: 2,
            borderBottom: false,

            borderLeft: false,
            showText: false,
            spanCol: 3
        },
        {
            id: 'R',
            startRow: 5,
            startCol: 9,
            width: 5,
            height: 4,
            startingValue: 2,
            borderTop: false,

            shelfPattern: 'horizontal',
            startingFloor: 0,
            rotateText: true,
            spanRow: 4,
            spanCol: 5
        },

        {
            id: 'M',
            startRow: 2,
            startCol: 18,
            width: 2,
            height: 11,
            startingFloor: -10,
            startingValue: 48,
            spanRow: 11,
            spanCol: 2,
            shelfPattern: 'regular'
        },
        {
            id: 'M',
            startRow: 3,
            startCol: 14,
            width: 2,
            height: 6,
            startingFloor: -5,
            startingValue: 97,
            spanRow: 6,
            spanCol: 2,
            shelfPattern: 'regular',
        },
        {
            id: 'TEXT2',
            type: 'customText',
            customText: '↓ UFFICI ↓',
            rotateText: false,
            startRow: 15,
            startCol: 16,
            width: 2,
            spanCol: 2,
            height: 1,
        },
        {
            id: 'TEXT3',
            type: 'customText',
            customText: 'POS. DOMENICO',
            rotateText: false,
            startRow: 0,
            startCol: 0,
            width: 2,
            spanCol: 2,
            height: 1,
        },
        {
            id: 'TEXT8',
            type: 'customText',
            customText: '↑ MAGAZZINO ↑',
            rotateText: false,
            startRow: 0,
            startCol: 2,
            width: 2,
            spanCol: 2,
            height: 1,
        },
        {
            id: 'TEXT9',
            type: 'customText',
            customText: 'PRODUZIONE',
            rotateText: false,
            startRow: 2,
            startCol: 0,
            width: 3,
            spanCol: 3,
            height: 8,
            spanRow: 8,
        },
        {
            id: 'TEXT4',
            type: 'customText',
            customText: '↑ MAGAZZINO ↑',
            rotateText: false,
            startRow: 0,
            startCol: 16,
            width: 2,
            spanCol: 2,
            height: 1,
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