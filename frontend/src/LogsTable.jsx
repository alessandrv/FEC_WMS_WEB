import React, { useEffect, useState } from 'react';
import { Table, Input, Button, Tag, Card, Typography, Space, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;

const LogsTable = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [totalLogs, setTotalLogs] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  useEffect(() => {
    fetchLogs(currentPage);
  }, [currentPage]);

  const fetchLogs = async (page) => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/operation-logs`, {
        params: { page, limit: pageSize, operation_details: searchText },
      });
      setLogs(response.data.logs || []);
      setTotalLogs(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current);
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchLogs(1);
  };

  const columns = [
    {
      title: 'Data',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (date) => (
        <Tooltip title={new Date(date).toLocaleString('it-IT', { timeZone: 'UTC' })}>
          {new Date(date).toLocaleString('en-GB', { timeZone: 'UTC' })}
        </Tooltip>
      ),
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    },
    {
      title: 'Operazione',
      dataIndex: 'operation_type',
      key: 'operation_type',
      filters: [
        { text: 'INSERT', value: 'INSERT' },
        { text: 'UPDATE', value: 'UPDATE' },
        { text: 'DELETE', value: 'DELETE' },
      ],
      onFilter: (value, record) => record.operation_type === value,
      render: (type) => (
        <Tag color={type === 'INSERT' ? 'success' : type === 'UPDATE' ? 'processing' : 'error'}>
          {type}
        </Tag>
      ),
    },
    {
      title: 'Dettagli',
      dataIndex: 'operation_details',
      key: 'operation_details',
      ellipsis: {
        showTitle: false,
      },
      
    },
    {
      title: 'IP',
      dataIndex: 'ip_address',
      key: 'ip_address',
    },
  ];

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Title level={2}>
          Log sistema WMS
          <Tooltip title="Visualizza i log delle operazioni del sistema WMS">
            <InfoCircleOutlined style={{ fontSize: '16px', marginLeft: '8px' }} />
          </Tooltip>
        </Title>
        <Space>
          <Input.Search
            placeholder="Cerca nei log"
            allowClear
            enterButton="Cerca"
            size="large"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 300 }}
          />
          <Tooltip title="Ricarica i log">
            <Button
              icon={<ReloadOutlined />}
              size="large"
              onClick={() => {
                setSearchText('');
                fetchLogs(1);
              }}
            />
          </Tooltip>
        </Space>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            total: totalLogs,
            pageSize,
            showSizeChanger: false,
            showQuickJumper: true,
          }}
          onChange={handleTableChange}
          scroll={{ x: 'max-content' }}
        />
      </Space>
    </Card>
  );
};

export default LogsTable;
