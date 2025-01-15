import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Input, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import axios from 'axios';

const LogsTable = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [tempSearchText, setTempSearchText] = useState('');
  const [totalLogs, setTotalLogs] = useState(0); // Total logs for pagination
  const [currentPage, setCurrentPage] = useState(1); // Current page
  const [pageSize] = useState(20); // Page size

  useEffect(() => {
    fetchLogs(currentPage);
  }, [currentPage]);

  const fetchLogs = async (page) => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/operation-logs`, {
        params: {
          page,
          limit: pageSize,
          operation_details: searchText, // Pass the search text as a parameter
        },
      });
      setLogs(response.data.logs || []);
      setTotalLogs(response.data.total || 0); // Set total logs for pagination
    } catch (error) {
      console.error('Error fetching logs:', error);
      message.error('Failed to fetch logs. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current); // Update current page when pagination changes
  };

  const columns = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (date) => new Date(date).toLocaleString('it-IT'),
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    },
    {
      title: 'Operation Type',
      dataIndex: 'operation_type',
      key: 'operation_type',
      filters: [
        { text: 'INSERT', value: 'INSERT' },
        { text: 'UPDATE', value: 'UPDATE' },
        { text: 'DELETE', value: 'DELETE' },
        { text: 'QUERY', value: 'QUERY' },
      ],
      onFilter: (value, record) => record.operation_type === value,
      render: (type) => (
        <Tag color={type === 'INSERT' ? 'green' : type === 'UPDATE' ? 'blue' : 'red'}>
          {type}
        </Tag>
      ),
    },
    {
      title: 'Details',
      dataIndex: 'operation_details',
      key: 'operation_details',
      ellipsis: true,
    },
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      key: 'ip_address',
    },
  ];

  const filteredLogs = logs.filter((log) =>
    log.operation_details?.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div>
      <h2>Operation Logs</h2>
      <Input
        placeholder="Search operation details"
        value={tempSearchText}
        onChange={(e) => setTempSearchText(e.target.value)}
        onPressEnter={() => {
          setSearchText(tempSearchText);
          fetchLogs(1); // Fetch logs from the first page after a new search
        }}
        style={{ marginBottom: '16px', width: '300px' }}
        addonAfter={
          <SearchOutlined
            onClick={() => {
              setSearchText(tempSearchText);
              fetchLogs(1); // Fetch logs from the first page after a new search
            }}
            style={{ cursor: 'pointer' }}
          />
        }
      />
      <Button
        type="default"
        style={{ marginLeft: '8px' }}
        onClick={() => {
          setSearchText('');
          setTempSearchText('');
          fetchLogs(1); // Reset logs and fetch the first page
        }}
      >
        Reset
      </Button>
      <Table
        dataSource={filteredLogs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          total: totalLogs,
          pageSize,
          showSizeChanger: false,
        }}
        onChange={handleTableChange}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
};

export default LogsTable;
