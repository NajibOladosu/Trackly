import React, { useEffect } from 'react'
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import Strike from "@tiptap/extension-strike"
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough,
    List, ListOrdered, Heading2, AlignLeft, AlignCenter,
    AlignRight, Undo2, Redo2, RotateCcw, Pin, Save, Loader2
} from 'lucide-react'

interface NoteEditorProps {
    content: string
    onChangeContent: (content: string) => void
    category: string
    onChangeCategory: (category: string) => void
    isPinned: boolean
    onChangePinned: (pinned: boolean) => void
    onSave: () => void
    saving: boolean
}

export function NoteEditor({
    content,
    onChangeContent,
    category,
    onChangeCategory,
    isPinned,
    onChangePinned,
    onSave,
    saving
}: NoteEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [2, 3],
                },
                codeBlock: false,
                blockquote: false,
            }),
            Placeholder.configure({
                placeholder: 'Write your note here...',
            }),
            TextAlign.configure({
                types: ["heading", "paragraph"],
            }),
        ],
        content: content,
        onUpdate: ({ editor }) => {
            onChangeContent(editor.getHTML())
        },
        editorProps: {
            attributes: {
                class: "focus:outline-none min-h-[200px] prose prose-sm dark:prose-invert max-w-none px-4 py-3 text-white prose-p:text-white prose-headings:text-white prose-strong:text-white prose-ul:text-white prose-ol:text-white prose-li:text-white",
            },
        },
        immediatelyRender: false, // Avoid hydration mismatch
    })

    // Sync content updates from prop (e.g. initial load)
    useEffect(() => {
        if (editor && content && editor.getHTML() !== content) {
            // Check if content is different to avoid cursor jumping or infinite loop
            // But getHTML() returns normalized HTML, so straight comparison might be flaky
            // If the content is just plain text vs p-wrapped, Tiptap wraps it.
            // For now, only set if completely different or empty editor
            if (editor.isEmpty && content) {
                editor.commands.setContent(content)
            } else if (Math.abs(editor.getHTML().length - content.length) > 10) {
                // Heuristic: if length differs significantly, update. 
                // Better: just trust onUpdate to be the source of truth after load.
                // Only update if we are SURE it's a new note loaded?
                // For now, use exact match check as in original RichTextEditor
                editor.commands.setContent(content)
            }
        }
    }, [content, editor])

    if (!editor) {
        return null
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Category Field */}
            <div className="space-y-2">
                <label className="text-sm font-medium">Category (Optional)</label>
                <input
                    type="text"
                    placeholder="e.g., Interview Prep, Follow-up, Research"
                    value={category}
                    onChange={(e) => onChangeCategory(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>

            {/* Editor Container */}
            <div className="space-y-2 flex flex-col flex-1 min-h-0">
                <label className="text-sm font-medium">Note Content *</label>
                <div className="border border-input rounded-lg overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-primary focus-within:shadow-lg shadow-md transition-all flex-1 bg-background/50">
                    {/* Toolbar */}
                    <div className="flex gap-1 border-b border-input bg-muted/50 p-2 backdrop-blur-sm overflow-x-auto">
                        <ToolbarButton
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            disabled={!editor.can().chain().focus().toggleBold().run()}
                            isActive={editor.isActive('bold')}
                            icon={<Bold className="w-4 h-4" />}
                            title="Bold"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            disabled={!editor.can().chain().focus().toggleItalic().run()}
                            isActive={editor.isActive('italic')}
                            icon={<Italic className="w-4 h-4" />}
                            title="Italic"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().toggleUnderline().run()}
                            disabled={!editor.can().chain().focus().toggleUnderline().run()}
                            isActive={editor.isActive('underline')}
                            icon={<UnderlineIcon className="w-4 h-4" />}
                            title="Underline"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().toggleStrike().run()}
                            disabled={!editor.can().chain().focus().toggleStrike().run()}
                            isActive={editor.isActive('strike')}
                            icon={<Strikethrough className="w-4 h-4" />}
                            title="Strikethrough"
                        />
                        <div className="w-px h-4 bg-border mx-1 self-center" />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                            disabled={!editor.can().chain().focus().toggleHeading({ level: 2 }).run()}
                            isActive={editor.isActive('heading', { level: 2 })}
                            icon={<Heading2 className="w-4 h-4" />}
                            title="Heading"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().toggleBulletList().run()}
                            disabled={!editor.can().chain().focus().toggleBulletList().run()}
                            isActive={editor.isActive('bulletList')}
                            icon={<List className="w-4 h-4" />}
                            title="Bullet List"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().toggleOrderedList().run()}
                            disabled={!editor.can().chain().focus().toggleOrderedList().run()}
                            isActive={editor.isActive('orderedList')}
                            icon={<ListOrdered className="w-4 h-4" />}
                            title="Numbered List"
                        />
                        <div className="w-px h-4 bg-border mx-1 self-center" />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().setTextAlign('left').run()}
                            isActive={editor.isActive({ textAlign: 'left' })}
                            icon={<AlignLeft className="w-4 h-4" />}
                            title="Align Left"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().setTextAlign('center').run()}
                            isActive={editor.isActive({ textAlign: 'center' })}
                            icon={<AlignCenter className="w-4 h-4" />}
                            title="Align Center"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().setTextAlign('right').run()}
                            isActive={editor.isActive({ textAlign: 'right' })}
                            icon={<AlignRight className="w-4 h-4" />}
                            title="Align Right"
                        />
                        <div className="w-px h-4 bg-border mx-1 self-center" />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().undo().run()}
                            disabled={!editor.can().chain().focus().undo().run()}
                            icon={<Undo2 className="w-4 h-4" />}
                            title="Undo"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().redo().run()}
                            disabled={!editor.can().chain().focus().redo().run()}
                            icon={<Redo2 className="w-4 h-4" />}
                            title="Redo"
                        />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().clearNodes().run()}
                            icon={<RotateCcw className="w-4 h-4" />}
                            title="Clear Formatting"
                        />
                    </div>

                    {/* Tiptap Editor Content */}
                    <div
                        className="flex-1 overflow-y-auto min-h-0 cursor-text scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-muted"
                        onClick={() => editor.chain().focus().run()}
                    >
                        <EditorContent editor={editor} className="h-full" />
                    </div>
                </div>
            </div>

            {/* Pin Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-input/50">
                <div className="flex items-center gap-2">
                    <Pin className={`h-4 w-4 ${isPinned ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium">Pin this note to the top</span>
                </div>
                <button
                    onClick={() => onChangePinned(!isPinned)}
                    className={`
                        relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                        ${isPinned ? 'bg-primary' : 'bg-input'}
                    `}
                >
                    <span
                        className={`
                            pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform
                            ${isPinned ? 'translate-x-[18px]' : 'translate-x-0.5'}
                        `}
                    />
                </button>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
                <button
                    onClick={onSave}
                    disabled={saving || editor.isEmpty}
                    className="flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm glow-effect w-full sm:w-auto"
                >
                    {saving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>Save Note</>
                    )}
                </button>
            </div>
        </div>
    )
}

function ToolbarButton({ icon, title, onClick, disabled, isActive }: { icon: React.ReactNode, title: string, onClick?: () => void, disabled?: boolean, isActive?: boolean }) {
    return (
        <button
            title={title}
            onClick={onClick}
            disabled={disabled}
            className={`
                p-1.5 rounded-md transition-colors disabled:opacity-30
                ${isActive
                    ? 'bg-primary/30 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }
            `}
            type="button"
        >
            {icon}
        </button>
    )
}
