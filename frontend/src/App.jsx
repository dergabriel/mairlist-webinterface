import { useState } from 'react'
import DatabaseManager from './pages/DatabaseManager'

function App() {
  const [currentPage, setCurrentPage] = useState('database')

  return (
    <>
      {currentPage === 'database' && <DatabaseManager />}
    </>
  )
}

export default App
