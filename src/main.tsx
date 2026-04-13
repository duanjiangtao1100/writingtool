import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 临时禁用 StrictMode 来调试状态重置问题
ReactDOM.createRoot(document.getElementById('app')!).render(
  <App />
)
