# 🎨 Design System

Verbindliche Design Vorgaben für alle Screens des mAirList Webinterface. Basis ist der Look der TubeLive Screenshots. Jeder neue Screen nutzt exakt diese Tokens und Muster, damit alles wie aus einem Guss wirkt.

## Farben (Tailwind Klassen)

| Rolle | Klasse | Zweck |
|---|---|---|
| Haupt Hintergrund | `bg-zinc-950` | Content Fläche, Tabelle |
| Panel Hintergrund | `bg-zinc-900` | Nav Sidebar, Baum, Karten |
| Hover und aktive Fläche | `bg-zinc-800` | Zeilen Hover, aktive Nav |
| Rand | `border-zinc-800` | alle Trennlinien |
| Text primär | `text-zinc-100` | Titel, Werte |
| Text sekundär | `text-zinc-400` | Labels, Typ |
| Text gedämpft | `text-zinc-500` / `text-zinc-600` | IDs, Meta, Platzhalter |
| Akzent | `orange-500` | Logo, aktive Marker, Fokus |
| Aktion primär | `green-600` | Speichern, Edit, Neues Element |
| Aktion löschen | `red-600` | Delete |

Cue Punkt Farben liegen in der Datenquelle (`CUE_POINTS`), nicht hier, weil sie Daten sind.

## Layout

Dreispaltiges Grundgerüst über die volle Höhe (`h-screen`):

```
┌──────────┬───────────────┬─────────────────────────────┐
│ Nav      │ Kontext       │ Content                      │
│ w-52     │ w-64          │ flex-1                       │
│ Sidebar  │ Baum ODER     │ Header, Toolbar, Inhalt      │
│          │ Tab Leiste    │                              │
└──────────┴───────────────┴─────────────────────────────┘
```

Die mittlere Spalte zeigt in der Listen Ansicht den Bibliotheks Baum, in der Editor Ansicht die Tab Leiste des Items. Nav Sidebar und Header bleiben überall gleich.

## Komponenten Muster

- **NavItem:** Icon plus Label, aktiver Zustand `bg-zinc-800` mit orangem Icon
- **Header:** oranges Icon Quadrat (`bg-orange-500`, `rounded-lg`), Titel, rechts Refresh Button (grün outline)
- **Primär Button:** `bg-green-600 hover:bg-green-500`, weißer Text
- **Icon Aktion:** 7x7 Quadrat, grün für Edit, rot für Delete
- **Input:** `bg-zinc-900 border-zinc-800`, Fokus `border-zinc-700`, Platzhalter `text-zinc-600`
- **Tabelle:** sortierbare Kopfzeile mit `ArrowUpDown`, aktiver Sortierpfeil orange, Zeilen Hover `bg-zinc-900/50`
- **Tab (Editor):** aktiver Tab mit orangem linken Rand plus `bg-zinc-800/60`, wie der aktive Baum Knoten

## Icons

Immer `lucide-react`. Konsistente Größen: 16 in der Nav, 14 bis 15 im Baum, 13 in Aktions Buttons.

## Typografie

`font-sans`, Standard System Stack. Größen: `text-lg` Header, `text-sm` Inhalt, `text-[11px]` Nav Sektionslabels in Versalien.
