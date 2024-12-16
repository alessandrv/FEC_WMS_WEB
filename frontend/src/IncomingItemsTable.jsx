import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Input, Button, Row, Col } from 'antd';
import axios from 'axios';
import Title from 'antd/es/typography/Title';

const IncomingItemsTable = () => {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]); // State for filtered items
  const [loading, setLoading] = useState(false);

  // Filter states
  const [articleFilter, setArticleFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');

  // Fetch incoming items with filters
  const fetchIncomingItems = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/articoli-in-arrivo`);
      const rawData = response.data;

      if (rawData.results && Array.isArray(rawData.results)) {
        setItems(rawData.results);
        setFilteredItems(rawData.results); // Initialize filtered items with fetched data
      } else {
        console.error('No results array found in fetched data', rawData);
        setItems([]);
        setFilteredItems([]);
      }
    } catch (error) {
      console.error('Error fetching incoming items:', error);
      message.error('Failed to load incoming items');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters locally
  const applyFilters = () => {
    let filtered = [...items];

    if (articleFilter) {
      filtered = filtered.filter(item =>
        item.ofc_arti.toLowerCase().includes(articleFilter.toLowerCase())
      );
    }

    if (descriptionFilter) {
      filtered = filtered.filter(item =>
        item.article_description.toLowerCase().includes(descriptionFilter.toLowerCase())
      );
    }

    setFilteredItems(filtered);
  };

  // Trigger filtering when filter state changes
  useEffect(() => {
    applyFilters();
  }, [articleFilter, descriptionFilter]);

  useEffect(() => {
    fetchIncomingItems();
  }, []);

  const columns = [
    {
      title: 'Articolo',
      dataIndex: 'ofc_arti',
      key: 'ofc_arti',
    },
    {
      title: 'Descrizione',
      dataIndex: 'article_description',
      key: 'article_description',
    },
    {
      title: 'Tipo',
      dataIndex: 'ofc_tipo',
      key: 'ofc_tipo',
    },
    {
      title: 'Codice',
      dataIndex: 'ofc_code',
      key: 'ofc_code',
    },
    {
      title: 'Data Consegna',
      dataIndex: 'ofc_dtco',
      key: 'ofc_dtco',
      render: (date) => new Date(date).toLocaleDateString('it-IT'),
    },
    {
      title: 'Stato Consegna',
      dataIndex: 'ofc_inarrivo',
      key: 'ofc_inarrivo',
      render: (status) => (
        <Tag color={status === 'S' ? 'green' : 'red'}>
          {status === 'S' ? 'In arrivo' : 'Non in arrivo'}
        </Tag>
      ),
    },
    {
      title: 'Giacenza',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
    },
  ];

  return (
    <>
      <Title level={2} className="title">In Arrivo</Title>

      {/* Filter Inputs */}
      <Row gutter={16} style={{ marginBottom: '20px' }}>
        <Col>
          <Input
            placeholder="Search by Articolo"
            value={articleFilter}
            onChange={(e) => setArticleFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Input
            placeholder="Search by Descrizione"
            value={descriptionFilter}
            onChange={(e) => setDescriptionFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Button type="primary" onClick={applyFilters}>Apply Filters</Button>
        </Col>
      </Row>

      {/* Main Table */}
      <Table
        dataSource={filteredItems} // Use filteredItems for the table data
        columns={columns}
        rowKey={(record) => record.ofc_code} // Use a stable key based on 'ofc_code'
        loading={loading}
        pagination={false}
      />
    </>
  );
};

export default IncomingItemsTable;
