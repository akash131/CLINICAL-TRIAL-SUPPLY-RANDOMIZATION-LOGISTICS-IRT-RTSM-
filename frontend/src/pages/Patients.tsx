import { Box, Typography, Button, Paper } from '@mui/material';
import { Add } from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const columns: GridColDef[] = [
  { field: 'patientNumber', headerName: 'Patient Number', width: 150 },
  { field: 'initials', headerName: 'Initials', width: 100 },
  { field: 'status', headerName: 'Status', width: 150 },
  { field: 'enrollmentDate', headerName: 'Enrollment Date', width: 180 },
];

export default function Patients() {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Patients</Typography>
        <Button variant="contained" startIcon={<Add />}>
          New Patient
        </Button>
      </Box>

      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={[]}
          columns={columns}
          pageSizeOptions={[10, 25, 50]}
        />
      </Paper>
    </Box>
  );
}
