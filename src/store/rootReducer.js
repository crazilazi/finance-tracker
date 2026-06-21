import { combineReducers } from '@reduxjs/toolkit';
import expensesReducer from '../features/expenses/expensesSlice';
import simulatorReducer from '../features/simulator/simulatorSlice';

const rootReducer = combineReducers({
  expenses: expensesReducer,
  simulator: simulatorReducer
});

export default rootReducer;
