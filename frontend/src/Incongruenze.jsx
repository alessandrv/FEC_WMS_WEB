import React, { useState, useEffect } from 'react';
import { Table, Input, Spin, Button, Switch } from 'antd';
import { FixedSizeList } from 'react-window';
import axios from 'axios';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const SystemQuantitiesTable = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [groupByArticle, setGroupByArticle] = useState(false);

  useEffect(() => {
    const savedCounts = JSON.parse(localStorage.getItem('warehouseCounts') || '{}');
    setData(prevData => prevData.map(item => ({
      ...item,
      counted: savedCounts[`${item.id_art}-${item.location.area}-${item.location.scaffale}`] || 0
    })));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/system-quantities`);
        const savedCounts = JSON.parse(localStorage.getItem('warehouseCounts') || '{}');
        
        const sortedData = response.data.results.map(item => ({
          ...item,
          counted: savedCounts[`${item.id_art}-${item.location.area}-${item.location.scaffale}`] || 0
        })).sort((a, b) => 
          `${a.location.area}-${a.location.scaffale}-${a.location.colonna}-${a.location.piano}`
            .localeCompare(
              `${b.location.area}-${b.location.scaffale}-${b.location.colonna}-${b.location.piano}`
            )
        );
        setData(sortedData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleCountChange = (id_art, location, value) => {
    const key = `${id_art}-${location.area}-${location.scaffale}`;
    const newValue = parseInt(value) || 0;
    
    setData(prevData => 
      prevData.map(item => 
        item.id_art === id_art && item.location === location 
          ? { ...item, counted: newValue } 
          : item
      )
    );
    
    localStorage.setItem('warehouseCounts', 
      JSON.stringify({
        ...JSON.parse(localStorage.getItem('warehouseCounts') || '{}'),
        [key]: newValue
      })
    );
  };

  const filteredData = data.filter(item =>
    item.id_art.toLowerCase().includes(filter.toLowerCase())
  );

  const groupedData = groupByArticle
    ? filteredData.reduce((acc, item) => {
        const existingGroup = acc.find(group => group.id_art === item.id_art);
        if (existingGroup) {
          existingGroup.children.push(item);
        } else {
          acc.push({
            ...item,
            children: [item],
            system_quantity: item.system_quantity,
            total_wms_qty: item.total_wms_qty,
            difference: item.difference,
          });
        }
        return acc;
      }, [])
    : filteredData;

  const columns = [
    {
      title: 'Articolo',
      dataIndex: 'id_art',
      key: 'id_art',
      width: 150,
    },
    {
      title: 'Locazione',
      key: 'location',
      width: 200,
      render: (_, record) => (
        `${record.location.area}-${record.location.scaffale}-${record.location.colonna}-${record.location.piano}`
      ),
      sorter: (a, b) => 
        `${a.location.area}-${a.location.scaffale}-${a.location.colonna}-${a.location.piano}`
          .localeCompare(
            `${b.location.area}-${b.location.scaffale}-${b.location.colonna}-${b.location.piano}`
          ),
    },
    {
      title: 'Adapta',
      dataIndex: 'system_quantity',
      key: 'system_quantity',
      width: 120,
      sorter: (a, b) => a.system_quantity - b.system_quantity,
    },
    {
      title: 'WMS Locazione',
      dataIndex: 'wms_quantity',
      key: 'wms_quantity',
      width: 120,
      sorter: (a, b) => a.wms_quantity - b.wms_quantity,
    },
    {
      title: 'WMS Totale',
      dataIndex: 'total_wms_qty',
      key: 'total_wms_qty',
      width: 120,
      sorter: (a, b) => a.total_wms_qty - b.total_wms_qty,
    },
    {
      title: 'Differenza Adapta-WMS Totale',
      dataIndex: 'difference',
      key: 'difference',
      width: 120,
      sorter: (a, b) => a.difference - b.difference,
      render: (value) => (
        <span style={{ 
          color: value > 0 ? '#ff4d4f' : value < 0 ? '#52c41a' : '#000000',
          fontWeight: value !== 0 ? 600 : 400
        }}>
          {value}
        </span>
      )
    },
    {
      title: 'Descrizione',
      dataIndex: 'amg_dest',
      key: 'amg_dest',
      width: 300,
      render: text => <span className="text-ellipsis">{text.trim()}</span>,
    },
    {
      title: 'Conteggio locazione',
      key: 'counted',
      width: 120,
      render: (_, record) => (
        <Input 
          type="number"
          value={record.counted}
          onChange={(e) => handleCountChange(
            record.id_art,
            record.location,
            e.target.value
          )}
          style={{ width: 80 }}
        />
      )
    },
  ];

  const VirtualTableBody = (props) => {
    const rows = React.Children.toArray(props.children);
    return (
      <tbody>
        <FixedSizeList
          height={600}
          itemCount={rows.length}
          itemSize={50}
          width="100vw"
        >
          {({ index, style }) => {
            // rows[index] is already a <tr> element
            return React.cloneElement(rows[index], { style });
          }}
        </FixedSizeList>
      </tbody>
    );
  };
  
  
  const exportExcel = () => {
    // Define the columns to include in the export
    const exportData = data.map((item) => ({
        "Articolo": item.id_art,
        "WMS QTA": item.wms_quantity,
        "TOTAL WMS": item.total_wms_qty,
        "ADAPTA": item.system_quantity,
        "LOCAZIONE": `${item.location.area} ${item.location.scaffale} ${item.location.colonna} ${item.location.piano}`,
        "DIFFERENZA": item.difference,
        "Descrizione": item.amg_dest,
        "Conteggio": item.counted,

    }));

    // Create a worksheet from the data
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Create a new workbook and append the worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Articoli");

    // Generate a buffer
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    // Create a Blob from the buffer
    const dataBlob = new Blob([excelBuffer], { type: "application/octet-stream" });

    // Trigger the download using FileSaver
    saveAs(dataBlob, "Articoli.xlsx");
};
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: '16px', alignItems: 'center' }}>
        <Input.Search
          placeholder="Filtra ID articolo"
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 300 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Raggruppa per articolo:</span>
          <Switch
            checked={groupByArticle}
            onChange={setGroupByArticle}
          />
        </div>
        <Button onClick={exportExcel}>Esporta Excel</Button>
      </div>
      
      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={groupedData}
          pagination={false}
          width="100%"
          expandable={{
            defaultExpandAllRows: false,
            rowExpandable: record => record.children && record.children.length > 0,
          }}
        />
      </Spin>
    </div>
  );
};

export default SystemQuantitiesTable;