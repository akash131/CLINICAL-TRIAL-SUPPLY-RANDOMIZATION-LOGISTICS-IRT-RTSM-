import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Study {
  id: string;
  protocolNumber: string;
  title: string;
  phase: string;
  status: string;
}

interface StudyState {
  studies: Study[];
  currentStudy: Study | null;
  loading: boolean;
}

const initialState: StudyState = {
  studies: [],
  currentStudy: null,
  loading: false,
};

const studySlice = createSlice({
  name: 'study',
  initialState,
  reducers: {
    setStudies: (state, action: PayloadAction<Study[]>) => {
      state.studies = action.payload;
    },
    setCurrentStudy: (state, action: PayloadAction<Study>) => {
      state.currentStudy = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const { setStudies, setCurrentStudy, setLoading } = studySlice.actions;
export default studySlice.reducer;
