import React, { useState, useCallback } from 'react';
import { Tooltip } from 'antd';

const WarehouseGridSystem = ({ 
  warehouseLayout, 
  onCellClick, 
  getShelfStatus, 
  tooltipContent, 
  GRID_ROWS, 
  GRID_COLS,
  highlightedShelves 
}) => {
    const createEmptyGrid = () => {
      return Array(GRID_ROWS).fill(null).map(() => 
        Array(GRID_COLS).fill(null)
      );
    };
  
    const [gridData, setGridData] = useState(createEmptyGrid());
    const [groupBoundaries, setGroupBoundaries] = useState({});
  
    React.useEffect(() => {
      const newGrid = createEmptyGrid();
      const boundaries = {};
      
      warehouseLayout.forEach(section => {
        const { 
          id, 
          startRow, 
          startCol, 
          width, 
          height, 
          shelfPattern, 
          startingValue = 1, 
          startingFloor = 1,
          spanRow = 1,
          spanCol = 1,
          customText,
          rotateText = false,
          type = 'shelf',
          direction = 'vertical' // New prop for shelf direction
        } = section;
        
        boundaries[id] = {
          startRow,
          startCol,
          endRow: startRow + height - 1,
          endCol: startCol + width - 1,
          spanRow,
          spanCol
        };
        
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            const gridRow = startRow + r;
            const gridCol = startCol + c;
            
            if (gridRow < GRID_ROWS && gridCol < GRID_COLS) {
              if (type === 'customText') {
                const isSpanStart = r % spanRow === 0 && c % spanCol === 0;
                
                if (isSpanStart) {
                  newGrid[gridRow][gridCol] = {
                    type: 'customText',
                    text: customText,
                    rotateText,
                    id,
                    section: id,
                    isSpanStart: true,
                    spanRow,
                    spanCol,
                    isTopEdge: r === 0,
                    isBottomEdge: r === height - 1,
                    isLeftEdge: c === 0,
                    isRightEdge: c === width - 1
                  };
                } else {
                  newGrid[gridRow][gridCol] = {
                    type: 'customText',
                    id,
                    section: id,
                    isSpanStart: false,
                    hidden: true
                  };
                }
              } else if (shelfPattern === 'regular' || shelfPattern === 'horizontal') {
                // Calculate shelf number based on direction
                let shelfNumber;
                let floorNumber = shelfPattern === 'horizontal' ? 
                startingFloor + Math.floor(r / spanRow) : 
                height - Math.floor(r / spanRow) + (startingFloor-1);
              
                if (shelfPattern === 'horizontal') {
                  // For horizontal shelves, increment by column
                  shelfNumber = startingValue;
                  floorNumber = startingFloor + c;
                } else {
                  // For vertical shelves (regular pattern)
                  shelfNumber = startingValue + Math.floor(c / spanCol);
                }
                
     
                const shelfId = `${id}-${String(shelfNumber).padStart(2, '0')}-${floorNumber}`;
                
                const isSpanStart = r % spanRow === 0 && c % spanCol === 0;
                
                if (isSpanStart) {
                  newGrid[gridRow][gridCol] = {
                    type: 'shelf',
                    id: shelfId,
                    section: id,
                    isSpanStart: true,
                    spanRow,
                    spanCol,
                    isTopEdge: Math.floor(r / spanRow) === 0,
                    isBottomEdge: Math.floor(r / spanRow) === Math.floor((height - 1) / spanRow),
                    isLeftEdge: Math.floor(c / spanCol) === 0,
                    isRightEdge: Math.floor(c / spanCol) === Math.floor((width - 1) / spanCol)
                  };
                } else {
                  newGrid[gridRow][gridCol] = {
                    type: 'shelf',
                    id: shelfId,
                    section: id,
                    isSpanStart: false,
                    hidden: true
                  };
                }
              } else if (shelfPattern === 'blocked') {
                newGrid[gridRow][gridCol] = {
                  type: 'blocked',
                  section: id,
                  isTopEdge: r === 0,
                  isBottomEdge: r === height - 1,
                  isLeftEdge: c === 0,
                  isRightEdge: c === width - 1
                };
              }
            }
          }
        }
      });
      
      setGridData(newGrid);
      setGroupBoundaries(boundaries);
    }, [warehouseLayout]);

    // Rest of the component remains the same...
    
    const getCellClassName = useCallback((cell) => {
      if (!cell) return 'empty-cell';
      if (cell.type === 'blocked') return 'blocked-cell';
      if (cell.type === 'customText') return 'custom-text-cell';
      if (cell.type === 'shelf') {
        if (cell.hidden) return 'hidden-cell';
        
        const classNames = ['shelf-cell'];
        
        const status = getShelfStatus(cell.id);
        if (status === 'available') classNames.push('available');
        if (status === 'full') classNames.push('full');
        if (status === 'selected') classNames.push('selected');
        
        if (highlightedShelves?.has(cell.id)) {
          classNames.push('highlighted');
        }

        if (cell.isTopEdge) classNames.push('border-top');
        if (cell.isBottomEdge) classNames.push('border-bottom');
        if (cell.isLeftEdge) classNames.push('border-left');
        if (cell.isRightEdge) classNames.push('border-right');
        
        return classNames.join(' ');
      }
      return '';
    }, [getShelfStatus, highlightedShelves]);
  
    const getCellStyle = (rowIndex, colIndex, cell) => {
      const style = {
        width: '100%',
        height: '100%',
        position: 'relative'
      };
  
      if (cell?.isSpanStart) {
        style.gridRow = `span ${cell.spanRow}`;
        style.gridColumn = `span ${cell.spanCol}`;
      }
  
      return style;
    };

    const renderCellContent = useCallback((cell) => {
      if (cell?.type === 'customText') {
        return (
          <div
            className={getCellClassName(cell)}
            style={{
              width: '98%',
              height: '-webkit-fill-available',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: cell.rotateText ? 'rotate(90deg)' : 'none'
            }}
          >
            {cell.text}
          </div>
        );
      }

      if (cell?.type === 'shelf') {
        return (
          <Tooltip title={tooltipContent(cell.id)}>
            <div
              className={getCellClassName(cell)}
              onClick={() => onCellClick(cell.id)}
              style={{
                width: '98%',
              height: '-webkit-fill-available',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {cell.id}
            </div>
          </Tooltip>
        );
      }

      return (
        <div 
          className={getCellClassName(cell)}
          style={{
            width: '100%',
            height: '100%'
          }}
        />
      );
    }, [getCellClassName, onCellClick, tooltipContent]);
  
    return (
      <div style={{ width: '100%', height: '80vh', overflow: 'auto' }}>
        <div 
          style={{ 
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
            gap: '1px',
            
            height: '100%',
            background: '#f0f0f0'
          }}
        >
          {gridData.map((row, rowIndex) => (
            row.map((cell, colIndex) => (
              !cell?.hidden && (
                <div 
                  key={`${rowIndex}-${colIndex}`} 
                  style={getCellStyle(rowIndex, colIndex, cell)}
                >
                  {renderCellContent(cell)}
                </div>
              )
            ))
          ))}
        </div>
        <style jsx global>{`
          .hidden-cell {
            display: none;
          }
          .shelf-cell {
            background: #e6f7ff;
            border: 0;
          }
          .shelf-cell.available {
            background: white;
          }
          .shelf-cell.full {
            background: #fff1f0;
          }
          .shelf-cell.selected {
            background: #fff7e6;
          }
          .shelf-cell.highlighted {
            background: #ffeb3b;
          }
          .shelf-cell.border-top {
            border-top: 2px solid #000;
          }
          .shelf-cell.border-bottom {
            border-bottom: 2px solid #000;
          }
          .shelf-cell.border-left {
            border-left: 2px solid #000;
          }
          .shelf-cell.border-right {
            border-right: 2px solid #000;
          }
          .custom-text-cell {
            background: #f0f0f0;
            border: 1px solid #d9d9d9;
          }
          .blocked-cell {
            background: #f5f5f5;
            border: 1px solid #d9d9d9;
          }
          .empty-cell {
            background: white;
            border: 1px solid #f0f0f0;
          }
        `}</style>
      </div>
    );
  };

export default WarehouseGridSystem;