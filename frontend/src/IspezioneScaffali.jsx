import React, { useState, useEffect, useMemo } from 'react';
import { Typography, Spin, Pagination, Modal, Table, Button, Card, Row, Col, Tooltip, Select, message, Radio, Input, Space, Divider, Form } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';
import WarehouseGridSystem from './WarehouseGridSystem';
import { WarehouseLayouts } from './layouts';
import './ViewMagazzino.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Function to create a modified layout with spanRow properties for column-based view
const createColumnBasedLayout = (originalLayout) => {
  if (!originalLayout || !Array.isArray(originalLayout)) {
    return [];
  }

  return originalLayout.map(section => {
    const modifiedSection = { ...section };
    
    // If the section has a height, add spanRow equal to that height
    if (modifiedSection.height) {
      modifiedSection.spanRow = modifiedSection.height;
    }
    
    // For shelf sections, we want to group them by column
    if (modifiedSection.shelfPattern === 'regular' || modifiedSection.shelfPattern === 'horizontal') {
      // Set rowspan to make each shelf span vertically by its height
      modifiedSection.spanRow = modifiedSection.height;
      
      // Add a property to indicate this is a column-based view
      modifiedSection.columnBasedView = true;
    }
    
    return modifiedSection;
  });
};

const IspezioneScaffali = () => {
  const [loading, setLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [shelfDetails, setShelfDetails] = useState(null);
  const [occupiedColumns, setOccupiedColumns] = useState(new Set());
  const [totalSpace, setTotalSpace] = useState({});
  const [usedSpace, setUsedSpace] = useState({});
  const [shelvesData, setShelvesData] = useState([]);
  const [inspectionData, setInspectionData] = useState({});
  const [selectedInspectionStatus, setSelectedInspectionStatus] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({});
  const [form] = Form.useForm();
  const [savingForm, setSavingForm] = useState(false);
  const [questionResponses, setQuestionResponses] = useState([]);

  // Inspection questions
  const inspectionQuestions = [
    { id: 'q1', text: 'La scaffalatura è stata installata secondo le indicazioni del costruttore?' },
    { id: 'q2', text: 'Esiste il lay-out delle scaffalature completo dei prospetti di ciascuna sezione? Il lay-out corrisponde alla situazione attuale?' },
    { id: 'q3', text: 'I cartelli indicanti il carico ammesso per ogni sezione sono presenti, corretti e ben visibili?' },
    { id: 'q4', text: 'Il personale addetto alle operazioni di movimentazione delle merci è informato e formato circa il corretto uso delle scaffalature ed il significato dei dati espressi nelle tabelle di portata?' },
    { id: 'q5', text: 'Vengono utilizzati i corretti accessori per lo stoccaggio, come previsto dal costruttore?' },
    { id: 'q6', text: 'Le macchine utilizzate per la movimentazione dei carichi sono quelle previste dal costruttore?' },
    { id: 'q7', text: 'La pavimentazione è orizzontale e priva di danni o deformazioni in prossimità dei punti di ancoraggio?' },
    { id: 'q8', text: 'L\'area di lavoro è idonea e mantenuta pulita ed ordinata?' },
    { id: 'q9', text: 'Vengono rispettati i limiti degli ingombri a terra e in quota?' },
    { id: 'q10', text: 'L\'area è sufficientemente illuminata? (assenza di zone d\'ombra)' },
    { id: 'q11', text: 'Altro (specificare)…' }
  ];

  // Create modified layouts for column-based view
  const columnBasedLayouts = useMemo(() => {
    const modifiedLayouts = {};
    Object.keys(WarehouseLayouts).forEach(key => {
      modifiedLayouts[key] = createColumnBasedLayout(WarehouseLayouts[key]);
    });
    return modifiedLayouts;
  }, []);

  // Fetch shelves data when component mounts
  useEffect(() => {
    fetchInspectionData();
  }, []);

  const fetchInspectionData = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelf-inspection`);
      
      // Convert array to object with scaffale as key for easier lookup
      // Note: scaffale field already contains the combined scaffale-colonna value
      const inspectionMap = {};
      response.data.forEach(item => {
        inspectionMap[item.scaffale] = item;
      });
      
      setInspectionData(inspectionMap);
    } catch (error) {
      console.error('Error fetching inspection data:', error);
    }
  };

  const fetchColumnDetails = async (scaffale, colonna) => {
    setModalLoading(true);
    try {
      // Get details for all shelves in this column
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/location-items`, {
        params: {
          area: 'A', // Default area
          scaffale: scaffale,
          colonna: colonna
        }
      });
      
      setShelfDetails(response.data);
      
      // Get the inspection status for this shelf
      fetchShelfInspectionStatus(scaffale, colonna);
    } catch (error) {
      console.error('Error fetching column details:', error);
      setShelfDetails([]);
    } finally {
      setModalLoading(false);
    }
  };

  const fetchShelfInspectionStatus = async (scaffale, colonna) => {
    // Create the combined scaffale-colonna identifier
    const shelfIdentifier = `${scaffale}-${colonna.toString().padStart(2, '0')}`;
    
    try {
      // Fetch the overall inspection status
      const statusResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelf-inspection/${shelfIdentifier}`);
      
      // Update the inspection data with this shelf's status
      setInspectionData(prev => ({
        ...prev,
        [shelfIdentifier]: statusResponse.data
      }));
      
      // Set the selected status for the dropdown
      setSelectedInspectionStatus(statusResponse.data.status);
      
      // Now fetch the question responses for this shelf
      try {
        const questionsResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelf-inspection-questions/${shelfIdentifier}`);
        setQuestionResponses(questionsResponse.data);
        
        // Convert the response array to a format that matches our form structure
        const formData = {};
        questionsResponse.data.forEach(item => {
          // Extract the question ID from the text (assumes consistent question ordering)
          const questionObj = inspectionQuestions.find(q => q.text === item.domanda);
          if (questionObj) {
            formData[questionObj.id] = item.risposta;
            formData[`${questionObj.id}_note`] = item.note || '';
          }
        });
        
        // If we have responses, set them in the form
        if (Object.keys(formData).length > 0) {
          setInspectionForm(formData);
          form.setFieldsValue(formData);
        } else {
          resetInspectionForm();
        }
      } catch (questionsError) {
        console.error('Error fetching question responses:', questionsError);
        resetInspectionForm();
      }
    } catch (error) {
      console.error('Error fetching shelf inspection status:', error);
      setSelectedInspectionStatus('to_check');
      resetInspectionForm();
    }
  };

  const resetInspectionForm = () => {
    const emptyForm = {};
    inspectionQuestions.forEach(q => {
      emptyForm[q.id] = undefined;
      emptyForm[`${q.id}_note`] = '';
    });
    setInspectionForm(emptyForm);
    form.resetFields();
  };

  const updateShelfInspectionStatus = async (status) => {
    if (!selectedColumn) return;
    
    // Use the entire selectedColumn which contains scaffale-colonna
    const shelfIdentifier = selectedColumn;
    
    setUpdatingStatus(true);
    try {
      // Update only the status (not the questions)
      await axios.post(`${process.env.REACT_APP_API_URL}/api/shelf-inspection/${shelfIdentifier}`, {
        status
      });
      
      // Update the inspection data with the new status
      setInspectionData(prev => ({
        ...prev,
        [shelfIdentifier]: {
          ...prev[shelfIdentifier],
          status
        }
      }));
      setSelectedInspectionStatus(status);
      
      message.success(`Stato di ispezione aggiornato a "${status}"`);
    } catch (error) {
      console.error('Error updating inspection status:', error);
      message.error('Errore durante l\'aggiornamento dello stato');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const saveInspectionForm = async () => {
    if (!selectedColumn) return;
    
    setSavingForm(true);
    try {
      const formValues = form.getFieldsValue();
      
      // First, update the inspection status
      await axios.post(`${process.env.REACT_APP_API_URL}/api/shelf-inspection/${selectedColumn}`, {
        status: selectedInspectionStatus
      });
      
      // Then, prepare and save the question responses
      const questionResponsesToSave = [];
      
      inspectionQuestions.forEach(question => {
        // Only include questions that have a response
        if (formValues[question.id]) {
          questionResponsesToSave.push({
            domanda: question.text,
            risposta: formValues[question.id],
            note: formValues[`${question.id}_note`] || ''
          });
        }
      });
      
      // Save the question responses to the new endpoint
      await axios.post(`${process.env.REACT_APP_API_URL}/api/shelf-inspection-questions/${selectedColumn}`, questionResponsesToSave);
      
      message.success('Dati ispezione salvati con successo');
      setInspectionForm(formValues);
      
      // Refresh data to ensure consistency
      const parts = selectedColumn.split('-');
      const scaffale = parts[0];
      const colonna = parseInt(parts[1], 10);
      await fetchShelfInspectionStatus(scaffale, colonna);
      
      // Also update the full inspection data to reflect changes across the grid
      await fetchInspectionData();
      
    } catch (error) {
      console.error('Error saving inspection form:', error);
      message.error('Errore durante il salvataggio dei dati');
    } finally {
      setSavingForm(false);
    }
  };

  const handleCellClick = (shelfId) => {
    // For column-based view, extract column from shelf ID
    const parts = shelfId.split('-');
    if (parts.length >= 2) {
      const columnId = `${parts[0]}-${parts[1]}`;
      handleColumnClick(columnId);
    }
  };

  const handleColumnClick = (columnId) => {
    // Parse column ID (format: "A-01")
    const parts = columnId.split('-');
    if (parts.length >= 2) {
      const scaffale = parts[0];
      const colonna = parseInt(parts[1], 10);
      
      setSelectedColumn(columnId);
      setModalVisible(true);
      fetchColumnDetails(scaffale, colonna);
    }
  };

  // Get status for a column
  const getColumnStatus = (columnId) => {
    // Check inspection status if available
    if (columnId) {
      // Use the entire columnId as the key for inspection data
      const inspection = inspectionData[columnId];
      
      if (inspection) {
        switch (inspection.status) {
          case 'buono':
            return 'good';
          case 'warning':
            return 'warning';
          case 'danger':
            return 'danger';
          case 'to_check':
            return 'to_check';
          default:
            break;
        }
      }
    }
    
    // Fall back to occupancy-based status
    if (occupiedColumns.has(columnId)) return 'full';
    return 'available';
  };

  // Function to get status for a shelf ID in column-based view
  const getShelfStatus = (shelfId) => {
    // Extract column part from shelf ID
    const parts = shelfId.split('-');
    if (parts.length >= 2) {
      const columnId = `${parts[0]}-${parts[1]}`;
      return getColumnStatus(columnId);
    }
    return 'available';
  };

  // Get tooltip content for a column
  const getColumnTooltip = (shelfId) => {
    // Extract column part from shelf ID
    const parts = shelfId.split('-');
    if (parts.length >= 2) {
      const columnId = `${parts[0]}-${parts[1]}`;
      
      // Get inspection status using columnId
      const inspection = inspectionData[columnId];
      let inspectionInfo = '';
      
      if (inspection) {
        inspectionInfo = `\nStato ispezione: ${inspection.status}\nUltima ispezione: ${inspection.last_check || 'Mai'}`;
      }
      
      // Get space usage info
      const total = totalSpace[columnId] || 0;
      const used = usedSpace[columnId] || 0;
      const percentUsed = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
      
      return `Colonna: ${columnId}\nSpazio utilizzato: ${percentUsed}%${inspectionInfo}`;
    }
    return '';
  };

  const renderWarehouseSection = () => {
    if (currentPage === 1) {
      return (
        <div className="warehouse-grid-container">
          <WarehouseGridSystem
            warehouseLayout={columnBasedLayouts[1]}
            GRID_ROWS={30}
            GRID_COLS={9}
            onCellClick={handleCellClick}
            getShelfStatus={getShelfStatus}
            tooltipContent={getColumnTooltip}
            showFloorNumber={false}
          />
        </div>
      );
    } else if (currentPage === 2) {
      return (
        <div className="warehouse-grid-container">
          <WarehouseGridSystem
            warehouseLayout={columnBasedLayouts[2]}
            GRID_ROWS={16}
            GRID_COLS={22}
            onCellClick={handleCellClick}
            getShelfStatus={getShelfStatus}
            tooltipContent={getColumnTooltip}
            showFloorNumber={false}
          />
        </div>
      );
    }
    return null;
  };

  const columns = [
    {
      title: 'Articolo',
      dataIndex: 'occ_arti',
      key: 'occ_arti',
    },
    {
      title: 'Descrizione',
      dataIndex: 'occ_desc_combined',
      key: 'occ_desc_combined',
      render: (text) => <span style={{ maxWidth: '300px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>,
    },
    {
      title: 'Quantità',
      dataIndex: 'available_quantity',
      key: 'available_quantity',
      render: (text) => parseInt(text, 10),
    },
    {
      title: 'Pacchi',
      key: 'pacchi',
      render: (_, record) => record.pacchi ? record.pacchi.length : 0,
    },
    {
      title: 'Piano',
      dataIndex: ['location', 'piano'],
      key: 'piano',
    }
  ];

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2}>Ispezione Scaffali</Title>
      <Text>Clicca su una colonna di scaffali per visualizzare i dettagli del suo contenuto.</Text>
      
      <Card style={{ marginTop: '20px' }}>
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <div className="view-magazzino">
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                </div>
              ) : (
                <div className="view-magazzino">
                  <div className="grid-container">
                    {renderWarehouseSection()}
                  </div>
                  <div className="color-legend" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '20px', height: '20px', backgroundColor: '#4caf50', marginRight: '5px' }}></div>
                      <span>Buono</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '20px', height: '20px', backgroundColor: '#ff9800', marginRight: '5px' }}></div>
                      <span>Warning</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '20px', height: '20px', backgroundColor: '#f44336', marginRight: '5px' }}></div>
                      <span>Danger</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '20px', height: '20px', backgroundColor: '#ffffff', border: '1px solid #ccc', marginRight: '5px' }}></div>
                      <span>Da Ispezionare</span>
                    </div>
                   
                  </div>
                  <div className="pagination-container">
                    <Pagination
                      current={currentPage}
                      total={2}
                      pageSize={1}
                      onChange={(page) => setCurrentPage(page)}
                      showSizeChanger={false}
                      simple
                    />
                  </div>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      <Modal
        title={`Dettagli Colonna: ${selectedColumn || ''}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Row justify="end">
          <Button style={{marginRight: "10px", zIndex: 1000}} key="close" onClick={() => setModalVisible(false)}>
            Chiudi
          </Button>
           <Button 
           type="primary" 
           icon={<SaveOutlined />} 
           onClick={saveInspectionForm}
           loading={savingForm}
         >
           Salva Scheda
         </Button></Row>
        ]}
        width="100vw"
        style={{
          top: 0,
          paddingBottom: 0,
          maxWidth: '100vw'
        }}
        bodyStyle={{
          overflow: 'hidden',
          height: 'calc(100vh - 150px)',
          padding: '12px 24px',
          width: '100%'
        }}
        className="fullscreen-modal"
      >
        {selectedColumn && (
          <div style={{ marginBottom: '12px', position: 'relative', zIndex: 10, width: '100%' }}>
            <Row gutter={[8, 8]} align="middle" style={{ width: '100%' }}>
              <Col span={8}>
                <Text strong>Stato Ispezione:</Text>
              </Col>
              <Col span={12}>
                <Select
                  value={selectedInspectionStatus}
                  onChange={(value) => updateShelfInspectionStatus(value)}
                  style={{ width: '100%' }}
                  loading={updatingStatus}
                >
                  <Option value="buono">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '12px', height: '12px', backgroundColor: '#4caf50', marginRight: '8px' }}></div>
                      Buono
                    </div>
                  </Option>
                  <Option value="warning">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '12px', height: '12px', backgroundColor: '#ff9800', marginRight: '8px' }}></div>
                      Warning
                    </div>
                  </Option>
                  <Option value="danger">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '12px', height: '12px', backgroundColor: '#f44336', marginRight: '8px' }}></div>
                      Danger
                    </div>
                  </Option>
                  <Option value="to_check">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '12px', height: '12px', backgroundColor: '#ffffff', border: '1px solid #ccc', marginRight: '8px' }}></div>
                      Da Ispezionare
                    </div>
                  </Option>
                </Select>
              </Col>
              <Col span={4}>
                <Button 
                  type="primary" 
                  icon={<CheckCircleOutlined />} 
                  loading={updatingStatus}
                  onClick={() => updateShelfInspectionStatus(selectedInspectionStatus)}
                >
                  Salva
                </Button>
              </Col>
            </Row>
            {selectedColumn && inspectionData[selectedColumn]?.last_check && (
              <Text type="secondary" style={{ display: 'block', marginTop: '4px',  }}>
                Ultima ispezione: {inspectionData[selectedColumn]?.last_check}
              </Text>
            )}
          </div>
        )}
        
        {modalLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
          </div>
        ) : (
          <div className="inspection-form-container" style={{ position: 'relative', zIndex: 5, height: 'calc(100vh - 220px)', overflow: 'hidden', width: '100%' }}>
            <Form
              form={form}
              layout="vertical"
              initialValues={inspectionForm}
              style={{ width: '100%' }}
            >
              <div className="question-container" style={{ height: '100%', overflow: 'hidden', width: '100%' }}>
                {inspectionQuestions.map((question, index) => (
                  <Card 
                    key={question.id} 
                    className="question-card compact" 
                    style={{ 
                      position: 'relative', 
                      zIndex: 1,
                      pointerEvents: 'auto',
                      height: '60px',
                      marginBottom: '4px',
                      width: '100%'
                    }}
                    bodyStyle={{ padding: '8px', width: '100%' }}
                  >
                    <Row gutter={[16,0]} align="middle" style={{ height: '100%', width: '100%' }}>
                      <Col span={8} style={{ 
                        position: 'relative', 
                        zIndex: 2,
                        pointerEvents: 'auto',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        <Text strong style={{  }}>{question.text}</Text>
                      </Col>
                      
                      <Col span={4} style={{ position: 'relative', zIndex: 2, pointerEvents: 'auto' }}>
                        <Form.Item 
                          name={question.id}
                          style={{ marginBottom: 0, position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
                        >
                          <Radio.Group 
                            buttonStyle="solid" 
                            size="small" 
                            style={{ width: '100%', display: 'flex', position: 'relative', zIndex: 10, pointerEvents: 'auto' }}
                          >
                            <Radio.Button 
                              value="SI" 
                              style={{ flex: 1, textAlign: 'center', height: '24px', lineHeight: '22px',  position: 'relative', zIndex: 10, pointerEvents: 'auto' }}
                            >SI</Radio.Button>
                            <Radio.Button 
                              value="NO" 
                              style={{ flex: 1, textAlign: 'center', height: '24px', lineHeight: '22px',  position: 'relative', zIndex: 10, pointerEvents: 'auto' }}
                            >NO</Radio.Button>
                            <Radio.Button 
                              value="NA" 
                              style={{ flex: 1, textAlign: 'center', height: '24px', lineHeight: '22px',  position: 'relative', zIndex: 10, pointerEvents: 'auto' }}
                            >N/A</Radio.Button>
                          </Radio.Group>
                        </Form.Item>
                      </Col>
                      <Col span={12} style={{ position: 'relative', zIndex: 2, pointerEvents: 'auto' }}>
                        <Form.Item 
                          name={`${question.id}_note`} 
                          style={{ marginBottom: 0, position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
                        >
                          <Input 
                            placeholder="Note"
                            size="small"
                            style={{ position: 'relative', zIndex: 10, pointerEvents: 'auto', height: '24px',  width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </div>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default IspezioneScaffali; 