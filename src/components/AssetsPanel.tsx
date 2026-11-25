import React, { useState } from 'react';
import { FolderPlus, Trash2, X } from 'lucide-react';
import type { StudioAsset, StudioFolder } from '../types/studio';

const ASSET_TABS = [
  'Project',
  'Media',
  'Images',
  'Videos',
  'Audio',
  'Text presets',
  'Shapes',
  '3D assets',
  'Effects',
  'Transitions',
];

interface AssetsPanelProps {
  activeTab: string;
  assets: StudioAsset[];
  folders: StudioFolder[];
  selectedLayerId: string | null;
  onSelectTab: (tab: string) => void;
  onAddFolder: (name: string) => void;
  onCleanUnused: () => void;
  onAddFromAsset: (asset: StudioAsset) => void;
  onRenameAsset: (assetId: string, newName: string) => void;
  onReplaceSelectedLayerAsset: (asset: StudioAsset) => void;
  onAddTextPreset: (preset: { name: string; size: number; weight: string; bg: string }) => void;
  onAddShapePreset: (kind: 'sber_bg' | 'rect' | 'circle', name: string) => void;
  onApplyEffect: (effectName: string) => void;
  onAddTransition: (tr: {
    name: string;
    kind: 'smooth_zoom' | 'camera_push' | 'whip_pan' | 'light_sweep';
  }) => void;
}

export const AssetsPanel: React.FC<AssetsPanelProps> = ({
  activeTab,
  assets,
  folders,
  selectedLayerId,
  onSelectTab,
  onAddFolder,
  onCleanUnused,
  onAddFromAsset,
  onRenameAsset,
  onReplaceSelectedLayerAsset,
  onAddTextPreset,
  onAddShapePreset,
  onApplyEffect,
  onAddTransition,
}) => {
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('B-Roll');
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const inspectedAsset = assets.find((a) => a.id === inspectedAssetId) || null;

  const filteredAssets = assets.filter((a) => {
    if (activeTab === 'Project' || activeTab === 'Media') return true;
    if (activeTab === 'Images') return a.kind === 'image';
    if (activeTab === 'Videos') return a.kind === 'video';
    if (activeTab === 'Audio') return a.kind === 'audio';
    if (activeTab === '3D assets') return a.kind === '3d';
    return true;
  });

  const renderStaticPresetList = () => {
    if (activeTab === 'Text presets') {
      const presets = [
        { name: 'Sber Bold Kinetic Headline', size: 78, weight: '800', bg: 'none' },
        { name: 'Top-Left Brand Badge', size: 38, weight: '800', bg: 'none' },
        { name: 'Portrait Subtitle Pill', size: 32, weight: '500', bg: 'rgba(4,10,26,0.72)' },
      ];
      return presets.map((p) => (
        <AssetRow
          key={p.name}
          title={p.name}
          sub="Text Preset"
          thumb="TXT"
          onClick={() => onAddTextPreset(p)}
        />
      ));
    }
    if (activeTab === 'Shapes') {
      const shapes: Array<{ name: string; kind: 'sber_bg' | 'rect' | 'circle' }> = [
        { name: 'Deep Blue-Black Studio BG', kind: 'sber_bg' },
        { name: 'Glass Card Container', kind: 'rect' },
        { name: 'Studio Circle Halo', kind: 'circle' },
      ];
      return shapes.map((s) => (
        <AssetRow
          key={s.name}
          title={s.name}
          sub="Vector Shape"
          thumb="SHP"
          onClick={() => onAddShapePreset(s.kind, s.name)}
        />
      ));
    }
    if (activeTab === 'Effects') {
      const fx = [
        'Gaussian Blur (+8px)',
        'Glass Bloom Glow',
        'Color Contrast Boost',
        'Luminous Light Sweep',
      ];
      return fx.map((ef) => (
        <AssetRow
          key={ef}
          title={ef}
          sub="Click to apply to selected layer"
          thumb="FX"
          onClick={() => onApplyEffect(ef)}
        />
      ));
    }
    if (activeTab === 'Transitions') {
      const trs: Array<{
        name: string;
        kind: 'smooth_zoom' | 'camera_push' | 'whip_pan' | 'light_sweep';
      }> = [
        { name: 'Smooth Zoom Burst', kind: 'smooth_zoom' },
        { name: 'Camera Push', kind: 'camera_push' },
        { name: 'Whip Pan', kind: 'whip_pan' },
        { name: 'Light Sweep', kind: 'light_sweep' },
      ];
      return trs.map((tr) => (
        <AssetRow
          key={tr.name}
          title={tr.name}
          sub="Add at playhead (20f)"
          thumb="TRN"
          onClick={() => onAddTransition(tr)}
        />
      ));
    }
    return null;
  };

  const presetItems = renderStaticPresetList();

  return (
    <aside className="col-start-1 row-start-2 flex flex-col min-w-0 overflow-hidden bg-[var(--bg-panel)] border-r border-[var(--border)]">
      <div className="h-[26px] flex items-center justify-between px-2 border-b border-[var(--border)] bg-[#171920] shrink-0">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          Project &amp; Assets
        </span>
        <div className="flex items-center gap-1">
          <button
            className="studio-btn icon-btn"
            onClick={() => setCreatingFolder((v) => !v)}
            title="New Folder"
            aria-label="New Folder"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
          <button
            className="studio-btn icon-btn"
            onClick={onCleanUnused}
            title="Delete Unused Assets"
            aria-label="Clean Unused Assets"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {creatingFolder && (
        <div className="p-1.5 border-b border-[var(--border)] bg-[var(--bg-input)] flex items-center gap-1">
          <input
            className="studio-input flex-1 min-w-0"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Folder name"
          />
          <button
            className="studio-btn primary"
            onClick={() => {
              if (folderName.trim()) {
                onAddFolder(folderName.trim());
                setCreatingFolder(false);
              }
            }}
          >
            Add
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-0.5 p-1 border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
        {ASSET_TABS.map((t) => (
          <button
            key={t}
            className={`h-[20px] px-1.5 text-[10px] rounded-[3px] border whitespace-nowrap cursor-pointer ${
              activeTab === t
                ? 'bg-[var(--bg-elev)] border-[var(--border)] text-[var(--text)]'
                : 'bg-transparent border-transparent text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
            onClick={() => onSelectTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5">
        {presetItems ? (
          presetItems
        ) : (
          <>
            {activeTab === 'Project' &&
              folders.map((f) => (
                <AssetRow key={f.id} title={f.name} sub="Folder" thumb="DIR" onClick={() => {}} />
              ))}
            {filteredAssets.length === 0 ? (
              <div className="text-[var(--text-dim)] p-3 text-center">No assets in {activeTab}.</div>
            ) : (
              filteredAssets.map((a) => (
                <AssetRow
                  key={a.id}
                  title={a.name}
                  sub={a.source || a.kind}
                  thumb={a.kind.toUpperCase()}
                  imageUrl={a.url}
                  active={inspectedAssetId === a.id}
                  onClick={() => setInspectedAssetId(a.id)}
                  onDoubleClick={() => onAddFromAsset(a)}
                />
              ))
            )}
          </>
        )}
      </div>

      {inspectedAsset && (
        <div className="border-t border-[var(--border)] p-2 bg-[#101216] text-[10px] text-[var(--text-soft)] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <strong className="truncate text-[var(--text)]">{inspectedAsset.name}</strong>
            <button
              className="studio-btn icon-btn"
              onClick={() => {
                setInspectedAssetId(null);
                setRenamingAssetId(null);
              }}
              aria-label="Close asset preview"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {renamingAssetId === inspectedAsset.id ? (
            <div className="flex items-center gap-1 mb-1">
              <input
                className="studio-input flex-1 min-w-0"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
              />
              <button
                className="studio-btn primary"
                onClick={() => {
                  if (renameDraft.trim()) onRenameAsset(inspectedAsset.id, renameDraft.trim());
                  setRenamingAssetId(null);
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              <button className="studio-btn primary" onClick={() => onAddFromAsset(inspectedAsset)}>
                Add
              </button>
              <button
                className="studio-btn"
                onClick={() => {
                  setRenamingAssetId(inspectedAsset.id);
                  setRenameDraft(inspectedAsset.name);
                }}
              >
                Rename
              </button>
              <button
                className="studio-btn"
                disabled={!selectedLayerId}
                onClick={() => onReplaceSelectedLayerAsset(inspectedAsset)}
              >
                Replace Layer
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

interface AssetRowProps {
  title: string;
  sub: string;
  thumb: string;
  imageUrl?: string;
  active?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}

const AssetRow: React.FC<AssetRowProps> = ({
  title,
  sub,
  thumb,
  imageUrl,
  active,
  onClick,
  onDoubleClick,
}) => (
  <div
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    className={`flex items-center gap-1.5 p-1.5 rounded-[3px] cursor-pointer mb-0.5 border ${
      active
        ? 'border-[var(--accent)] bg-[var(--bg-hover)]'
        : 'border-transparent bg-[var(--bg-elev)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
    }`}
  >
    <div className="w-[30px] h-[22px] rounded-[2px] bg-[#0d0f13] border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 text-[9px] text-[var(--text-dim)]">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        thumb
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[11px] truncate text-[var(--text)]">{title}</div>
      <div className="text-[9.5px] truncate text-[var(--text-dim)]">{sub}</div>
    </div>
  </div>
);
