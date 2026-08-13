import { useState } from 'react'
import DatabaseManager from './pages/DatabaseManager'
import ItemEditor from './pages/ItemEditor'
import Playlist from './pages/Playlist'

function App() {
  const [view, setView] = useState('list')
  const [previousView, setPreviousView] = useState('list')
  const [selectedItemId, setSelectedItemId] = useState(null)

  const openEditor = (internalId) => {
    setPreviousView(view)
    setSelectedItemId(internalId)
    setView('editor')
  }

  const backToList = () => {
    setView(previousView)
  }

  return (
    <>
      {view === 'list' && <DatabaseManager onEditItem={openEditor} onNavigate={setView} />}
      {view === 'playlist' && <Playlist onEditItem={openEditor} onNavigate={setView} />}
      {view === 'editor' && <ItemEditor internalId={selectedItemId} onBack={backToList} onNavigate={setView} />}
    </>
  )
}

export default App
