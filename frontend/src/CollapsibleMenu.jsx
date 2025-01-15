import React, { useState } from 'react';
import { Layout, Button, Drawer, Card, Row, Col, Menu } from 'antd';
import { Link } from 'react-router-dom';
import {
  HomeOutlined,
  SwapOutlined,
  FileSearchOutlined,
  BoxPlotOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  CheckOutlined,
  CommentOutlined,
  DeliveredProcedureOutlined,
  InsertRowAboveOutlined,
  Loading3QuartersOutlined,
  DatabaseFilled,
} from '@ant-design/icons';
import './CollapsibleMenu.css'; // Ensure to include your CSS file for additional styles

const { Sider } = Layout;

const CollapsibleMenu = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

  const showDrawer = () => {
    setDrawerVisible(true);
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
  };

  return (
    <>
      {/* Sidebar for larger screens */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={toggleCollapsed}
        className="desktop-sider"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '64px',
            color: 'white',
          }}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>
        <Menu theme="dark" mode="inline">
          <Menu.SubMenu key="sub1" title="Magazzino" icon={<HomeOutlined />}>
            <Menu.Item key="1" icon={<HomeOutlined />}>
              <Link to="/">Stocking</Link>
            </Menu.Item>
            <Menu.Item key="2" icon={<SwapOutlined />}>
              <Link to="/trasferimenti-magazzino">Trasferimento Magazzino</Link>
            </Menu.Item>
            <Menu.Item key="3" icon={<FileSearchOutlined />}>
              <Link to="/visualizza-magazzino">Articoli in Magazzino</Link>
            </Menu.Item>
          </Menu.SubMenu>
          <Menu.Item key="4" icon={<BoxPlotOutlined />}>
            <Link to="/prelievi">Prelievi</Link>
          </Menu.Item>
        </Menu>
        
      </Sider>

      {/* Floating button to expand menu on mobile */}
      <Button
        className="floating-button"
        onClick={showDrawer}
        style={{
          color: 'white',
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000, // Ensure the button is on top of other elements
        }}
        size="large"
        icon={<MenuOutlined />}
        type="primary"
      >
        Menu
      </Button>

      {/* Drawer component for mobile */}
      <Drawer
        title="Menu"
        placement="right"
        closable={true}
        onClose={closeDrawer}
        visible={drawerVisible}
        width={'50%'} // Adjust this value for the desired width
      >
        <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
        <Col span={8}>
            <Link to="/accettazione" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<CheckOutlined style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                Accettazione
              </Card>
            </Link>
          </Col>
          <Col span={8}>
            <Link to="/in-arrivo" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<DeliveredProcedureOutlined style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                In arrivo
              </Card>
            </Link>
          </Col>
          </Row>
        {/* First Row: Magazzino Section */}
        <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
          <Col span={8}>
            <Link to="/" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<HomeOutlined style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                Immagazzinamento
              </Card>
            </Link>
          </Col>
          <Col span={8}>
            <Link to="/trasferimenti-magazzino" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<SwapOutlined style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                Trasferimento
              </Card>
            </Link>
          </Col>
          <Col span={8}>
            <Link to="/visualizza-magazzino" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<FileSearchOutlined style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                Visualizza Magazzino
              </Card>
            </Link>
          </Col>
        </Row>

        {/* Second Row: Prelievi Section */}
        <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
          <Col span={8}>
            <Link to="/prelievi" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<BoxPlotOutlined style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                Prelievi
              </Card>
            </Link>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
        <Col span={8}>
            <Link to="/inventario" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<InsertRowAboveOutlined style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                Inventario
              </Card>
            </Link>
          </Col>
          <Col span={8}>
            <Link to="/logs" onClick={closeDrawer}>
              <Card
                hoverable
                style={{ textAlign: 'center', fontSize: '1.5rem' }}
                cover={<DatabaseFilled style={{ fontSize: '3rem', marginTop: '20px' }} />}
              >
                Log sistema
              </Card>
            </Link>
          </Col>
        </Row>
        
      </Drawer>
    </>
  );
};

export default CollapsibleMenu;
