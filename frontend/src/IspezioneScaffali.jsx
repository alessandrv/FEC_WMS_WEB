import React, { useState, useEffect, useMemo } from 'react';
import { Typography, Spin, Pagination, Modal, Table, Button, Card, Row, Col, Tooltip, Select, message, Radio, Input, Space, Divider, Form, Alert, Tag, Empty, Descriptions, Progress } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, SaveOutlined, HistoryOutlined, FormOutlined, ExclamationCircleOutlined, WarningOutlined, ClockCircleOutlined, InfoCircleOutlined, PlusCircleOutlined } from '@ant-design/icons';
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
  const [selectedInspectionStatus, setSelectedInspectionStatus] = useState('to_check');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({});
  const [form] = Form.useForm();
  const [savingForm, setSavingForm] = useState(false);
  const [questionResponses, setQuestionResponses] = useState([]);
  const [inspectionHistory, setInspectionHistory] = useState([]);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(0);
  const [inspectionCycles, setInspectionCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState('current');
  const [loadingCycles, setLoadingCycles] = useState(false);
  const [creatingCycle, setCreatingCycle] = useState(false);

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
    { id: 'q11', text: 'Altro (specificare)' }
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
    fetchInspectionCycles();
  }, []);

  // Fetch all available inspection cycles
  const fetchInspectionCycles = async () => {
    setLoadingCycles(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/inspection-cycles`);
      
      // Add a "current" option at the beginning
      const cycles = [{
        id: 'current',
        label: 'Ispezione Corrente (Ciclo Attivo)',
        date: new Date().toISOString().split('T')[0]
      }, ...response.data];
      
      setInspectionCycles(cycles);
    } catch (error) {
      console.error('Error fetching inspection cycles:', error);
      message.error('Errore durante il caricamento dei cicli di ispezione');
    } finally {
      setLoadingCycles(false);
    }
  };

  // Modify fetchInspectionData to accept a cycle parameter
  const fetchInspectionData = async (cycleId = 'current') => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelf-inspection`, {
        params: {
          cycle: cycleId
        }
      });
      
      // Convert array to object with scaffale as key for easier lookup
      const inspectionMap = {};
      response.data.forEach(item => {
        inspectionMap[item.scaffale] = item;
      });
      
      setInspectionData(inspectionMap);
    } catch (error) {
      console.error('Error fetching inspection data:', error);
      message.error('Errore durante il caricamento dei dati di ispezione');
    } finally {
      setLoading(false);
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

  const fetchInspectionHistory = async (shelfId = null) => {
    const columnId = shelfId || selectedColumn;
    if (!columnId) return;
    
    setLoadingHistory(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelf-inspection-history/${columnId}`);
      setInspectionHistory(response.data || []);
    } catch (error) {
      console.error('Error fetching inspection history:', error);
      setInspectionHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchShelfInspectionStatus = async (scaffale, colonna) => {
    // Create the combined scaffale-colonna identifier
    const shelfIdentifier = `${scaffale}-${colonna.toString().padStart(2, '0')}`;
    
    try {
      // Fetch the inspection status based on selected cycle
      const statusResponse = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/shelf-inspection/${shelfIdentifier}`,
        { params: { cycle: selectedCycle } }
      );
      
      // Set the status from the response
      setSelectedInspectionStatus(statusResponse.data.status);
      
      // Update inspection data with this shelf's status
      setInspectionData(prev => ({
        ...prev,
        [shelfIdentifier]: statusResponse.data
      }));
      
      // Only fetch question responses if we have an inspection record
      if (statusResponse.data.id) {
        try {
          const questionsResponse = await axios.get(
            `${process.env.REACT_APP_API_URL}/api/shelf-inspection-questions/${shelfIdentifier}`,
            { params: { cycle: selectedCycle } }
          );
          
          // Populate the form with the answers
          const formData = {};
          questionsResponse.data.forEach(item => {
            // Extract the question ID from the text
            const questionObj = inspectionQuestions.find(q => q.text === item.domanda);
            if (questionObj) {
              formData[questionObj.id] = item.risposta;
              formData[`${questionObj.id}_note`] = item.note || '';
            }
          });
          
          // Set form values
          form.setFieldsValue(formData);
          
        } catch (questionsError) {
          console.error('Error fetching question responses:', questionsError);
          resetForm();
        }
      } else {
        // No inspection record found, reset the form
        resetForm();
      }
      
      // Always fetch the inspection history
      fetchInspectionHistory(shelfIdentifier);
      
    } catch (error) {
      console.error('Error fetching shelf inspection status:', error);
      setSelectedInspectionStatus('to_check');
      resetForm();
    }
  };

  const resetForm = () => {
    // Create an empty form with all required fields
    const emptyForm = {};
    inspectionQuestions.forEach(question => {
      emptyForm[question.id] = null;
      emptyForm[`${question.id}_note`] = '';
    });
    
    // Set the form values to the empty form
    setInspectionForm(emptyForm);
    
    // Reset all form fields, including validation state
    form.resetFields();
    
    // Setting a timeout to ensure form is cleared after React state updates
    setTimeout(() => {
      form.setFieldsValue(emptyForm);
    }, 100);
    
    // Also reset question responses
    setQuestionResponses([]);
    
    console.log('Form completely reset for new inspection cycle');
  };

  // Update the updateShelfInspectionStatus function to use the saveInspectionForm function
  const updateShelfInspectionStatus = async (status) => {
    if (!selectedColumn) return;
    
    // Just update the status and then call saveInspectionForm
    setSelectedInspectionStatus(status);
    
    // Use a small timeout to make sure the state is updated before we save
    setTimeout(() => {
      saveInspectionForm();
    }, 100);
  };

  // Add a function to check if all questions are answered
  const allQuestionsAnswered = () => {
    const formValues = form.getFieldsValue();
    return inspectionQuestions.every(q => formValues[q.id]);
  };

  // Update saveInspectionForm to remove 6-month checks
  const saveInspectionForm = async () => {
    if (!selectedColumn) return;
    
    // Basic form validation
    try {
      await form.validateFields();
    } catch (error) {
      message.error('Per favore completa tutti i campi obbligatori');
      return;
    }
    
    setSavingForm(true);
    try {
      const formValues = form.getFieldsValue();
      
      // Prepare question responses
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
      
      // Use the combined endpoint to save both status and questions in one call
      console.log(`Saving inspection with ${questionResponsesToSave.length} questions`);
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/shelf-inspection-complete/${selectedColumn}`, {
        status: selectedInspectionStatus,
        questions: questionResponsesToSave,
        cycle: selectedCycle
      });
      
      // Get response details
      const questionsSaved = response.data.questions_saved || 0;
      
      // Show success message, with warnings if there are any
      if (response.data.warnings) {
        // There were some issues but overall the operation succeeded
        message.success(`Dati ispezione salvati con successo: stato "${selectedInspectionStatus}" e ${questionsSaved} risposte`, 3);
        
        // After a short delay, show the warning details
        setTimeout(() => {
          Modal.warning({
            title: 'Avvertenza',
            content: (
              <div>
                <p>Alcune risposte potrebbero essere state troncate o modificate per rispettare i limiti del database.</p>
                {response.data.error_details && (
                  <ul>
                    {response.data.error_details.map((error, index) => (
                      <li key={index}>{error.message || 'Errore sconosciuto'}</li>
                    ))}
                  </ul>
                )}
              </div>
            ),
            okText: 'Ho capito'
          });
        }, 1500);
      } else {
        message.success(`Dati ispezione salvati con successo: stato "${selectedInspectionStatus}" e ${questionsSaved} risposte`);
      }
      
      setInspectionForm(formValues);
      
      // Update the inspection data with the new status
      setInspectionData(prev => ({
        ...prev,
        [selectedColumn]: {
          ...prev[selectedColumn],
          status: selectedInspectionStatus,
          last_check: response.data.last_check || prev[selectedColumn]?.last_check
        }
      }));
      
      // Refresh data to ensure consistency
      const parts = selectedColumn.split('-');
      const scaffale = parts[0];
      const colonna = parseInt(parts[1], 10);
      await fetchShelfInspectionStatus(scaffale, colonna);
      
      // Also update the full inspection data to reflect changes across the grid
      await fetchInspectionData(selectedCycle);
      
      // Refresh history
      await fetchInspectionHistory(selectedColumn);
      
    } catch (error) {
      console.error('Error saving inspection:', error);
      
      // Enhanced error reporting with more details
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        
        if (errorData.error) {
          message.error(`Errore durante il salvataggio: ${errorData.error}`);
        } else if (errorData.error_details && errorData.error_details.length > 0) {
          Modal.error({
            title: 'Errore durante il salvataggio dell\'ispezione',
            content: (
              <div>
                <p>Si sono verificati i seguenti errori:</p>
                <ul>
                  {errorData.error_details.map((detail, index) => (
                    <li key={index}>{detail.message || 'Errore sconosciuto'}</li>
                  ))}
                </ul>
              </div>
            )
          });
        } else {
          message.error('Errore durante il salvataggio dell\'ispezione');
        }
      } else {
        message.error('Errore durante il salvataggio dell\'ispezione');
      }
    } finally {
      setSavingForm(false);
    }
  };

  // Format a date for display
  const formatInspectionDate = (dateString) => {
    if (!dateString) return 'Mai';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('it-IT', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
    } catch (e) {
      return dateString;
    }
  };

  // Get months since last inspection
  const getMonthsSinceLastInspection = (columnId = selectedColumn) => {
    if (!columnId || !inspectionData[columnId] || !inspectionData[columnId].last_check) {
      return null; // No inspection data
    }
    
    try {
      const lastCheck = new Date(inspectionData[columnId].last_check);
      const today = new Date();
      
      // Calculate difference in months
      return (today.getFullYear() - lastCheck.getFullYear()) * 12 + 
        (today.getMonth() - lastCheck.getMonth());
    } catch (error) {
      console.error('Error calculating months since last inspection:', error);
      return null;
    }
  };

  // Modified renderInspectionAlert to show info about last inspection
  const renderInspectionAlert = () => {
    if (!selectedColumn) return null;
    
    const monthsSince = getMonthsSinceLastInspection();
    
    return null;
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

  // If viewing a historical cycle, force viewing history mode in the modal
  useEffect(() => {
    if (selectedCycle !== 'current') {
      setViewingHistory(true);
    }
  }, [selectedCycle]);

  // Update the getColumnStatus function to use the correct check
  const getColumnStatus = (columnId) => {
    if (!columnId) return 'available';
    
    // Check inspection status if available
    if (inspectionData[columnId]) {
      const status = inspectionData[columnId].status;
      
      switch (status) {
        case 'buono': return 'good';
        case 'warning': return 'warning';
        case 'danger': return 'danger';
        case 'to_check': return 'to_check';
        default: break;
      }
    }
    
    // Default for unoccupied or no status
    return occupiedColumns.has(columnId) ? 'full' : 'available';
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

  const toggleHistoryView = () => {
    setViewingHistory(!viewingHistory);
    if (!viewingHistory && inspectionHistory.length === 0) {
      fetchInspectionHistory(selectedColumn);
    }
  };

  // Modify copyAnswerFromHistory function to add a warning
  const copyAnswerFromHistory = (questionId, answer, notes) => {
    // Update only the specific question
    form.setFieldsValue({
      [questionId]: answer,
      [`${questionId}_note`]: notes || ''
    });

    // Show a success message with warning
    message.warning(
      'Risposta copiata dalla cronologia. Verifica che sia ancora valida per questa nuova ispezione.',
      5 // Show for 5 seconds
    );
  };

  // Modify copyAllAnswersFromHistory function to add a stronger warning
  const copyAllAnswersFromHistory = () => {
    if (inspectionHistory.length === 0) {
      message.error('Nessuna ispezione precedente disponibile');
      return;
    }

    // Show confirmation dialog before copying
    Modal.confirm({
      title: 'Conferma copia risposte precedenti',
      content: (
        <div>
          <p><strong>Attenzione:</strong> Stai per copiare tutte le risposte dall'ispezione precedente.</p>
          <p>Ricorda che questa è una nuova ispezione semestrale e richiede una verifica completa di tutte le condizioni attuali.</p>
          <p>Devi confermare l'accuratezza di ogni risposta individualmente prima di salvare l'ispezione.</p>
        </div>
      ),
      onOk: () => {
        // Get the most recent inspection
        const mostRecentInspection = inspectionHistory[0];
        
        // Create a new form data object
        const newFormData = {};
        
        // Fill in the answers from the most recent inspection
        mostRecentInspection.questions.forEach(question => {
          const matchingQuestion = inspectionQuestions.find(q => q.text === question.domanda);
          if (matchingQuestion) {
            newFormData[matchingQuestion.id] = question.risposta;
            newFormData[`${matchingQuestion.id}_note`] = question.note || '';
          }
        });
        
        // Set the form values
        form.setFieldsValue(newFormData);
        
        // Show a warning message
        message.warning(
          'Risposte precedenti copiate. È necessario verificare individualmente ogni risposta prima di salvare questa nuova ispezione.',
          6 // Show for 6 seconds
        );
      },
      okText: 'Copia e Verifica',
      cancelText: 'Annulla'
    });
  };

  // Update renderHistoryView to use needsReinspection state
  const renderHistoryView = () => {
    if (loadingHistory) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
        </div>
      );
    }
    
    if (inspectionHistory.length === 0) {
      return (
        <Empty 
          description="Nessuna cronologia disponibile" 
          image={Empty.PRESENTED_IMAGE_SIMPLE} 
        />
      );
    }
    
    return (
      <div className="inspection-history-container" style={{ height: '100%', overflow: 'auto' }}>
        
        
        {inspectionHistory[selectedHistoryIndex] && (
          <div>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <HistoryOutlined style={{ marginRight: '8px', fontSize: '18px' }} />
                  Dettagli Ispezione Archiviata
                </div>
              }
              style={{ marginBottom: '16px' }}
              extra={
                <Button 
                  type="primary" 
                  onClick={toggleHistoryView}
                  icon={<FormOutlined />}
                >
                  Torna al Modulo di Ispezione
                </Button>
              }
            >
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Data Ispezione">
                  {formatInspectionDate(inspectionHistory[selectedHistoryIndex].date || inspectionHistory[selectedHistoryIndex].last_check)}
                </Descriptions.Item>
                <Descriptions.Item label="Stato">
                  <Tag color={
                    inspectionHistory[selectedHistoryIndex].status === 'buono' ? 'green' : 
                    inspectionHistory[selectedHistoryIndex].status === 'warning' ? 'orange' : 
                    inspectionHistory[selectedHistoryIndex].status === 'danger' ? 'red' : 
                    'default'
                  }>
                    {inspectionHistory[selectedHistoryIndex].status}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>
            
            <Divider orientation="left">Risposte alle Domande</Divider>
            
            {inspectionHistory[selectedHistoryIndex].questions && inspectionHistory[selectedHistoryIndex].questions.map((question, index) => {
              // Find the matching question in our current form
              const matchingQuestion = inspectionQuestions.find(q => q.text === question.domanda);
              
              return (
                <Card 
                  key={`history-${index}`}
                  className="question-card compact"
                  style={{ marginBottom: '8px' }}
                  styles={{ body: { padding: '8px' } }}
                
                >
                  <Row gutter={[16, 0]} align="middle">
                    <Col span={8}>
                      <Text strong>{question.domanda}</Text>
                    </Col>
                    <Col span={4}>
                      <Tag color={
                        question.risposta === 'SI' ? 'green' : 
                        question.risposta === 'NO' ? 'red' : 
                        'default'
                      }>
                        {question.risposta}
                      </Tag>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary">{question.note || '-'}</Text>
                    </Col>
                  </Row>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Add a function to count completed questions
  const countCompletedQuestions = () => {
    const formValues = form.getFieldsValue();
    return inspectionQuestions.filter(q => formValues[q.id]).length;
  };

  // Add renderInspectionCycleInfo function after the countCompletedQuestions function
  const renderInspectionCycleInfo = () => {
    if (!selectedColumn || !inspectionData[selectedColumn]) return null;
    
    const lastCheck = inspectionData[selectedColumn]?.last_check;
    
    return (
      <Card 
        style={{ marginBottom: '16px' }} 
        className="current-inspection-cycle"
        bordered={true}
        styles={{ 
          body: { 
            padding: '10px', 
            backgroundColor: '#e6f7ff',
            border: '1px solid #91d5ff'
          }
        }}
      >
        <Row gutter={[8, 0]} align="middle">
          <Col span={2}>
            <CheckCircleOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
          </Col>
          <Col span={22}>
            <Title level={5} style={{ margin: 0 }}>
              {selectedCycle === 'current' ? 'CICLO DI ISPEZIONE CORRENTE' : 'CICLO DI ISPEZIONE STORICO'}
            </Title>
            <Text>
              {selectedCycle === 'current' 
                ? `Ispezione in corso nel ciclo attuale. Ultima verifica: ${formatInspectionDate(lastCheck)}` 
                : `Visualizzazione storica. Data ispezione: ${formatInspectionDate(lastCheck)}`
              }
            </Text>
          </Col>
        </Row>
      </Card>
    );
  };

  // Add the missing renderShelfContentsTable function
  const renderShelfContentsTable = () => {
    if (!shelfDetails || shelfDetails.length === 0) {
      return (
        <div className="empty-state" style={{ marginBottom: '16px', textAlign: 'center', padding: '20px' }}>
          <Empty description="Non ci sono articoli in questa posizione" />
        </div>
      );
    }

    return (
      <div className="shelf-contents-table">
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span>Contenuto Scaffale</span>
            </div>
          }
          style={{ marginBottom: '16px' }}
        >
          <Table
            dataSource={shelfDetails}
            columns={columns}
            size="small"
            pagination={false}
            rowKey={(record) => `${record.occ_arti}-${record.location?.piano || 'unknown'}`}
          />
        </Card>
      </div>
    );
  };

  // Update the renderInspectionForm function to remove references to needsReinspection
  const renderInspectionForm = () => {
    return (
      <div className="inspection-form-container">

        <Card 
          title={
            <Space>
              <span>Stato Ispezione</span>
            </Space>
          } 
          style={{ marginBottom: '16px' }}
        >
          <Row gutter={[16, 16]} align="middle">
            <Col span={6}>
              <Text strong>Stato:</Text>
            </Col>
            <Col span={18}>
              <Select
                value={selectedInspectionStatus}
                style={{ width: '100%' }}
                onChange={(value) => setSelectedInspectionStatus(value)}
              >
                <Option value="buono">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '12px', height: '12px', backgroundColor: '#4caf50', marginRight: '8px', borderRadius: '50%' }}></div>
                    Buono
                  </div>
                </Option>
                <Option value="warning">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '12px', height: '12px', backgroundColor: '#ff9800', marginRight: '8px', borderRadius: '50%' }}></div>
                    Warning
                  </div>
                </Option>
                <Option value="danger">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '12px', height: '12px', backgroundColor: '#f44336', marginRight: '8px', borderRadius: '50%' }}></div>
                    Danger
                  </div>
                </Option>
                <Option value="to_check">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '12px', height: '12px', backgroundColor: '#e0e0e0', marginRight: '8px', borderRadius: '50%' }}></div>
                    Da Ispezionare
                  </div>
                </Option>
              </Select>
            </Col>
          </Row>
        </Card>

        <Form
          form={form}
          layout="vertical"
          style={{ marginBottom: '16px' }}
        >
          {inspectionQuestions.map((question) => (
            <Card 
              key={question.id}
              title={question.text}
              size="small"
              styles={{ 
                body: { padding: '12px' } 
              }}
              style={{ 
                marginBottom: '12px'
              }}
            >
              <Form.Item
                name={question.id}
                rules={[{ required: true, message: 'Per favore seleziona una risposta' }]}
              >
                <Radio.Group buttonStyle="solid">
                  <Radio.Button value="SI">SI</Radio.Button>
                  <Radio.Button value="NO">NO</Radio.Button>
                  <Radio.Button value="NA">N/A</Radio.Button>
                </Radio.Group>
              </Form.Item>
              
              <Form.Item name={`${question.id}_note`} label="Note:">
                <Input.TextArea 
                  placeholder="Aggiungi note opzionali" 
                  maxLength={255}
                  showCount
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
              </Form.Item>
            </Card>
          ))}
        </Form>
      </div>
    );
  };

  const createNewInspectionCycle = async () => {
    setCreatingCycle(true);
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/inspection-cycles`);
      message.success('Nuovo ciclo di ispezione creato con successo');
      
      // Refresh cycles data
      await fetchInspectionCycles();
      
      // Make sure we're on the current cycle
      setSelectedCycle('current');
      
      // Refresh inspection data to show the new cycle
      await fetchInspectionData('current');
      
      // Close inspection modal if open
      if (modalVisible) {
        setModalVisible(false);
      }
      
      // Reset form and selected column
      if (selectedColumn) {
        setSelectedColumn(null);
      }
      
    } catch (error) {
      console.error('Error creating new inspection cycle:', error);
      message.error('Errore durante la creazione del nuovo ciclo di ispezione');
    } finally {
      setCreatingCycle(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2}>Ispezione Scaffali</Title>
      <Text>Clicca su una colonna di scaffali per visualizzare i dettagli del suo contenuto.</Text>
      
      <Card style={{ marginTop: '20px', marginBottom: '20px' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col span={16}>
            <Space>
              <Text strong>Visualizza ciclo di ispezione:</Text>
              {selectedCycle !== 'current' && (
                <Tag color="purple">Visualizzazione storica</Tag>
              )}
            </Space>
          </Col>
          <Col span={8}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Select 
                loading={loadingCycles}
                value={selectedCycle}
                onChange={(value) => {
                  setSelectedCycle(value);
                  fetchInspectionData(value);
                }}
                placeholder="Seleziona ciclo di ispezione"
              >
                {inspectionCycles.map(cycle => (
                  <Option key={cycle.id} value={cycle.id}>
                    {cycle.label}
                  </Option>
                ))}
              </Select>
              
              <Button 
                type="primary"
                onClick={() => createNewInspectionCycle()}
                icon={<PlusCircleOutlined />}
                loading={creatingCycle}
              >
                Nuovo Ciclo
              </Button>
            </Space>
          </Col>
        </Row>
        
        {selectedCycle !== 'current' && (
          <Row style={{ marginTop: '10px' }}>
            <Col span={24}>
              <div style={{ padding: '8px', backgroundColor: '#f6f6f6', borderRadius: '4px' }}>
                <Text type="secondary">
                  <InfoCircleOutlined style={{ marginRight: '8px' }} />
                  Stai visualizzando dati storici. In questa modalità non è possibile modificare le ispezioni.
                  Seleziona "Ispezione Corrente" per tornare alla visualizzazione attuale.
                </Text>
              </div>
            </Col>
          </Row>
        )}
      </Card>
      
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
        title={`Ispezione Scaffale: ${selectedColumn || ''}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width="100%"
        style={{ top: 0, paddingBottom: 0 }}
        bodyStyle={{ 
          height: 'calc(100vh - 108px)', 
          padding: '20px',
          overflow: 'auto'
        }}
        footer={[
          <Button key="back" onClick={() => setModalVisible(false)}>
            Chiudi
          </Button>,
          selectedCycle === 'current' && (
            <Button 
              key="history" 
              onClick={toggleHistoryView}
              icon={viewingHistory ? <FormOutlined /> : <HistoryOutlined />}
            >
              {viewingHistory ? 'Torna al Modulo' : 'Visualizza Cronologia'}
            </Button>
          ),
          selectedCycle === 'current' && !viewingHistory && (
            <Button 
              key="submit" 
              type="primary" 
              loading={savingForm} 
              onClick={saveInspectionForm}
              icon={<SaveOutlined />}
            >
              Salva Ispezione
            </Button>
          ),
        ].filter(Boolean)}
      >
        {modalLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
            <Spin size="large" />
          </div>
        ) : (
          <div>
            {viewingHistory ? renderHistoryView() : renderInspectionForm()}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default IspezioneScaffali; 