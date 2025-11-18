import { useEffect } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Add } from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setStudies, setLoading } from '../store/slices/studySlice';
import api from '../services/api';

const columns: GridColDef[] = [
  { field: 'protocolNumber', headerName: 'Protocol Number', width: 150 },
  { field: 'title', headerName: 'Title', width: 300 },
  { field: 'phase', headerName: 'Phase', width: 120 },
  { field: 'status', headerName: 'Status', width: 150 },
];

export default function Studies() {
  const dispatch = useAppDispatch();
  const { studies, loading } = useAppSelector((state) => state.study);

  useEffect(() => {
    loadStudies();
  }, []);

  const loadStudies = async () => {
    dispatch(setLoading(true));
    try {
      const response = await api.getStudies();
      dispatch(setStudies(response.data.studies));
    } catch (error) {
      console.error('Failed to load studies:', error);
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Studies</Typography>
        <Button variant="contained" startIcon={<Add />}>
          New Study
        </Button>
      </Box>

      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={studies}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
        />
      </Paper>
    </Box>
  );
}
