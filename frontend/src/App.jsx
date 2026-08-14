import { useState } from 'react'
import DatabaseManager from './pages/DatabaseManager'
import ItemEditor from './pages/ItemEditor'
import Playlist from './pages/Playlist'
import MixEditor from './pages/MixEditor'

function App() {
  const [view, setView] = useState('list')
  const [previousView, setPreviousView] = useState('list')
  const [selectedItemId, setSelectedItemId] = useState(null)
  // Set only when the editor is opened from a playlist row: which slot the
  // "volatile" (per-instance) edits should be saved against. Null when
  // opened from the Elemente list, where only the global item exists.
  const [playlistContext, setPlaylistContext] = useState(null)
  // Set when navigating into the Mix Editor from the playlist: the selected
  // items (in playlist order) plus which playlist/hour they came from.
  const [mixEditorContext, setMixEditorContext] = useState(null)

  const openEditor = (internalId, context = null) => {
    setPreviousView(view)
    setSelectedItemId(internalId)
    setPlaylistContext(context)
    setView('editor')
  }

  const backToList = () => {
    setView(previousView)
  }

  const navigate = (nextView, payload = null) => {
    if (nextView === 'mixeditor') setMixEditorContext(payload)
    setView(nextView)
  }

  return (
    <>
      {view === 'list' && <DatabaseManager onEditItem={openEditor} onNavigate={navigate} />}
      {view === 'playlist' && <Playlist onEditItem={openEditor} onNavigate={navigate} />}
      {view === 'mixeditor' && (
        <MixEditor
          context={mixEditorContext}
          onBack={() => setView('playlist')}
          onNavigate={navigate}
        />
      )}
      {view === 'editor' && (
        <ItemEditor
          internalId={selectedItemId}
          playlistContext={playlistContext}
          onBack={backToList}
          onNavigate={navigate}
        />
      )}
    </>
  )
}

export default App
