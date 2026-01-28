import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChatProvider } from './context/ChatContext'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ChatProvider>
      <App />
    </ChatProvider>
  </React.StrictMode>,
)
