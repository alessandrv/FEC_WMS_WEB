import React, { useState, useEffect } from 'react';
import { Table, Input, Spin } from 'antd';
import { FixedSizeList } from 'react-window';
import axios from 'axios';

const SystemQuantitiesTable = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

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

  const columns = [
    {
      title: 'Article ID',
      dataIndex: 'id_art',
      key: 'id_art',
      width: 150,
    },
    {
      title: 'Location',
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
      title: 'System Qty',
      dataIndex: 'system_quantity',
      key: 'system_quantity',
      width: 120,
      sorter: (a, b) => a.system_quantity - b.system_quantity,
    },
    {
      title: 'WMS Qty',
      dataIndex: 'wms_quantity',
      key: 'wms_quantity',
      width: 120,
      sorter: (a, b) => a.wms_quantity - b.wms_quantity,
    },
    {
      title: 'WMS Total',
      dataIndex: 'total_wms_qty',
      key: 'total_wms_qty',
      width: 120,
      sorter: (a, b) => a.total_wms_qty - b.total_wms_qty,
    },
    {
      title: 'Difference',
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
      title: 'Description',
      dataIndex: 'amg_dest',
      key: 'amg_dest',
      width: 300,
      render: text => <span className="text-ellipsis">{text.trim()}</span>,
    },
    {
      title: 'Counted',
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
  
  

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Filter by Article ID"
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 300 }}
        />
      </div>
      
      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={filteredData}
          pagination={false}
          width="100%"
  
        />
      </Spin>
    </div>
  );
};

export default SystemQuantitiesTable;