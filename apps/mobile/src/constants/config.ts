import Constants from 'expo-constants';

export const Config = {
  apiUrl: Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000/api/v1',
  wsUrl: Constants.expoConfig?.extra?.wsUrl || 'ws://localhost:3001/ws',
};
