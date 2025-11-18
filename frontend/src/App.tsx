import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Studies from './pages/Studies';
import StudyDetail from './pages/StudyDetail';
import Patients from './pages/Patients';
import Randomization from './pages/Randomization';
import SupplyManagement from './pages/SupplyManagement';
import Inventory from './pages/Inventory';
import Sites from './pages/Sites';
import Analytics from './pages/Analytics';
import { useAppSelector } from './store/hooks';

function App() {
  const { isAuthenticated } = useAppSelector(state => state.auth);

  return (
    <Box>
      <Routes>
        <Route path="/login" element={<Login />} />

        {isAuthenticated ? (
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="studies" element={<Studies />} />
            <Route path="studies/:studyId" element={<StudyDetail />} />
            <Route path="patients" element={<Patients />} />
            <Route path="randomization" element={<Randomization />} />
            <Route path="supply" element={<SupplyManagement />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="sites" element={<Sites />} />
            <Route path="analytics" element={<Analytics />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </Box>
  );
}

export default App;
