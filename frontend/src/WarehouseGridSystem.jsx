import React, { useState, useCallback } from 'react';
import { Tooltip } from 'antd';
import { getShelfId } from './map/mapUtils';

// Low-level grid renderer. Pages use map/WarehouseMap (shared layout, pages, shelves outside the map);
// the map editor uses this directly with the extra editing props.
const WarehouseGridSystem = ({
  warehouseLayout,
  onCellClick = () => {},
  getShelfStatus = () => 'available',
  tooltipContent,
  GRID_ROWS,
  GRID_COLS,
  highlightedShelves,
  showFloorNumber = true,
  cellRenderer,
  height = '80vh',
  // Map editor only
  onSectionClick,
  selectedSection,
  onEmptyCellClick,
  onSectionMove
}) => {
    const gridRef = React.useRef(null);
    // Drag & drop of a section (map editor): offset of the grabbed cell inside the section and
    // the top-left cell where the section would land
    const [drag, setDrag] = useState(null);
    const [dropAt, setDropAt] = useState(null);

    const pointerCell = (event) => {
      const rect = gridRef.current.getBoundingClientRect();
      const r = Math.floor(((event.clientY - rect.top) / rect.height) * GRID_ROWS);
      const c = Math.floor(((event.clientX - rect.left) / rect.width) * GRID_COLS);
      return { r: Math.min(GRID_ROWS - 1, Math.max(0, r)), c: Math.min(GRID_COLS - 1, Math.max(0, c)) };
    };

    const startDrag = (event, cell) => {
      const section = warehouseLayout?.[cell.sectionIndex];
      if (!section) return;
      const { r, c } = pointerCell(event);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(cell.sectionIndex)); // required by Firefox
      setDrag({ index: cell.sectionIndex, offR: r - section.startRow, offC: c - section.startCol,
                width: section.width, height: section.height });
      setDropAt({ r: section.startRow, c: section.startCol });
    };

    const dragHandlers = onSectionMove && drag ? {
      onDragOver: (event) => {
        event.preventDefault();
        const { r, c } = pointerCell(event);
        const target = { r: Math.max(0, r - drag.offR), c: Math.max(0, c - drag.offC) };
        if (!dropAt || dropAt.r !== target.r || dropAt.c !== target.c) setDropAt(target);
      },
      onDrop: (event) => {
        event.preventDefault();
        if (dropAt) onSectionMove(drag.index, dropAt.r, dropAt.c);
        setDrag(null);
        setDropAt(null);
      },
    } : {};
    const createEmptyGrid = () => {
      return Array(GRID_ROWS).fill(null).map(() => 
        Array(GRID_COLS).fill(null)
      );
    };
  
    const [gridData, setGridData] = useState(createEmptyGrid());

    React.useEffect(() => {
      const newGrid = Array(GRID_ROWS).fill(null).map(() => Array(GRID_COLS).fill(null));

      (warehouseLayout || []).forEach((section) => {
        const { 
          id, 
          startRow, 
          startCol, 
          width, 
          height, 
          shelfPattern,
          spanRow = 1,
          spanCol = 1,
          customText,
          rotateText = false,
          type = 'shelf',
          showText = true,
          borderTop = true,
          borderBottom = true,
          borderLeft = true,
          borderRight = true
        } = section;

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
                const shelfId = getShelfId(section, r, c);
                const shelfNumber = shelfId.split('-')[1];

                const isSpanStart = r % spanRow === 0 && c % spanCol === 0;
                
                if (isSpanStart) {
                  newGrid[gridRow][gridCol] = {
                    type: 'shelf',
                    id: shelfId,
                    columnId: `${id}-${shelfNumber}`,
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
                    columnId: `${id}-${shelfNumber}`,
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
      
      // Every cell knows which section drew it (used by the map editor). Overlapping sections:
      // the cell object belongs to the last section that wrote it, so walk the sections backwards.
      const sections = warehouseLayout || [];
      for (let sectionIndex = sections.length - 1; sectionIndex >= 0; sectionIndex--) {
        const section = sections[sectionIndex];
        for (let r = 0; r < section.height; r++) {
          for (let c = 0; c < section.width; c++) {
            const cell = newGrid[section.startRow + r]?.[section.startCol + c];
            if (cell && cell.sectionIndex === undefined) cell.sectionIndex = sectionIndex;
          }
        }
      }

      setGridData(newGrid);
    }, [warehouseLayout, GRID_ROWS, GRID_COLS]);

    const getCellClassName = useCallback((cell) => {
      if (!cell) return 'empty-cell';
      if (cell.type === 'blocked') return 'blocked-cell';
      if (cell.type === 'customText') return 'custom-text-cell';
      if (cell.type === 'shelf') {
        if (cell.hidden) return 'hidden-cell';
        
        const classNames = ['shelf-cell', 'grid-item'];
        
        const status = getShelfStatus(cell.id);
        if (status) classNames.push(status);
        
        // Callers pass either column ids ("C-01", Ispezione) or full shelf ids ("C-01-1", Picking/Visualizza)
        if (highlightedShelves?.has(cell.columnId) || highlightedShelves?.has(cell.id)) {
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

    const renderCellContent = useCallback((cell, rowIndex, colIndex) => {
      if (cellRenderer && cell) {
        const customRenderedCell = cellRenderer(cell);
        if (customRenderedCell !== null) {
          return customRenderedCell;
        }
      }

      // Map editor: any cell selects its section, an empty cell starts a new one, sections can be dragged
      const editorClick = onSectionClick && cell ? () => onSectionClick(cell.sectionIndex, cell) : undefined;
      const dragProps = onSectionMove && cell && cell.sectionIndex !== undefined ? {
        draggable: true,
        onDragStart: (event) => startDrag(event, cell),
        onDragEnd: () => { setDrag(null); setDropAt(null); },
      } : {};
      const editorClass = selectedSection !== undefined && selectedSection !== null && cell?.sectionIndex === selectedSection
        ? ' section-selected' : '';

      if (cell?.type === 'customText') {
        return (
          <div
            className={getCellClassName(cell) + editorClass}
            onClick={editorClick}
            {...dragProps}
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
        // Text tooltips use the native title; rich ones (e.g. Picking's item table) an antd Tooltip
        const tip = tooltipContent ? tooltipContent(cell.id) : null;
        const shelfCell = (
          <div
            className={getCellClassName(cell) + editorClass}
            onClick={editorClick || (() => onCellClick(cell.id))}
            title={typeof tip === 'string' ? tip : undefined}
            {...dragProps}
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
        return React.isValidElement(tip) ? <Tooltip title={tip}>{shelfCell}</Tooltip> : shelfCell;
      }

      return (
        <div
          className={getCellClassName(cell) + editorClass}
          onClick={editorClick || (!cell && onEmptyCellClick ? () => onEmptyCellClick(rowIndex, colIndex) : undefined)}
          {...dragProps}
          style={{
            width: '100%',
            height: '100%',
            cursor: editorClick || (!cell && onEmptyCellClick) ? 'pointer' : undefined
          }}
        />
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getCellClassName, onCellClick, tooltipContent, cellRenderer, showFloorNumber,
        onSectionClick, selectedSection, onEmptyCellClick, onSectionMove, warehouseLayout]);

    return (
      <div style={{ width: '100%', height, position: 'relative' }} {...dragHandlers}>
        <div
          ref={gridRef}
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
                  {renderCellContent(cell, rowIndex, colIndex)}
                </div>
              )
            ))
          ))}
        </div>
        {drag && dropAt && (
          // Where the dragged section will land
          <div
            style={{
              position: 'absolute',
              top: `${(dropAt.r / GRID_ROWS) * 100}%`,
              left: `${(dropAt.c / GRID_COLS) * 100}%`,
              height: `${(drag.height / GRID_ROWS) * 100}%`,
              width: `${(drag.width / GRID_COLS) * 100}%`,
              border: '2px solid #1677ff',
              background: 'rgba(22, 119, 255, 0.15)',
              pointerEvents: 'none',
              zIndex: 5
            }}
          />
        )}
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
          .section-selected {
            outline: 2px dashed #1677ff;
            outline-offset: -2px;
            position: relative;
            z-index: 3;
          }
        `}</style>
      </div>
    );
  };

export default WarehouseGridSystem;