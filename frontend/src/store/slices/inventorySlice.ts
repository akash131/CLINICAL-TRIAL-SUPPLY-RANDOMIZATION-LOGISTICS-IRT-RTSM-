import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Inventory {
  id: string;
  kitId: string;
  quantity: number;
  status: string;
}

interface InventoryState {
  items: Inventory[];
  loading: boolean;
}

const initialState: InventoryState = {
  items: [],
  loading: false,
};

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setInventory: (state, action: PayloadAction<Inventory[]>) => {
      state.items = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const { setInventory, setLoading } = inventorySlice.actions;
export default inventorySlice.reducer;
