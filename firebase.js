import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDw9-Ai_j6VaT9V_ByMIYm6X_JZ6KY_dbo",
  authDomain: "healthapp-9d85c.firebaseapp.com",
  projectId: "healthapp-9d85c",
  storageBucket: "healthapp-9d85c.firebasestorage.app",
  messagingSenderId: "401562651410",
  appId: "1:401562651410:web:88ec42dbfe29eab70e81cb",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;