import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Patient {
  id: string;
  patientNumber: string;
  initials: string;
  status: string;
}

interface PatientState {
  patients: Patient[];
  loading: boolean;
}

const initialState: PatientState = {
  patients: [],
  loading: false,
};

const patientSlice = createSlice({
  name: 'patient',
  initialState,
  reducers: {
    setPatients: (state, action: PayloadAction<Patient[]>) => {
      state.patients = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const { setPatients, setLoading } = patientSlice.actions;
export default patientSlice.reducer;
