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

// Function to create a rotated layout with spanCol properties for horizontal column-based view
const createRotatedColumnBasedLayout = (originalLayout) => {
  if (!originalLayout || !Array.isArray(originalLayout)) {
    return [];
  }

  return originalLayout.map(section => {
    const modifiedSection = { ...section };
    
    // If the section has a width, add spanCol equal to that width
    if (modifiedSection.width) {
      modifiedSection.spanCol = modifiedSection.width;
    }
    
    // For shelf sections, we want to group them by row instead of column (rotated 90 degrees)
    if (modifiedSection.shelfPattern === 'regular' || modifiedSection.shelfPattern === 'horizontal') {
      // Set colspan to make each shelf span horizontally by its width
      modifiedSection.spanCol = modifiedSection.width;
      
      // Add a property to indicate this is a rotated column-based view
      modifiedSection.rotatedColumnBasedView = true;
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
  const [showStatoModal, setShowStatoModal] = useState(false);
  const [pendingSaveStatus, setPendingSaveStatus] = useState(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [inspectionQuestions, setInspectionQuestions] = useState([]);

  // Load inspection questions from backend on component mount
  useEffect(() => {
    loadDefaultQuestions();
  }, []);

  // Create modified layouts for column-based view
  const columnBasedLayouts = useMemo(() => {
    const modifiedLayouts = {};
    Object.keys(WarehouseLayouts).forEach(key => {
      modifiedLayouts[key] = createColumnBasedLayout(WarehouseLayouts[key]);
    });
    return modifiedLayouts;
  }, []);
  
  // Create rotated layouts for horizontal column-based view
  const rotatedColumnBasedLayouts = useMemo(() => {
    const modifiedLayouts = {};
    Object.keys(WarehouseLayouts).forEach(key => {
      modifiedLayouts[key] = createRotatedColumnBasedLayout(WarehouseLayouts[key]);
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
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/v2/inspection-cycles`);
      
      if (response.data.success) {
        // Separate active and inactive cycles
        const activeCycle = response.data.cycles.find(cycle => cycle.is_active);
        const inactiveCycles = response.data.cycles.filter(cycle => !cycle.is_active);
        
        // If no active cycle exists, activate the most recent cycle
        if (!activeCycle && inactiveCycles.length > 0) {
          console.log('No active cycle found, activating the most recent cycle...');
          
          // Sort by start_date descending to get the most recent
          const sortedCycles = inactiveCycles.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
          const mostRecentCycle = sortedCycles[0];
          
          try {
            // Activate the most recent cycle
            await axios.put(`${process.env.REACT_APP_API_URL}/api/v2/inspection-cycles/${mostRecentCycle.id}/activate`);
            
            message.info(`Ciclo "${mostRecentCycle.cycle_name}" attivato automaticamente`);
            
            // Refetch cycles to get updated data
            setTimeout(() => {
              fetchInspectionCycles();
            }, 500);
            return;
            
          } catch (activationError) {
            console.error('Error activating cycle:', activationError);
            message.warning('Impossibile attivare automaticamente l\'ultimo ciclo');
          }
        }
        
        // Build cycles array - only add "current" if there's an active cycle
        const cycles = [];
        
        if (activeCycle) {
          cycles.push({
            id: 'current',
            label: `${activeCycle.cycle_name} (Ciclo Attivo)`,
            date: activeCycle.start_date,
            is_active: true,
            actual_id: activeCycle.id
          });
        }
        
        // Add historical cycles
        inactiveCycles.forEach(cycle => {
          cycles.push({
            id: cycle.id,
            label: `${cycle.cycle_name} (${new Date(cycle.start_date).toLocaleDateString('it-IT')})`,
            date: cycle.start_date,
            is_active: cycle.is_active
          });
        });
        
        setInspectionCycles(cycles);
      } else {
        throw new Error(response.data.error || 'Errore nel caricamento dei cicli');
      }
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
      const params = cycleId !== 'current' ? { cycle_id: cycleId } : {};
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/v2/shelf-inspections`, {
        params
      });
      
      if (response.data.success) {
        // Convert array to object with scaffale as key for easier lookup
        const inspectionMap = {};
        response.data.inspections.forEach(inspection => {
          inspectionMap[inspection.scaffale] = inspection;
        });
        
        setInspectionData(inspectionMap);
      } else {
        throw new Error(response.data.error || 'Errore nel caricamento delle ispezioni');
      }
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
      // Use v2 API to get inspection history
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/v2/shelf-inspections/${columnId}/history`);
      if (response.data.success) {
        setInspectionHistory(response.data.inspections || []);
      } else {
        setInspectionHistory([]);
      }
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
      const params = selectedCycle !== 'current' ? { cycle_id: selectedCycle } : {};
      const statusResponse = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/v2/shelf-inspections/${shelfIdentifier}`,
        { params }
      );
      
      if (statusResponse.data.success) {
        const inspection = statusResponse.data.inspection;
        
        // Set the status from the response
        setSelectedInspectionStatus(inspection.status);
        
        // Update inspection data with this shelf's status
        setInspectionData(prev => ({
          ...prev,
          [shelfIdentifier]: inspection
        }));
        
        // Populate the form with the questions and answers
        if (inspection.questions && inspection.questions.length > 0) {
          const formData = {};
          inspection.questions.forEach(item => {
            formData[item.question_id] = item.answer;
            formData[`${item.question_id}_note`] = item.notes || '';
          });
          
          form.setFieldsValue(formData);
        } else {
          // Load default questions if no responses exist
          await loadDefaultQuestions();
        }
      } else {
        // No existing inspection, load default questions
        setSelectedInspectionStatus('to_check');
        await loadDefaultQuestions();
      }
      
      // Always fetch the inspection history
      fetchInspectionHistory(shelfIdentifier);
      
    } catch (error) {
      console.error('Error fetching shelf inspection status:', error);
      setSelectedInspectionStatus('to_check');
      resetForm();
    }
  };

  const loadDefaultQuestions = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/v2/inspection-questions`);
      if (response.data.success) {
        const questions = response.data.questions;
        
        // Convert questions to the format expected by the frontend
        const formattedQuestions = questions.map(question => ({
          id: `q${question.id}`,
          question_id: question.id,
          text: question.question_text,
          question: question.question_text,
          domanda: question.question_text
        }));
        
        // Set the questions state
        setInspectionQuestions(formattedQuestions);
        
        // Create empty form data for all questions
        const emptyForm = {};
        formattedQuestions.forEach(question => {
          emptyForm[question.id] = '';
          emptyForm[`${question.id}_note`] = '';
        });
        
        form.setFieldsValue(emptyForm);
        setQuestionResponses(questions);
      }
    } catch (error) {
      console.error('Error loading default questions:', error);
      // Fallback to empty array if backend fails
      setInspectionQuestions([]);
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
  const saveInspectionForm = async (status) => {
    if (!selectedColumns.length) return;
    setPendingSave(true);
    try {
      const formValues = form.getFieldsValue();
      const questionResponsesToSave = inspectionQuestions.map(question => ({
        question_id: question.question_id, // Use the numeric ID, not the string ID
        question: question.text,
        domanda: question.text, // Backward compatibility
        answer: formValues[question.id], // Use string ID for form field lookup
        risposta: formValues[question.id], // Backward compatibility
        notes: formValues[`${question.id}_note`] || '',
        note: formValues[`${question.id}_note`] || '' // Backward compatibility
      }));

      // Get the current cycle ID if needed
      let cycleId = selectedCycle !== 'current' ? selectedCycle : null;
      if (!cycleId) {
        // Find the current active cycle from the inspectionCycles
        const currentCycle = inspectionCycles.find(cycle => cycle.id === 'current');
        if (currentCycle && currentCycle.actual_id) {
          cycleId = currentCycle.actual_id;
        } else {
          // If no active cycle found, we need to get it from the backend
          const cyclesResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/v2/inspection-cycles`);
          if (cyclesResponse.data.success) {
            const activeCycle = cyclesResponse.data.cycles.find(cycle => cycle.is_active);
            if (activeCycle) {
              cycleId = activeCycle.id;
            }
          }
        }
      }

      if (!cycleId) {
        message.error('Impossibile determinare il ciclo di ispezione corrente');
        return;
      }

      await Promise.all(selectedColumns.map(async (columnId) => {
        await axios.post(`${process.env.REACT_APP_API_URL}/api/v2/shelf-inspections/${columnId}`, {
          status,
          questions: questionResponsesToSave,
          cycle_id: cycleId,
          inspector_name: 'Sistema', // You can add user context here
          notes: ''
        });
      }));
      
      message.success(`Dati ispezione salvati per ${selectedColumns.length} colonne`);
      await fetchInspectionData(selectedCycle);
      setShowStatoModal(false);
      setModalVisible(false);
      setSelectedColumns([]);
      setSelectedColumn(null);
    } catch (error) {
      console.error('Error saving inspection:', error);
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
      setPendingSave(false);
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
    const parts = shelfId.split('-');
    if (parts.length >= 2) {
      const columnId = `${parts[0]}-${parts[1]}`;
      
      if (multiSelectMode) {
        // In multi-select mode, allow selecting uninspected shelves only
        if (selectedCycle === 'current' && isShelfInspectedInCurrentCycle(columnId)) {
          message.warning('Non è possibile selezionare scaffali già ispezionati per una nuova ispezione');
          return;
        }
        
        setSelectedColumns(prev =>
          prev.includes(columnId)
            ? prev.filter(id => id !== columnId)
            : [...prev, columnId]
        );
      } else {
        // Single select mode - smart logic
        setSelectedColumn(columnId);
        setSelectedColumns([columnId]);
        
        // Check if viewing historical cycle - always show history
        if (selectedCycle !== 'current') {
          setViewingHistory(true);
          setModalVisible(true);
          fetchColumnDetails(parts[0], parseInt(parts[1], 10));
          fetchInspectionHistory(columnId);
          return;
        }
        
        // Current cycle logic
        if (isShelfInspectedInCurrentCycle(columnId)) {
          // Already inspected - show history
          setViewingHistory(true);
          fetchInspectionHistory(columnId);
        } else {
          // Not inspected - show inspection form
          setViewingHistory(false);
          fetchColumnDetails(parts[0], parseInt(parts[1], 10));
        }
        
        setModalVisible(true);
      }
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

  // Check if a shelf has been inspected in the current active cycle
  const isShelfInspectedInCurrentCycle = (columnId) => {
    // Only check if we're viewing the current cycle
    if (selectedCycle !== 'current') return false;
    
    const inspection = inspectionData[columnId];
    return inspection && inspection.status && inspection.status !== 'to_check';
  };

  // Function to get all possible column IDs across all pages (only actual shelves, not labels or spanned positions)
  const getAllPossibleColumns = () => {
    const allColumns = new Set();
    
    // Get all actual shelf sections from layouts (exclude customText labels)
    const allLayouts = [
      WarehouseLayouts[1] || [],
      WarehouseLayouts[2] || [],
      WarehouseLayouts[3] || []
    ];
    
    allLayouts.forEach(layout => {
      layout.forEach(section => {
        // Only count sections that have shelfPattern (actual shelves, not labels)
        if (section.shelfPattern === 'regular') {
          const startingValue = section.startingValue || 1;
          
          // Check if this section spans multiple columns
          const hasColumnSpan = section.spanCol && section.spanCol > 1;
          const hasRowSpan = section.spanRow && section.spanRow > 1;
          
          if (hasColumnSpan || hasRowSpan) {
            // For spanned sections, only count the first position
            // The shelf physically spans multiple grid positions but is inspected as one unit
            const columnNumber = startingValue;
            const columnId = `${section.id}-${columnNumber.toString().padStart(2, '0')}`;
            allColumns.add(columnId);
            console.log(`Spanned shelf: ${columnId} (spans ${section.spanCol || 1} cols x ${section.spanRow || 1} rows)`);
          } else {
            // For regular sections, generate column IDs for each position
            for (let i = 0; i < section.width; i++) {
              const columnNumber = startingValue + i;
              const columnId = `${section.id}-${columnNumber.toString().padStart(2, '0')}`;
              allColumns.add(columnId);
            }
          }
        }
      });
    });
    
    console.log(`Total actual shelf columns found: ${allColumns.size}`);
    console.log('Actual shelf columns:', Array.from(allColumns).sort());
    
    return Array.from(allColumns);
  };

  // Check if all shelves across all pages are inspected in current cycle
  const areAllShelvesInspected = () => {
    if (selectedCycle !== 'current') return false;
    
    const allColumns = getAllPossibleColumns();
    const inspectedCount = allColumns.filter(columnId => 
      isShelfInspectedInCurrentCycle(columnId)
    ).length;
    
    console.log(`Inspection progress: ${inspectedCount}/${allColumns.length} shelves inspected`);
    return inspectedCount === allColumns.length && allColumns.length > 0;
  };

  // DEBUG: Function to show detailed inspection status
  const debugInspectionStatus = () => {
    console.log('=== DEBUG INSPECTION STATUS ===');
    
    const allColumns = getAllPossibleColumns();
    const inspectedColumns = [];
    const uninspectedColumns = [];
    
    allColumns.forEach(columnId => {
      const inspection = inspectionData[columnId];
      const isInspected = inspection && inspection.status && inspection.status !== 'to_check';
      
      if (isInspected) {
        inspectedColumns.push({
          columnId,
          status: inspection.status,
          lastCheck: inspection.last_check
        });
      } else {
        uninspectedColumns.push({
          columnId,
          status: inspection ? inspection.status : 'no data',
          hasData: !!inspection
        });
      }
    });
    
    console.log(`Total columns: ${allColumns.length}`);
    console.log(`Inspected columns: ${inspectedColumns.length}`);
    console.log(`Uninspected columns: ${uninspectedColumns.length}`);
    console.log('Inspected:', inspectedColumns);
    console.log('Uninspected:', uninspectedColumns);
    
    // Show modal with the information
    Modal.info({
      title: 'Debug: Inspection Status (Excluding Spanned Shelves)',
      width: 800,
      content: (
        <div>
          <p><strong>Total Inspectable Shelves:</strong> {allColumns.length}</p>
          <p><strong>Inspected:</strong> {inspectedColumns.length}</p>
          <p><strong>Uninspected:</strong> {uninspectedColumns.length}</p>
          
          <div style={{ marginBottom: '16px', padding: '8px', backgroundColor: '#f0f8ff', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
            <strong>Note:</strong> Spanned shelves (like X-02 to X-05, M-41, etc.) are now excluded from the count 
            as they are part of larger shelf units that span multiple grid positions.
          </div>
          
          {uninspectedColumns.length > 0 && (
            <div>
              <h4>Missing Inspections:</h4>
              <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                {uninspectedColumns.map(col => (
                  <div key={col.columnId} style={{ marginBottom: '4px' }}>
                    <strong>{col.columnId}</strong> - Status: {col.status} 
                    {!col.hasData && ' (No data found)'}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div style={{ marginTop: '16px' }}>
            <p><strong>Save Cycle Button Enabled:</strong> {areAllShelvesInspected() ? 'Yes' : 'No'}</p>
          </div>
        </div>
      )
    });
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
        
        // Add feedback for current cycle behavior
        if (selectedCycle === 'current' && isShelfInspectedInCurrentCycle(columnId)) {
          inspectionInfo += '\n📋 Clicca per vedere/modificare ispezione';
          if (multiSelectMode) {
            inspectionInfo += '\n⚠️ Non selezionabile (già ispezionato)';
          }
        } else if (selectedCycle === 'current') {
          inspectionInfo += '\n📝 Clicca per ispezionare';
        } else {
          inspectionInfo += '\n📚 Ciclo storico - Solo cronologia';
        }
      } else if (selectedCycle === 'current') {
        inspectionInfo = '\n📝 Clicca per ispezionare';
      } else {
        inspectionInfo = '\n📚 Ciclo storico - Nessuna ispezione trovata';
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
    // Debug: log what's in selectedColumns
    console.log("Selected columns:", selectedColumns);
    
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
            highlightedShelves={multiSelectMode ? new Set(selectedColumns) : new Set()}
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
            highlightedShelves={multiSelectMode ? new Set(selectedColumns) : new Set()}
          />
        </div>
      );
    } else if (currentPage === 3) {
      return (
          <div className="warehouse-grid-container">
              <WarehouseGridSystem
                  GRID_ROWS={9}
                  GRID_COLS={50}
                  warehouseLayout={rotatedColumnBasedLayouts[3]}
                  onCellClick={handleCellClick}
                  getShelfStatus={getShelfStatus}
                  tooltipContent={getColumnTooltip}
                  showFloorNumber={false}
                  highlightedShelves={multiSelectMode ? new Set(selectedColumns) : new Set()}
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

  // Function to load existing inspection data into the form for editing
  const loadExistingInspectionForEditing = async () => {
    if (!selectedColumn) return;
    
    try {
      // Get the current cycle ID
      let cycleId = selectedCycle !== 'current' ? selectedCycle : null;
      if (!cycleId) {
        const currentCycle = inspectionCycles.find(cycle => cycle.id === 'current');
        if (currentCycle && currentCycle.actual_id) {
          cycleId = currentCycle.actual_id;
        }
      }
      
      if (!cycleId) {
        message.error('Impossibile determinare il ciclo di ispezione corrente');
        return;
      }
      
      // Fetch existing inspection data
      const params = { cycle_id: cycleId };
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/v2/shelf-inspections/${selectedColumn}`,
        { params }
      );
      
      if (response.data.success && response.data.inspection) {
        const inspection = response.data.inspection;
        
        // Set the current status
        setSelectedInspectionStatus(inspection.status);
        
        // Load the form with existing answers
        if (inspection.questions && inspection.questions.length > 0) {
          const formData = {};
          
          console.log('Loading inspection questions:', inspection.questions);
          console.log('Available form questions:', inspectionQuestions);
          
          inspection.questions.forEach(item => {
            console.log('Processing question item:', item);
            
            // Try to find matching question in inspectionQuestions by text
            const matchingQuestion = inspectionQuestions.find(q => 
              q.text === item.question || q.text === item.question_text
            );
            
            if (matchingQuestion) {
              console.log(`Mapping question "${item.question}" to form field "${matchingQuestion.id}"`);
              formData[matchingQuestion.id] = item.answer;
              formData[`${matchingQuestion.id}_note`] = item.notes || '';
            } else {
              console.log(`No matching question found for: ${item.question}`);
              // Fallback: try using question_id directly
              if (item.question_id) {
                formData[item.question_id] = item.answer;
                formData[`${item.question_id}_note`] = item.notes || '';
              }
            }
          });
          
          console.log('Final form data to set:', formData);
          form.setFieldsValue(formData);
          
          // Also update question responses state for consistency
          setQuestionResponses(inspection.questions);
          
          message.success('Dati esistenti caricati per la modifica');
        } else {
          // If no existing questions, load defaults
          await loadDefaultQuestions();
        }
      } else {
        // No existing inspection found, load defaults
        await loadDefaultQuestions();
        setSelectedInspectionStatus('to_check');
      }
    } catch (error) {
      console.error('Error loading existing inspection for editing:', error);
      message.error('Errore nel caricamento dei dati esistenti');
      await loadDefaultQuestions();
      setSelectedInspectionStatus('to_check');
    }
  };

  const toggleHistoryView = async () => {
    const newViewingHistory = !viewingHistory;
    setViewingHistory(newViewingHistory);
    
    if (newViewingHistory && inspectionHistory.length === 0) {
      // Switching TO history view - fetch history if not already loaded
      fetchInspectionHistory(selectedColumn);
    } else if (!newViewingHistory) {
      // Switching FROM history view TO form view
      if (selectedCycle === 'current' && isShelfInspectedInCurrentCycle(selectedColumn)) {
        // If this shelf is already inspected in current cycle, load existing data for editing
        await loadExistingInspectionForEditing();
      } else {
        // For new inspections or historical cycles, load default questions
        await loadDefaultQuestions();
      }
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
    const lastCheck = selectedColumn && inspectionData[selectedColumn]?.last_check;
    return (
      <Card 
        className="current-inspection-cycle"
        bordered={true}
        size="small"
        style={{ minWidth: 260, marginLeft: 16, background: '#e6f7ff', border: '1px solid #91d5ff', padding: 0 }}
        bodyStyle={{ padding: 10 }}
      >
        <Row gutter={[8, 0]} align="middle">
          <Col>
            <CheckCircleOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
          </Col>
          <Col>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {selectedCycle === 'current' ? 'CICLO DI ISPEZIONE CORRENTE' : 'CICLO DI ISPEZIONE STORICO'}
            </div>
            <div style={{ fontSize: 12 }}>
              {selectedCycle === 'current' 
                ? `Ultima verifica: ${formatInspectionDate(lastCheck)}` 
                : `Data ispezione: ${formatInspectionDate(lastCheck)}`
              }
            </div>
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

  // Remove Stato selector from renderInspectionForm
  const renderInspectionForm = () => {
    return (
      <div className="inspection-form-container">
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

  // New: Stato selection modal
  const renderStatoModal = () => (
    <Modal
      title="Seleziona Stato Ispezione"
      open={showStatoModal}
      onCancel={() => setShowStatoModal(false)}
      onOk={() => {
        if (pendingSaveStatus) {
          setShowStatoModal(false);
          saveInspectionForm(pendingSaveStatus);
        } else {
          message.error('Seleziona uno stato per continuare');
        }
      }}
      okText="Salva Ispezione"
      cancelText="Annulla"
      confirmLoading={pendingSave}
    >
      <Radio.Group
        value={pendingSaveStatus}
        onChange={e => setPendingSaveStatus(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio value="buono">
            <span style={{ color: '#4caf50', fontWeight: 'bold' }}>Buono</span>
          </Radio>
          <Radio value="warning">
            <span style={{ color: '#ff9800', fontWeight: 'bold' }}>Attenzione</span>
          </Radio>
          <Radio value="danger">
            <span style={{ color: '#f44336', fontWeight: 'bold' }}>Pericolo</span>
          </Radio>
        </Space>
      </Radio.Group>
    </Modal>
  );

  // Modified save button handler
  const handleSaveButton = async () => {
    try {
      await form.validateFields();
      setShowStatoModal(true);
      setPendingSaveStatus(null); // Reset selection
    } catch (error) {
      message.error('Per favore completa tutti i campi obbligatori');
    }
  };

  const saveAndCloseCycle = async () => {
    setCreatingCycle(true);
    try {
      // First check if all shelves are inspected
      if (!areAllShelvesInspected()) {
        message.error('Non è possibile salvare il ciclo: alcune scaffalature non sono ancora state ispezionate');
        return;
      }

      // Step 1: Close the current cycle
      const closeResponse = await axios.post(`${process.env.REACT_APP_API_URL}/api/v2/inspection-cycles/close-current`, {
        notes: 'Ciclo completato e salvato dall\'operatore'
      });
      
      if (!closeResponse.data.success) {
        throw new Error(closeResponse.data.error || 'Errore durante la chiusura del ciclo');
      }

      // Step 2: Create a new active cycle for the next inspection period
      const createResponse = await axios.post(`${process.env.REACT_APP_API_URL}/api/v2/inspection-cycles`, {
        cycle_name: `Ciclo ${new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`,
        is_active: true
      });
      
      if (!createResponse.data.success) {
        console.warn('Ciclo chiuso ma impossibile creare nuovo ciclo:', createResponse.data.error);
        message.warning('Ciclo salvato, ma errore nella creazione del nuovo ciclo. Contatta l\'amministratore.');
      }
      
      message.success('Ciclo di ispezione salvato e chiuso. Nuovo ciclo creato e attivato.');
      
      // Refresh cycles data to get the new active cycle
      await fetchInspectionCycles();
      
      // Switch back to current cycle view (should be the new active cycle)
      setSelectedCycle('current');
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
      console.error('Error saving inspection cycle:', error);
      message.error('Errore durante il salvataggio del ciclo di ispezione: ' + error.message);
    } finally {
      setCreatingCycle(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Title level={2} style={{ marginBottom: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ispezione Scaffali</Title>
          <Text>Clicca su una colonna di scaffali per visualizzare i dettagli del suo contenuto.</Text>
        </div>
        <div style={{ flexShrink: 0, minWidth: 340, maxWidth: 400 }}>
          <Card size="small" bordered style={{ marginBottom: 0 }}>
            <div style={{ marginBottom: 8 }}>
              <Space>
                <Text strong>Visualizza ciclo di ispezione:</Text>
                {selectedCycle !== 'current' && (
                  <Tag color="purple">Visualizzazione storica</Tag>
                )}
              </Space>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Select 
                  loading={loadingCycles}
                  value={selectedCycle}
                  onChange={(value) => {
                    setSelectedCycle(value);
                    fetchInspectionData(value);
                  }}
                  placeholder="Seleziona ciclo di ispezione"
                  style={{ minWidth: 180 }}
                >
                  {inspectionCycles.map(cycle => (
                    <Option key={cycle.id} value={cycle.id}>
                      {cycle.label}
                    </Option>
                  ))}
                </Select>
                <Button 
                  type="primary"
                  onClick={() => saveAndCloseCycle()}
                  icon={<PlusCircleOutlined />}
                  loading={creatingCycle}
                  disabled={selectedCycle !== 'current' || !areAllShelvesInspected()}
                  title={selectedCycle !== 'current' ? 'Disponibile solo per il ciclo corrente' : 
                         !areAllShelvesInspected() ? 'Completa tutte le ispezioni prima di salvare il ciclo' : 
                         'Salva e chiudi il ciclo corrente'}
                >
                  Salva Ciclo
                </Button>
               
              </Space>
            </div>
            
          </Card>
        </div>
      </div>
      
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
                  <div style={{ marginBottom: 12 }}>
                    <Button
                      type={multiSelectMode ? 'primary' : 'default'}
                      onClick={() => {
                        setMultiSelectMode(m => !m);
                        setSelectedColumns([]);
                      }}
                    >
                      {multiSelectMode ? 'Disattiva Selezione Multipla' : 'Selezione Multipla'}
                    </Button>
                    
                    {multiSelectMode && selectedColumns.length > 0 && (
                    <Button
                      type="primary"
                      style={{ margin: '12px' }}
                      onClick={() => {
                        setModalVisible(true);
                        setSelectedColumn(selectedColumns[0]); // for legacy logic
                        const parts = selectedColumns[0].split('-');
                        if (parts.length >= 2) fetchColumnDetails(parts[0], parseInt(parts[1], 10));
                      }}
                    >
                      Ispeziona Colonne Selezionate
                    </Button>
                  )}
                  </div>
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
                      <span>Attenzione</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '20px', height: '20px', backgroundColor: '#f44336', marginRight: '5px' }}></div>
                      <span>Pericolo</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '20px', height: '20px', backgroundColor: '#ffffff', border: '1px solid #ccc', marginRight: '5px' }}></div>
                      <span>Da Ispezionare</span>
                    </div>
                    {multiSelectMode && (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '20px', height: '20px', backgroundColor: '#ffeb3b', border: '2px solid #ff9800', marginRight: '5px' }}></div>
                        <span>Selezionato</span>
                      </div>
                    )}
                  </div>
                  <div className="pagination-container">
                    <Pagination
                      current={currentPage}
                      total={3}
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
        title={selectedColumns.length > 1
          ? `Ispezione Collettiva: ${selectedColumns.length} colonne`
          : `Ispezione Scaffale: ${selectedColumn || ''}`}
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
              loading={pendingSave} 
              onClick={handleSaveButton}
              icon={<SaveOutlined />}
            >
              Salva Ispezione
            </Button>
          ),
        ].filter(Boolean)}
      >
        {selectedColumns.length > 1 && (
          <Alert
            message={`Colonne selezionate: ${selectedColumns.join(', ')}`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
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
      {renderStatoModal()}
    </div>
  );
};

export default IspezioneScaffali; 