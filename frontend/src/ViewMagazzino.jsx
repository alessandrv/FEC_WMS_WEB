import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { message, Modal, Tooltip, Spin, Pagination } from 'antd'; // Import Spin for loading spinner
import { useLocation, useNavigate } from 'react-router-dom';
import './ViewMagazzino.css';
import { LoadingOutlined } from '@ant-design/icons';
import WarehouseGrid from './GridComponent';
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

const ViewMagazzino = () => {
  const [highlightedShelf, setHighlightedShelf] = useState('');
  const [shelvesData, setShelvesData] = useState([]);
  const [debug, setDebug] = useState({});
  const [loading, setLoading] = useState(true); // State for loading spinner
  const inputRef = useRef(null);
  const location = useLocation();
  const [showHiddenInput, setShowHiddenInput] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const navigate = useNavigate();
  const [quantita, setQuantita] = useState(0);
  const [volumes, setVolumes] = useState([]);
  const [totalVolumeRequired, setTotalVolumeRequired] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);
  const [selectedArea, setSelectedArea] = useState('A');

  const renderWarehouseSection = () => {
    if (currentPage === 1) {
      return (
        <>
          <WarehouseGrid
            group='A'
            columns={8}
            rows={4}
            getShelfClass={getShelfClass}
            onShelfClick={handleShelfClick}
            tooltipContent={getTooltipContent}
            gridClassName="large-grid"
          />
          <div className="spacer" />
          <div>
            <WarehouseGrid
              group="B"
              columns={7}
              rows={4}
              getShelfClass={getShelfClass}
              onShelfClick={handleShelfClick}
              tooltipContent={getTooltipContent}
              gridClassName="smaller-grid second-group"
            />
            <WarehouseGrid
              group="C"
              columns={7}
              rows={5}
              getShelfClass={getShelfClass}
              onShelfClick={handleShelfClick}
              tooltipContent={getTooltipContent}
              gridClassName="smaller-grid second-group"
            />
          </div>
          <div className="spacer" />
          <WarehouseGrid
            group="D"
            columns={7}
            rows={6}
            getShelfClass={getShelfClass}
            onShelfClick={handleShelfClick}
            tooltipContent={getTooltipContent}
            gridClassName="smaller-grid third-grid"
          />
        </>
      );
    } else if (currentPage === 2) {
      return (
        <>
                    <div className="spacer" />

        <WarehouseGrid
          group="E"
          columns={8}
          rows={5}
          getShelfClass={getShelfClass}
          onShelfClick={handleShelfClick}
          tooltipContent={getTooltipContent}
          gridClassName="large-grid"
        />
      </>
      );
    }
  };
  const {
    articoloCode,
    descrizioneArticolo,
    fornitoreCode,
    ragioneSocialeFornitore,
    movimentoCode,
    quantitaPerPacco,
    totalePacchi,
    dimensione
  } = location.state || {};

  // Fetch volumes on component mount
  useEffect(() => {
    const fetchVolumes = async () => {
      try {
        const response = await axios.get('${process.env.REACT_APP_API_URL}/api/dimensioni');
        setVolumes(response.data);
      } catch (error) {
        console.error('Error details:', error);
      }
    };

    fetchVolumes();
  }, []);

  // Calculate the total volume based on dimensione and quantitaPerPacco
  useEffect(() => {
    if (volumes.length > 0 && dimensione) {
      const dimensioneData = volumes.find(vol => vol.dimensione === dimensione);
      if (dimensioneData) {
        const calculatedVolume = dimensioneData.volume * totalePacchi;
        setTotalVolumeRequired(calculatedVolume);
        setTotalVolume(calculatedVolume);
      } else {
        console.error(`No matching volume found for dimensione: ${dimensione}`);
      }
    }
  }, [volumes, dimensione, totalePacchi]);

  // Fetch shelves data
  useEffect(() => {
    const fetchShelvesData = async () => {
      setLoading(true); // Start loading
      try {
        const response = await axios.get('${process.env.REACT_APP_API_URL}/api/shelves');
        setShelvesData(response.data);
        console.log('Fetched shelves data:', response.data);
      } catch (error) {
        console.error('Error fetching shelves data:', error);
      } finally {
        setLoading(false); // Stop loading
      }
    };

    fetchShelvesData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputRef.current && !inputRef.current.contains(event.target)) {
        inputRef.current.focus();
      }
    };

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

 
  useEffect(() => {
    const newDebug = {};
    const allShelves = [
      ...generateShelfNames('A', 8, 4),
      ...generateShelfNames('B', 7, 4),
      ...generateShelfNames('C', 7, 5),
      ...generateShelfNames('D', 7, 6),
      ...generateShelfNames('E', 8, 5)
    ];

    allShelves.forEach(shelf => {
      const [scaffale, colonna, piano] = shelf.split('-');
      const shelfData = shelvesData.find(s =>
        s.scaffale === scaffale &&
        s.colonna === colonna &&
        s.piano === piano.toString()
      );

      newDebug[shelf] = {
        shelf,
        shelfData,
        quantita: totalVolumeRequired,
        volumeLibero: shelfData ? shelfData.volume_libero : 'N/A',
        hasEnoughSpace: shelfData ? (shelfData.volume_libero - totalVolumeRequired) > 0 : 'N/A',
      };
    });

    setDebug(newDebug);
  }, [shelvesData, totalVolumeRequired]);

  const postShelfData = async (data) => {
    try {
      await axios.post('${process.env.REACT_APP_API_URL}/api/conferma-inserimento', data);
      message.success('Dati salvati con successo!');
      navigate(-1);
    } catch (error) {
      console.error('Error posting shelf data:', error);
      message.error('Errore nel salvataggio dei dati.');
    }
  };

  const handleBarcodeScan = (event) => {
    if (event.key === 'Enter') {
      const scannedValue = event.target.value.trim();

      const [area, scaffale, colonna, piano] = scannedValue.split('-');
      const shelfData = shelvesData.find(s =>
        s.area === area &&
        s.scaffale === scaffale &&
        s.colonna === colonna &&
        s.piano === piano.toString()
      );

      if (!shelfData) {
        message.error(`Scaffale scansionato non presente nel database: ${scannedValue}`);
        event.target.value = '';
        return;
      }

      const hasEnoughSpace = (shelfData.volume_libero - totalVolumeRequired) > 0;

      if (!hasEnoughSpace) {
        message.error(`Lo scaffale ${scannedValue} risulta pieno.`);
        event.target.value = '';
        return;
      }
      setHighlightedShelf(scannedValue);

      const confirmPlacement = () => {
        Modal.confirm({
          title: `Confermi immagazzinamento della merce in posizione: ${scannedValue}?`,
          content: (
            <div>
              <p><strong>Articolo:</strong> {descrizioneArticolo} ({articoloCode})</p>
              <p><strong>Fornitore:</strong> {ragioneSocialeFornitore} ({fornitoreCode})</p>
              <p><strong>Movimento:</strong> {movimentoCode}</p>
              <p><strong>Quantità per pacco:</strong> {quantitaPerPacco}</p>
              <p><strong>Totale pacchi:</strong> {totalePacchi}</p>
              <p><strong>Dimensione:</strong> {dimensione}</p>
              <p><strong>Quantità totale:</strong> {quantitaPerPacco * totalePacchi}</p>
              <p><strong>Volume totale:</strong> {totalVolume} m³</p>
              <p><strong>Scaffale rilevato:</strong> {scannedValue}</p>
              {shelfData ? (
                <>
                  <p><strong>Volume libero:</strong> {shelfData.volume_libero} m³</p>
                </>
              ) : (
                <p style={{ color: 'red' }}>Dati scaffale non trovati!</p>
              )}
            </div>
          ),
          onOk: () => {
            const postData = {
              area: scannedValue.split('-')[0],
              scaffale: scannedValue.split('-')[1],
              colonna: scannedValue.split('-')[2],
              piano: scannedValue.split('-')[3],
              codice_articolo: articoloCode,
              codice_movimento: movimentoCode,
              codice_fornitore: fornitoreCode,
              quantita: quantitaPerPacco,
              dimensioni: dimensione,
              numero_pacchi: totalePacchi,
              volume: totalVolume
            };
            postShelfData(postData);
            event.target.value = ''; // Clear input
          },
          onCancel: () => {
            setHighlightedShelf('');
            event.target.value = ''; // Clear input
          },
        });
      };

      confirmPlacement();
    }
  };

  const getShelfClass = useCallback((shelf) => {
    const [scaffale, colonna, piano] = shelf.split('-');
    const shelfData = shelvesData.find(s =>
      s.scaffale === scaffale &&
      s.colonna === colonna &&
      s.piano === piano.toString()
    );

    if (shelfData) {
      const hasEnoughSpace = (shelfData.volume_libero - totalVolumeRequired) > 0;

      if (shelf === highlightedShelf) {
        return hasEnoughSpace ? 'grid-item highlight-green' : 'grid-item highlight-red';
      }
      return hasEnoughSpace ? 'grid-item green' : 'grid-item red';
    } else {
      return 'grid-item yellow';
    }
  }, [shelvesData, totalVolumeRequired, highlightedShelf]);

  const handleShelfClick = (shelf) => {
    setHighlightedShelf(shelf);
  };

  const getTooltipContent = useCallback((shelf) => {
    return `Volume Libero: ${debug[shelf]?.volumeLibero || 'N/A'}m³`;
  }, [debug]);
  return (
    <div className="view-magazzino">
      {loading ? (
        <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
      ) : (
        <div className="view-magazzino">
          <input
            ref={inputRef}
            type="text"
            className="hidden-input"
            onKeyDown={handleBarcodeScan}
            autoFocus
            inputMode="none"
          />
          <div className="grid-container">
            {renderWarehouseSection()}
          </div>
          <div className="pagination-container">
            <Pagination
              current={currentPage}
              total={2}
              pageSize={1}
              onChange={(page) => setCurrentPage(page)}
              showSizeChanger={false}
              simple
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewMagazzino;