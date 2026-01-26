import { useState, useEffect, useCallback } from 'react';
import { useDeviceStore } from '../stores/deviceStore';

interface GroupManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#FFB000', // Vault-Tec Yellow
  '#FF3131', // Nuka-Cola Red
  '#4A90D9', // Brotherhood Blue
  '#00A0A0', // Institute Teal
  '#C4A35A', // NCR Tan
  '#B22222', // Enclave Red
  '#00FF41', // Pip-Boy Green
  '#FF6B6B', // Pink
  '#9B59B6', // Purple
  '#3498DB', // Light Blue
];

export function GroupManager({ isOpen, onClose }: GroupManagerProps) {
  const { groups, createGroup, updateGroup, deleteGroup } = useDeviceStore();
  const [isCreating, setIsCreating] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#FFB000');
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  if (!isOpen && !isVisible) return null;

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setError('Group name is required');
      return;
    }

    try {
      await createGroup(newGroupName.trim(), newGroupColor);
      setNewGroupName('');
      setNewGroupColor('#FFB000');
      setIsCreating(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    }
  };

  const handleUpdateGroup = async (id: string, name: string, color: string) => {
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    try {
      await updateGroup(id, name.trim(), color);
      setEditingGroupId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (confirm('Are you sure you want to delete this group? Devices in this group will become ungrouped.')) {
      try {
        await deleteGroup(id);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete group');
      }
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto ${isClosing ? 'animate-modal-backdrop-out' : 'animate-modal-backdrop-in'}`}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className={`relative w-full max-w-md bg-bg-secondary border-2 border-border rounded-xl overflow-hidden my-auto ${isClosing ? 'animate-modal-out' : 'animate-modal-in'}`} style={{ maxHeight: 'calc(100vh - 4rem)' }}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-accent uppercase tracking-wider">Manage Groups</h2>
          <button
            onClick={handleClose}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          {/* Existing Groups */}
          <div className="space-y-2 mb-4">
            {groups.length === 0 && !isCreating && (
              <p className="text-sm text-text-secondary text-center py-4">
                No groups yet. Create one to organize your devices.
              </p>
            )}

            {groups.map((group) => (
              <div key={group.id}>
                {editingGroupId === group.id ? (
                  <GroupEditForm
                    initialName={group.name}
                    initialColor={group.color}
                    onSave={(name, color) => handleUpdateGroup(group.id, name, color)}
                    onCancel={() => setEditingGroupId(null)}
                  />
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-primary border border-border">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="flex-1 text-text-primary font-medium">{group.name}</span>
                    <button
                      onClick={() => setEditingGroupId(group.id)}
                      className="p-1.5 rounded hover:bg-bg-tertiary text-text-secondary hover:text-accent transition-colors"
                      title="Edit group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="p-1.5 rounded hover:bg-danger/20 text-text-secondary hover:text-danger transition-colors"
                      title="Delete group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Create New Group */}
          {isCreating ? (
            <GroupEditForm
              initialName={newGroupName}
              initialColor={newGroupColor}
              onSave={(name, color) => {
                setNewGroupName(name);
                setNewGroupColor(color);
                handleCreateGroup();
              }}
              onCancel={() => {
                setIsCreating(false);
                setNewGroupName('');
                setNewGroupColor('#FFB000');
              }}
              isNew
            />
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-border text-text-secondary hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Group
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <button
            onClick={handleClose}
            className="w-full py-2 px-4 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors btn-ripple"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface GroupEditFormProps {
  initialName: string;
  initialColor: string;
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
  isNew?: boolean;
}

function GroupEditForm({ initialName, initialColor, onSave, onCancel, isNew }: GroupEditFormProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  return (
    <div className="p-3 rounded-lg bg-bg-primary border border-accent/50 space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name"
        className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-text-primary focus:outline-none focus:border-accent"
        autoFocus
      />

      <div>
        <label className="block text-xs text-text-secondary mb-2">Color</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((presetColor) => (
            <button
              key={presetColor}
              onClick={() => setColor(presetColor)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                color === presetColor ? 'border-white scale-110' : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: presetColor }}
              title={presetColor}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
            title="Custom color"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(name, color)}
          className="flex-1 py-2 px-3 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors text-sm"
        >
          {isNew ? 'Create' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="py-2 px-3 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
