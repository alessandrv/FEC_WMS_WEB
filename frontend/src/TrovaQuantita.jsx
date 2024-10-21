import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, message, Card } from 'antd';
import axios from 'axios';

const GetQuantitaRegistrata = ({articoloCode}) => {
  const [codiceArticolo, setCodiceArticolo] = useState('');
  const [expression, setExpression] = useState('');
  const [descrizioneArticolo, setDescrizioneArticolo] = useState('');
  const codiceArticoloRef = useRef(null);
  const [codiceScansionato, setCodiceScansionato] = useState('');
  const fetchDescrizione = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/articolo-descrizione?codice_articolo=${articoloCode}`);
      setDescrizioneArticolo(response.data.descrizione || 'Descrizione non trovata');
    } catch (ex) {
      message.error(`Errore nel recupero della descrizione: ${ex.response?.data?.error || ex.message}`);
    }
  };
  useEffect(() => {
    if (articoloCode) {
      handleArticoloEnter();
    }
  }, [articoloCode]); // Add articoloCode as a dependency
  
  const fetchQuantita = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-quantita-registrata?codice_articolo=${articoloCode}`);
      setExpression(response.data.espressione || 'Espressione non trovata');
    } catch (ex) {
      message.error(`Errore nel recupero della quantità: ${ex.response?.data?.error || ex.message}`);
    }
  };

  const handleArticoloEnter = async () => {
    if (!articoloCode) {
      message.error('Per favore inserisci un codice articolo');
      return;
    }

    // Fetch both descrizione and quantita
    await fetchDescrizione();
    await fetchQuantita();

    // Clear the input field and focus back on it for the next entry
    setCodiceScansionato(articoloCode)
    setCodiceArticolo('');
    
  };

  return (
    <div>
      
        
        <div style={{ marginTop: '20px' }}>
            
          <div><strong>Codice:</strong> {codiceScansionato}</div>
          <div><strong>Totale registrato nel magazzino:</strong> {expression}</div>
          <div><strong>Descrizione Articolo:</strong> {descrizioneArticolo}</div>
        </div>
    </div>
  );
};

export default GetQuantitaRegistrata;
