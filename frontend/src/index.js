import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Layout } from 'antd';
import { ConfigProvider } from 'antd';

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CollapsibleMenu from './CollapsibleMenu'; // Import the collapsible menu

import reportWebVitals from './reportWebVitals';
import Stocking from './Stocking'
import ViewMagazzino from './ViewMagazzino'
import TrovaQuantita from './TrovaQuantita'
import VisualizzaMagazzino from './VisualizzaMagazzino'
import TrasferimentiMagazzino from './TrasferimentiMagazzino'
import Picking from './Picking'
import Accettazione from './Accettazione';
import IncomingItemsTable from './IncomingItemsTable';

const { Content } = Layout;

const theme = {
  token: {
    components: {
      Sider: {
        bodyBg: '#e62d3a', 
        footerBg: '#e62d3a', 
      },},
    bodyBg: '#e62d3a',
    colorPrimary: '#e62d3a', // Your desired primary color
  },
};
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
   <Router>
   <ConfigProvider  theme={{
        token:{
          colorPrimary: '#e62d3a',
          colorText:'#000'
        },
        components: {
          
          Layout: {
           
            siderBg: '#a0a0a0',
            triggerBg:'#a0a0a0',
            triggerColor:'#a0a0a0',
            algorithm: true, // Enable algorithm
          },
          Menu: {
            darkItemBg: '#a0a0a0',
            itemActiveBg:'e62d3a',  
            colorText: '#000',
            darkSubMenuItemBg: '#a0a0a0',
            algorithm: true, // Enable algorithm
          }
        },
      }}>

      <Layout style={{ minHeight: '100vh' }}>
        <CollapsibleMenu />
        <Layout>
          <Content style={{ padding: '24px', background: '#fff' }}>
            <Routes>
              <Route path="/" element={<Stocking />} />
              <Route path="/view-magazzino" element={<ViewMagazzino quantita={100000} />} />
              <Route path="/trova-quantita" element={<TrovaQuantita />} />
              <Route path="/visualizza-magazzino" element={<VisualizzaMagazzino />} />
              <Route path="/trasferimenti-magazzino" element={<TrasferimentiMagazzino />} />
              <Route path="/prelievi" element={<Picking />} />
              <Route path="/accettazione" element={<Accettazione />} />
              <Route path="/in-arrivo" element={<IncomingItemsTable />} />

            </Routes>
          </Content>
        </Layout>
      </Layout>
      </ConfigProvider>
    </Router>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
