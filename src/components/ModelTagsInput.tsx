import { useState, useEffect, Fragment, useCallback } from "react";
import { Combobox, Transition } from "@headlessui/react";
import { RiCloseLine, RiAddLine } from "@remixicon/react";
import { listAllModelTags, addModelTag, removeModelTag } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface ModelTagsInputProps {
  versionId: string;
  tags: string[];
  onChange?: (tags: string[]) => void;
  readonly?: boolean;
}

export function ModelTagsInput({
  versionId,
  tags,
  onChange,
  readonly = false,
}: ModelTagsInputProps) {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(tags);

  // Load all model tags for autocomplete
  useEffect(() => {
    listAllModelTags().then(setAllTags).catch(console.error);
  }, []);

  // Sync local tags with props
  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  const handleAddTag = useCallback(async () => {
    const tag = newTag.trim();
    if (tag && !localTags.includes(tag)) {
      setSaving(true);
      try {
        await addModelTag(versionId, tag);
        const newTags = [...localTags, tag];
        setLocalTags(newTags);
        onChange?.(newTags);
        setNewTag("");
        // Refresh all tags for autocomplete
        const updatedTags = await listAllModelTags();
        setAllTags(updatedTags);
      } catch (error) {
        console.error("Failed to add tag:", error);
      } finally {
        setSaving(false);
      }
    }
  }, [newTag, localTags, versionId, onChange]);

  const handleRemoveTag = useCallback(async (tagToRemove: string) => {
    setSaving(true);
    try {
      await removeModelTag(versionId, tagToRemove);
      const newTags = localTags.filter((t) => t !== tagToRemove);
      setLocalTags(newTags);
      onChange?.(newTags);
    } catch (error) {
      console.error("Failed to remove tag:", error);
    } finally {
      setSaving(false);
    }
  }, [localTags, versionId, onChange]);

  // Filter available tags for autocomplete (exclude already added)
  const availableTags = allTags.filter(
    (t) => !localTags.includes(t) && t.toLowerCase().includes(newTag.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Current tags */}
      {localTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {localTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 text-accent text-xs"
            >
              {tag}
              {!readonly && (
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  disabled={saving}
                  className="hover:text-accent-hover disabled:opacity-50"
                >
                  <RiCloseLine className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Add new tag (if not readonly) */}
      {!readonly && (
        <Combobox
          value=""
          onChange={(val: string) => {
            if (val && !localTags.includes(val)) {
              setNewTag(val);
              // Immediately add
              const tag = val.trim();
              if (tag) {
                setSaving(true);
                addModelTag(versionId, tag)
                  .then(async () => {
                    const newTags = [...localTags, tag];
                    setLocalTags(newTags);
                    onChange?.(newTags);
                    setNewTag("");
                    const updatedTags = await listAllModelTags();
                    setAllTags(updatedTags);
                  })
                  .catch(console.error)
                  .finally(() => setSaving(false));
              }
            }
          }}
        >
          <div className="relative">
            <div className="flex gap-2">
              <Combobox.Input
                className="input flex-1 text-sm"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTag.trim()) {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tag..."
                disabled={saving}
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!newTag.trim() || saving}
                className="btn-secondary px-2 py-1.5"
              >
                <RiAddLine className="w-4 h-4" />
              </button>
            </div>

            {availableTags.length > 0 && newTag && (
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Combobox.Options className="absolute mt-1 max-h-32 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
                  {availableTags.slice(0, 5).map((tag) => (
                    <Combobox.Option
                      key={tag}
                      value={tag}
                      className={({ active }) =>
                        cn(
                          "relative cursor-pointer select-none py-2 px-3 text-sm",
                          active
                            ? "bg-background-elevated text-text-primary"
                            : "text-text-secondary"
                        )
                      }
                    >
                      {tag}
                    </Combobox.Option>
                  ))}
                </Combobox.Options>
              </Transition>
            )}
          </div>
        </Combobox>
      )}

      {localTags.length === 0 && readonly && (
        <span className="text-xs text-text-muted">No tags</span>
      )}
    </div>
  );
}
