import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  simSource: 'savings',
  simTrimPct: 20,
  simCustomAmt: 10000,
  simFund: 'largecap',
  simCustomRate: 12,
  simProjectYrs: 0
};

const simulatorSlice = createSlice({
  name: 'simulator',
  initialState,
  reducers: {
    updateSimulatorState(state, action) {
      return { ...state, ...action.payload };
    }
  }
});

export const { updateSimulatorState } = simulatorSlice.actions;
export default simulatorSlice.reducer;
