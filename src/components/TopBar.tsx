import React from 'react';
import {
  Download,
  FolderOpen,
  LayoutGrid,
  Pause,
  Play,
  Redo2,
  Save,
  Settings2,
  Sparkles,
  Undo2,
} from 'lucide-react';

interface TopBarProps {
  projectName: string;
  status: string;
  showSubtitles: boolean;
  muteTextOnFrame: boolean;
  isPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onChangeName: (name: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenAI: () => void;
  onImportClick: () => void;
  onOpenComp: () => void;
  onAddText: () => void;
  onAddShape: () => void;
  onAdd3D: () => void;
  onAddSub: () => void;
  onToggleSubs: () => void;
  onToggleMuteText: () => void;
  onTogglePlay: () => void;
  onOpenExport: () => void;
  onResetLayout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  status,
  showSubtitles,
  muteTextOnFrame,
  isPlaying,
  canUndo,
  canRedo,
  onChangeName,
  onSave,
  onUndo,
  onRedo,
  onOpenAI,
  onImportClick,
  onOpenComp,
  onAddText,
  onAddShape,
  onAdd3D,
  onAddSub,
  onToggleSubs,
  onToggleMuteText,
  onTogglePlay,
  onOpenExport,
  onResetLayout,
}) => {
  const statusColor =
    status === 'Saved' || status === 'Export completed'
      ? 'text-[var(--ok)] border-emerald-500/35'
      : status.toLowerCase().includes('fail')
      ? 'text-[var(--danger)] border-red-500/40'
      : 'text-[var(--warn)] border-amber-500/35';

  return (
    <header
      className="col-span-full row-start-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2.5 py-1 min-h-[38px]"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 font-bold tracking-wider text-[12px] text-[var(--text)] whitespace-nowrap pr-1">
          <span>VOYA</span>
        </div>
        <input
          className="studio-input w-[155px] h-[23px] font-medium"
          type="text"
          value={projectName}
          onChange={(e) => onChangeName(e.target.value)}
          title="Project Name"
          aria-label="Project Name"
        />
        <span
          className={`text-[10px] px-1.5 py-0.5 border bg-[var(--bg-input)] rounded-[3px] whitespace-nowrap ${statusColor}`}
        >
          {status}
        </span>
        <button className="studio-btn" onClick={onSave} title="Save Project (Ctrl+S)">
          <Save className="w-3 h-3" />
          Save
        </button>
        <button
          className="studio-btn icon-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 className="w-3 h-3" />
        </button>
        <button
          className="studio-btn icon-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 className="w-3 h-3" />
        </button>
        <button
          className="studio-btn primary"
          onClick={onOpenAI}
          title="Open AI Script-to-Motion Director"
        >
          <Sparkles className="w-3 h-3" />
          AI Script
        </button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button className="studio-btn" onClick={onImportClick} title="Import Image, Video, Audio, or SRT">
          <FolderOpen className="w-3 h-3" />
          Import
        </button>
        <button className="studio-btn" onClick={onOpenComp} title="Composition Settings">
          <Settings2 className="w-3 h-3" />
          Comp
        </button>
        <button className="studio-btn" onClick={onAddText} title="Add Text Layer">
          +Txt
        </button>
        <button className="studio-btn" onClick={onAddShape} title="Add Shape Layer">
          +Shp
        </button>
        <button className="studio-btn" onClick={onImportClick} title="Add Image Layer">
          +Img
        </button>
        <button className="studio-btn" onClick={onAdd3D} title="Add 3D Object / Glass UI">
          +3D
        </button>
        <button className="studio-btn" onClick={onAddSub} title="Add Subtitle Layer">
          +Sub
        </button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <div className="flex items-center gap-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-[3px] p-0.5">
          <button
            className={`studio-btn ${showSubtitles ? 'active' : ''}`}
            onClick={onToggleSubs}
            title="Show/Hide Subtitles"
          >
            Subs: {showSubtitles ? 'ON' : 'OFF'}
          </button>
          <button
            className={`studio-btn ${muteTextOnFrame ? 'active' : ''}`}
            onClick={onToggleMuteText}
            title="Mute All Text & Subtitles on Frame"
          >
            Mute Txt: {muteTextOnFrame ? 'ON' : 'OFF'}
          </button>
        </div>
        <button className="studio-btn" onClick={onTogglePlay} title="Play/Pause (Space)">
          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button className="studio-btn primary" onClick={onOpenExport} title="Render & Save Video">
          <Download className="w-3 h-3" />
          Export / Render
        </button>
        <button className="studio-btn" onClick={onResetLayout} title="Reset Panel Layout">
          <LayoutGrid className="w-3 h-3" />
          Layout
        </button>
      </div>
    </header>
  );
};
