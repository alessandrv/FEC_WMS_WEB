import React, { useEffect, useState, useMemo } from 'react';
import { Table, Tag, message, Input, Button, Row, Col, Card } from 'antd';
import axios from 'axios';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import Title from 'antd/es/typography/Title';

const IncomingItemsTable = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [articleFilter, setArticleFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');

  const fetchIncomingItems = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/articoli-in-arrivo`);
      const rawData = response.data;

      if (rawData.results && Array.isArray(rawData.results)) {
        setItems(rawData.results);
      } else {
        console.error('No results array found in fetched data', rawData);
        setItems([]);
      }
    } catch (error) {
      console.error('Error fetching incoming items:', error);
      message.error('Failed to load incoming items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncomingItems();
  }, []);
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const articleMatch = item.ofc_arti?.toLowerCase().includes(articleFilter.toLowerCase() || '');
      const descriptionMatch = item.article_description?.toLowerCase().includes(descriptionFilter.toLowerCase() || '');
      return articleMatch && descriptionMatch;
    });
  }, [items, articleFilter, descriptionFilter]);
  
  const columns = [
    {
      title: 'Articolo',
      dataIndex: 'ofc_arti',
      key: 'ofc_arti',
      sorter: (a, b) => a.ofc_arti.localeCompare(b.ofc_arti),
    },
    {
      title: 'Descrizione',
      dataIndex: 'article_description',
      key: 'article_description',
      sorter: (a, b) => a.article_description.localeCompare(b.article_description),
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
      sorter: (a, b) => new Date(a.ofc_dtco) - new Date(b.ofc_dtco),
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
      filters: [
        { text: 'In arrivo', value: 'S' },
        { text: 'Non in arrivo', value: 'N' },
      ],
      onFilter: (value, record) => record.ofc_inarrivo === value,
    },
    {
      title: 'Giacenza',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
      sorter: (a, b) => a.total_quantity - b.total_quantity,
    },
  ];

  return (
    <Card>
      <Title level={2}>Articoli in Arrivo</Title>

      <Row gutter={16} style={{ marginBottom: '20px' }}>
        <Col>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Cerca per Articolo"
            value={articleFilter}
            onChange={(e) => setArticleFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Cerca per Descrizione"
            value={descriptionFilter}
            onChange={(e) => setDescriptionFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setArticleFilter('');
              setDescriptionFilter('');
              fetchIncomingItems();
            }}
          >
            Reset
          </Button>
        </Col>
      </Row>

      <Table
        dataSource={filteredItems}
        columns={columns}
        rowKey={(record) => `${record.ofc_tipo}-${record.ofc_code}-${record.ofc_arti}`}
        loading={loading}
        pagination={ false}
      />
    </Card>
  );
};

export default IncomingItemsTable;
