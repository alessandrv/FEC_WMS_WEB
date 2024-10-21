import React, { useEffect, useState } from 'react';
import { Table, Button, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';

const DynamicForm = ({ data }) => {
  const [childItems, setChildItems] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Assuming data includes child items, set it here
    setChildItems(data.childItems || []);
  }, [data]);

  const handleVisualizzaClick = (item) => {
    // Navigate to the ViewMagazzino component with necessary state
    navigate('/view-magazzino', {
      state: {
        articoloCode: item.articoloCode,
        descrizioneArticolo: item.descrizioneArticolo,
        fornitoreCode: item.fornitoreCode,
        ragioneSocialeFornitore: item.ragioneSocialeFornitore,
        movimentoCode: item.movimentoCode,
        quantitaPerPacco: item.quantitaPerPacco,
        totalePacchi: item.totalePacchi,
        dimensione: item.dimensione,
        initialShelf: item.scaffale, // Assuming 'scaffale' is the shelf reference
      },
    });
  };

  const columns = [
    {
      title: 'Nome',
      dataIndex: 'nome',
    },
    {
      title: 'Quantità',
      dataIndex: 'quantita',
    },
    {
      title: 'Azione',
      render: (_, item) => (
        <Button onClick={() => handleVisualizzaClick(item)}>Visualizza</Button>
      ),
    },
  ];

  return (
    <div>
      <Table
        dataSource={childItems}
        columns={columns}
        rowKey="id" // Assuming each item has a unique 'id'
      />
    </div>
  );
};

export default DynamicForm;
