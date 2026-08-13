import { useState } from 'react'
import DatabaseManager from './pages/DatabaseManager'
import ItemEditor from './pages/ItemEditor'
import Playlist from './pages/Playlist'

function App() {
  const [view, setView] = useState('list')
  const [previousView, setPreviousView] = useState('list')
  const [selectedItemId, setSelectedItemId] = useState(null)
  // Set only when the editor is opened from a playlist row: which slot the
  // "volatile" (per-instance) edits should be saved against. Null when
  // opened from the Elemente list, where only the global item exists.
  const [playlistContext, setPlaylistContext] = useState(null)

  const openEditor = (internalId, context = null) => {
    setPreviousView(view)
    setSelectedItemId(internalId)
    setPlaylistContext(context)
    setView('editor')
  }

  const backToList = () => {
    setView(previousView)
  }

  return (
    <>
      {view === 'list' && <DatabaseManager onEditItem={openEditor} onNavigate={setView} />}
      {view === 'playlist' && <Playlist onEditItem={openEditor} onNavigate={setView} />}
      {view === 'editor' && (
        <ItemEditor
          internalId={selectedItemId}
          playlistContext={playlistContext}
          onBack={backToList}
          onNavigate={setView}
        />
      )}
    </>
  )
}

export default App
