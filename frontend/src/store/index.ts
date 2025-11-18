import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import studyReducer from './slices/studySlice';
import patientReducer from './slices/patientSlice';
import inventoryReducer from './slices/inventorySlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    study: studyReducer,
    patient: patientReducer,
    inventory: inventoryReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
