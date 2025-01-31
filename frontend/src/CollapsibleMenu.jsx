import React, { useState, useEffect } from 'react';
import { Layout, Button, Drawer, Card, Row, Col, message, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { QuestionCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

import {
  HomeOutlined,
  SwapOutlined,
  FileSearchOutlined,
  BoxPlotOutlined,
  MenuOutlined,
  CheckOutlined,
  CommentOutlined,
  DeliveredProcedureOutlined,
  InsertRowAboveOutlined,
  DatabaseFilled,
} from '@ant-design/icons';

const { Title } = Typography;

const CollapsibleMenu = () => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState('80%');

  // Responsive drawer width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setDrawerWidth('400px');
      } else {
        setDrawerWidth('80%');
      }
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showDrawer = () => setDrawerVisible(true);
  const closeDrawer = () => setDrawerVisible(false);
// Update the help function to use the new endpoint
const handleHelpRequest = async () => {
  try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/send-help-request`);

      if (response.status === 200) {
          message.success('Richiesta di aiuto inviata con successo');
      }
  } catch (error) {
      console.error('Error sending help request:', error);
      message.error('Errore nell\'invio della richiesta di aiuto');
  }
};
  const SectionTitle = ({ children }) => (
    <Title level={4} style={{ 
      marginTop: '24px', 
      marginBottom: '16px',
      borderBottom: '2px solid #e62d3a',
      paddingBottom: '8px'
    }}>
      {children}
    </Title>
  );

  const MenuCard = ({ to, icon, title, onClick }) => (
    <Link to={to} onClick={onClick}>
      <Card
        hoverable
        style={{
          textAlign: 'center',
          height: '120px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          transition: 'all 0.3s ease'
        }}
      >
        {React.cloneElement(icon, { 
          style: { 
            fontSize: '2.5rem', 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '8px',
            color: '#e62d3a'
          } 
        })}
        <span style={{ fontSize: '1.1rem' }}>{title}</span>
      </Card>
    </Link>
  );

  return (
    <>
      <Button
        className="floating-button"
        onClick={showDrawer}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}
        size="large"
        icon={<MenuOutlined />}
        type="primary"
      />

      <Drawer
        title={<span style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>Menu</span>}
        placement="right"
        closable={true}
        onClose={closeDrawer}
        open={drawerVisible}
        width={drawerWidth}
        bodyStyle={{ padding: '12px' }}
      >
        <SectionTitle>Accettazione</SectionTitle>
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <MenuCard 
              to="/accettazione" 
              icon={<CheckOutlined />} 
              title="Accettazione" 
              onClick={closeDrawer}
            />
          </Col>
          <Col span={8}>
            <MenuCard 
            style={{display:'flex'}}
              to="/in-arrivo" 
              icon={<DeliveredProcedureOutlined />} 
              title="In arrivo" 
              onClick={closeDrawer}
            />
          </Col>
        </Row>

        <SectionTitle>Magazzino</SectionTitle>
         {/* First Row: Magazzino Section */}
         <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
          <Col span={8}>
            <MenuCard
              to="/"
              icon={<HomeOutlined />}
              title="Deposito"
              onClick={closeDrawer}
            />
          </Col>
          <Col span={8}>
            <MenuCard
              to="/trasferimenti-magazzino"
              icon={<SwapOutlined />}
              title="Trasferimento"
              onClick={closeDrawer}
            />
          </Col>
          <Col span={8}>
            <MenuCard
              to="/visualizza-magazzino"
              icon={<FileSearchOutlined />}
              title="Visualizza Magazzino"
              onClick={closeDrawer}
            />
          </Col>
        </Row>

        {/* Second Row: Prelievi Section */}
        <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
          <Col span={8}>
            <MenuCard
              to="/prelievi"
              icon={<BoxPlotOutlined />}
              title="Prelievi"
              onClick={closeDrawer}
            />
          </Col>
        </Row>

        <SectionTitle>Sistema</SectionTitle>
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <MenuCard
              to="/inventario"
              icon={<InsertRowAboveOutlined />}
              title="Inventario"
              onClick={closeDrawer}
            />
          </Col>
          <Col span={8}>
            <MenuCard
              to="/logs"
              icon={<DatabaseFilled />}
              title="Log sistema"
              onClick={closeDrawer}
            />
          </Col>
        </Row>
        <div style={{ 
            position: 'absolute', 
            top: '10px', 
            right: '10px', 
            zIndex: 1000 
        }}>
            <Button
                type="primary"
                icon={<QuestionCircleOutlined />}
                onClick={handleHelpRequest}
            >
                Aiuto
            </Button>
        </div>
      </Drawer>
    </>
  );
};

export default CollapsibleMenu;