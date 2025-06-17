import React, { useState, useCallback } from 'react';
import { Tooltip } from 'antd';

const WarehouseGridSystem = ({ 
  warehouseLayout, 
  onCellClick, 
  getShelfStatus, 
  tooltipContent, 
  GRID_ROWS, 
  GRID_COLS,
  highlightedShelves,
  showFloorNumber = true,
  cellRenderer
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
          direction = 'vertical',
          showText = true,
          borderTop = true,
          borderBottom = true,
          borderLeft = true,
          borderRight = true
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
                  shelfNumber = startingValue + Math.floor(r / spanRow);
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
                    columnId: `${id}-${String(shelfNumber).padStart(2, '0')}`,
                    section: id,
                    isSpanStart: true,
                    spanRow,
                    spanCol,
                    isTopEdge: Math.floor(r / spanRow) === 0,
                    isBottomEdge: Math.floor(r / spanRow) === Math.floor((height - 1) / spanRow),
                    isLeftEdge: Math.floor(c / spanCol) === 0,
                    isRightEdge: Math.floor(c / spanCol) === Math.floor((width - 1) / spanCol),
                    rotateText: rotateText,
                    showText,
                    borderTop,
                    borderBottom,
                    borderLeft,
                    borderRight
                  };
                } else {
                  newGrid[gridRow][gridCol] = {
                    type: 'shelf',
                    id: shelfId,
                    columnId: `${id}-${String(shelfNumber).padStart(2, '0')}`,
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

    const getCellClassName = useCallback((cell) => {
      if (!cell) return 'empty-cell';
      if (cell.type === 'blocked') return 'blocked-cell';
      if (cell.type === 'customText') return 'custom-text-cell';
      if (cell.type === 'shelf') {
        if (cell.hidden) return 'hidden-cell';
        
        const classNames = ['shelf-cell', 'grid-item'];
        
        const status = getShelfStatus(cell.id);
        if (status) classNames.push(status);
        
        if (highlightedShelves?.has(cell.columnId)) {
          classNames.push('highlighted');
        }

        if (cell.borderTop) classNames.push('border-top');
        if (cell.borderBottom) classNames.push('border-bottom');
        if (cell.borderLeft) classNames.push('border-left');
        if (cell.borderRight) classNames.push('border-right');
        
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
      if (cellRenderer && cell) {
        const customRenderedCell = cellRenderer(cell);
        if (customRenderedCell !== null) {
          return customRenderedCell;
        }
      }

      if (cell?.type === 'customText') {
        return (
          <div
            className={getCellClassName(cell)}
            style={{
              width: '100%',
              height: '-webkit-fill-available',
              display: 'flex',
              alignItems: 'center',
              textAlign:"center",

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
          <div
            className={getCellClassName(cell)}
            onClick={() => onCellClick(cell.id)}
            style={{
              width: '100%',
              textAlign:"center",
              height: '-webkit-fill-available',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              writingMode: cell.rotateText ? 'vertical-rl' : 'none'
            }}
          >
            {cell.showText && (showFloorNumber ? cell.id : cell.columnId)}
          </div>
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
    }, [getCellClassName, onCellClick, tooltipContent, cellRenderer, showFloorNumber]);
  
    return (
      <div style={{ width: '100%', height: '80vh'}}>
        <div 
          style={{ 
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
            gap: '1px',
            
            height: '100%',
            background: '#f0f0f0'
          }}
          className="warehouse-grid"
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
            box-sizing: border-box;
    margin: 0px 1px -1px 1px;
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
            border: 3px solid #ff9800 !important;
            box-shadow: 0 0 0 2px #ff9800;
            position: relative;
            z-index: 2;
          }
          .shelf-cell.highlighted::after {
            content: '✓';
            color: #ff9800;
            font-size: 1.5em;
            position: absolute;
            top: 2px;
            right: 6px;
            font-weight: bold;
            pointer-events: none;
          }
          .shelf-cell.good {
            background: #4caf50;
            color: white;
          }
          .shelf-cell.warning {
            background: #ff9800;
            color: white;
          }
          .shelf-cell.danger {
            background: #f44336;
            color: white;
          }
          .shelf-cell.to_check {
            background: #ffffff;
            border: 1px solid #ccc;
          }
          .shelf-cell.border-top {
            border-top: 1px solid #000;
          }
          .shelf-cell.border-bottom {
            border-bottom: 1px solid #000;
          }
          .shelf-cell.border-left {
            border-left: 1px solid #000;
          }
          .shelf-cell.border-right {
            border-right: 1px solid #000;
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