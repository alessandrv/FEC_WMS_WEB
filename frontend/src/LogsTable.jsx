import React, { useEffect, useState } from 'react';
import { Table, Input, Button, Tag, Card, Typography, Space, Tooltip, Modal, message } from 'antd';
import {  ReloadOutlined, InfoCircleOutlined, UndoOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;

const LogsTable = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [totalLogs, setTotalLogs] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [revertLoading, setRevertLoading] = useState(false);

  useEffect(() => {
    fetchLogs(currentPage);
  }, [currentPage]);

  const fetchLogs = async (page) => {
    setLoading(true);
    try {
      const params = { 
        page, 
        per_page: pageSize
      };
      
      // Only add search text if it's not empty
      if (searchText) {
        params.operation_details = searchText;
      }
      
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/operation-logs`, { params });
      setLogs(response.data.logs || []);
      
      // Handle both direct total and nested pagination object
      if (response.data.pagination && response.data.pagination.total) {
        setTotalLogs(response.data.pagination.total);
      } else {
        setTotalLogs(response.data.total || 0);
      }
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

  const handleRevertOperation = (logId) => {
    Modal.confirm({
      title: 'Annulla operazione',
      content: 'Sei sicuro di voler annullare questa operazione? Questa azione non può essere annullata.',
      okText: 'Sì, annulla',
      cancelText: 'No',
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        setRevertLoading(true);
        try {
          await axios.post(`${process.env.REACT_APP_API_URL}/api/revert-operation`, { log_id: logId });
          message.success('Operazione annullata con successo');
          fetchLogs(currentPage); // Refresh logs after successful reversion
        } catch (error) {
          console.error('Error reverting operation:', error);
          
          // Handle detailed error messages
          const errorData = error.response?.data;
          if (errorData?.details) {
            Modal.error({
              title: errorData.error || 'Errore',
              content: errorData.details,
            });
          } else {
            message.error(errorData?.error || 'Errore durante l\'annullamento dell\'operazione');
          }
        } finally {
          setRevertLoading(false);
        }
      },
    });
  };

  const columns = [
    {
      title: 'Data',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (date) => (
        <Tooltip title={new Date(date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}>
          {new Date(date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
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
        { text: 'MULTIPLE_INSERT', value: 'MULTIPLE_INSERT' },
        { text: 'UNDO', value: 'UNDO' },
        { text: 'REVERT', value: 'REVERT' },
        { text: 'UPDATE', value: 'UPDATE' },
        { text: 'DELETE', value: 'DELETE' },
        { text: 'PRELIEVO', value: 'PRELIEVO' },
        { text: 'TRANSFER', value: 'TRANSFER' },
      ],
      onFilter: (value, record) => record.operation_type === value,
      render: (type) => {
        let color;
        switch(type) {
          case 'INSERT': color = 'success'; break;
          case 'MULTIPLE_INSERT': color = 'success'; break;
          case 'REVERT': color = 'error'; break;
          case 'UPDATE': color = 'processing'; break;
          case 'DELETE': color = 'error'; break;
          case 'UNDO': color = 'error'; break;
          case 'PRELIEVO': color = 'warning'; break;
          case 'TRANSFER': color = 'blue'; break;
          default: color = 'default';
        }
        return <Tag color={color}>{type}</Tag>;
      },
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
      title: 'Articolo',
      dataIndex: 'article_code',
      key: 'article_code',
      render: (code) => code || '-',
    },
    {
      title: 'Da',
      dataIndex: 'source_location',
      key: 'source_location',
      render: (loc) => loc || '-',
    },
    {
      title: 'A',
      dataIndex: 'destination_location',
      key: 'destination_location',
      render: (loc) => loc || '-',
    },
    {
      title: 'Quantità',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (qty) => qty != null ? qty : '-',
    },
    {
      title: 'IP',
      dataIndex: 'ip_address',
      key: 'ip_address',
    },
    {
      title: 'Azioni',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        record.can_revert ? (
          <Button 
            type="primary" 
            danger 
            icon={<UndoOutlined />} 
            onClick={() => handleRevertOperation(record.id)}
            loading={revertLoading}
            style={{ width: '100px' }}
          >
            Annulla
          </Button>
        ) : (
          record.is_undone ? (
            <Tag color="default" style={{ padding: '5px 10px' }}>Annullato</Tag>
          ) : (
            '-'
          )
        )
      ),
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
                setCurrentPage(1);
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
            onChange: (page) => setCurrentPage(page),
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total) => `Totale ${total} operazioni`
          }}
          onChange={handleTableChange}
          scroll={{ x: 'max-content' }}
        />
      </Space>
    </Card>
  );
};

export default LogsTable;
