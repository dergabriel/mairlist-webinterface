import { useState } from 'react'
import DatabaseManager from './pages/DatabaseManager'
import ItemEditor from './pages/ItemEditor'

function App() {
  const [view, setView] = useState('list')
  const [selectedItemId, setSelectedItemId] = useState(null)

  const openEditor = (internalId) => {
    setSelectedItemId(internalId)
    setView('editor')
  }

  const backToList = () => {
    setView('list')
  }

  return (
    <>
      {view === 'list' && <DatabaseManager onEditItem={openEditor} />}
      {view === 'editor' && <ItemEditor internalId={selectedItemId} onBack={backToList} />}
    </>
  )
}

export default App
