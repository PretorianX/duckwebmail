import { useEffect, useMemo, useRef, useState } from "react";

import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";

import {
  Bold,
  ChevronDown,
  Italic,
  List,
  ListOrdered,
  Link2,
  Link2Off,
  MoreHorizontal,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  ImagePlus,
  Undo2,
  XCircle
} from "lucide-react";

import styles from "./composeEditor.module.css";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return {
      types: ["textStyle"]
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => {
              const size = (element as HTMLElement).style.fontSize;
              return size || null;
            },
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            }
          }
        }
      }
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});

type Props = {
  valueHtml: string;
  onChangeHtml: (next: string) => void;
  placeholder?: string;
};

const FONT_FAMILIES: Array<{ label: string; value: string }> = [
  { label: "Inter", value: "Inter" },
  { label: "Nunito", value: "Nunito" },
  { label: "Roboto", value: "Roboto" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Monospace", value: "ui-monospace" }
];

const FONT_SIZES: Array<{ label: string; value: string }> = [
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "24", value: "24px" },
  { label: "32", value: "32px" }
];

type Picker = "font" | "size" | "more" | null;

function htmlOrEmpty(editorHtml: string, editorText: string) {
  return editorText.trim() === "" ? "" : editorHtml;
}

export default function ComposeEditor({ valueHtml, onChangeHtml, placeholder = "Write your message…" }: Props) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [picker, setPicker] = useState<Picker>(null);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false
      }),
      Underline,
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true
      }),
      Image.configure({
        inline: true,
        allowBase64: true
      }),
      Placeholder.configure({
        placeholder
      })
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content: valueHtml || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChangeHtml(htmlOrEmpty(html, text));
    }
  });

  useEffect(() => {
    if (!editor) return;
    const current = htmlOrEmpty(editor.getHTML(), editor.getText());
    if (current === valueHtml) return;

    // Preserve selection where possible; no history entry.
    editor.commands.setContent(valueHtml || "", { emitUpdate: false });
  }, [editor, valueHtml]);

  useEffect(() => {
    if (!editor) return;

    const insertFileAsImage = (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result ?? "");
        if (!src) return;
        editor.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    };

    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (!file) return;
      e.preventDefault();
      insertFileAsImage(file);
    };

    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.preventDefault();
      insertFileAsImage(file);
    };

    const dom = editor.view.dom;
    dom.addEventListener("paste", onPaste);
    dom.addEventListener("drop", onDrop);
    return () => {
      dom.removeEventListener("paste", onPaste);
      dom.removeEventListener("drop", onDrop);
    };
  }, [editor]);

  const fontFamilyValue = editor?.getAttributes("textStyle").fontFamily ?? "";
  const fontSizeValue = editor?.getAttributes("textStyle").fontSize ?? "";

  const fontFamilyLabel =
    FONT_FAMILIES.find((f) => f.value === fontFamilyValue)?.label ?? (fontFamilyValue ? fontFamilyValue : "Font");
  const fontSizeLabel = FONT_SIZES.find((s) => s.value === fontSizeValue)?.label ?? (fontSizeValue ? fontSizeValue : "Size");

  const canUndo = editor?.can().undo() ?? false;
  const canRedo = editor?.can().redo() ?? false;

  return (
    <div className={styles.editorShell} aria-label="Rich text editor">
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <div className={styles.toolbarGroup} aria-label="Fonts">
          <button
            type="button"
            className={styles.pickerButton}
            aria-haspopup="dialog"
            aria-expanded={picker === "font"}
            title="Font family"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPicker((prev) => (prev === "font" ? null : "font"));
            }}
          >
            <span className={styles.pickerButtonText}>{fontFamilyLabel}</span>
            <ChevronDown className={styles.pickerChevron} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={styles.pickerButton}
            aria-haspopup="dialog"
            aria-expanded={picker === "size"}
            title="Font size"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPicker((prev) => (prev === "size" ? null : "size"));
            }}
          >
            <span className={styles.pickerButtonText}>{fontSizeLabel}</span>
            <ChevronDown className={styles.pickerChevron} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.toolbarSpacer} aria-hidden="true" />

        <div className={styles.toolbarGroup} aria-label="History">
          <button
            type="button"
            className={styles.toolButton}
            title="Undo"
            aria-label="Undo"
            disabled={!canUndo}
            onPointerDown={(e) => {
              // Keep this from focusing the editor on mobile.
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor?.chain().focus().undo().run();
            }}
          >
            <Undo2 className={styles.icon} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={styles.toolButton}
            title="More"
            aria-label="More formatting options"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPicker((prev) => (prev === "more" ? null : "more"));
            }}
          >
            <MoreHorizontal className={styles.icon} aria-hidden="true" />
          </button>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !editor) return;
          const reader = new FileReader();
          reader.onload = () => {
            const src = String(reader.result ?? "");
            if (!src) return;
            editor.chain().focus().setImage({ src }).run();
          };
          reader.readAsDataURL(file);
          e.currentTarget.value = "";
        }}
      />

      <div className={styles.editor} aria-label="Message body">
        <EditorContent editor={editor} />
      </div>

      {picker !== null && (
        <div
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={picker === "font" ? "Choose font" : "Choose size"}
          onPointerDown={(e) => {
            // Prevent taps from reaching the toolbar/editor behind the sheet.
            e.preventDefault();
            e.stopPropagation();
            if (e.target === e.currentTarget) setPicker(null);
          }}
        >
          <div
            className={styles.sheet}
            role="document"
            onPointerDown={(e) => {
              // Keep overlay from treating taps inside as outside.
              e.stopPropagation();
            }}
          >
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>
                {picker === "font" ? "Font" : picker === "size" ? "Size" : "More"}
              </div>
            </div>

            <div className={styles.sheetBody}>
              {picker === "font" ? (
                <>
                  <button
                    type="button"
                    className={`${styles.sheetItem} ${fontFamilyValue === "" ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      // Keep the overlay until pointer-up to avoid click-through.
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().unsetFontFamily().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemText}>Default</span>
                  </button>
                  {FONT_FAMILIES.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={`${styles.sheetItem} ${fontFamilyValue === f.value ? styles.sheetItemActive : ""}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        editor?.chain().focus().setFontFamily(f.value).run();
                        setPicker(null);
                      }}
                    >
                      <span className={styles.sheetItemText} style={{ fontFamily: f.value }}>
                        {f.label}
                      </span>
                    </button>
                  ))}
                </>
              ) : picker === "size" ? (
                <>
                  <button
                    type="button"
                    className={`${styles.sheetItem} ${fontSizeValue === "" ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().unsetFontSize().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemText}>Default</span>
                  </button>
                  {FONT_SIZES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`${styles.sheetItem} ${fontSizeValue === s.value ? styles.sheetItemActive : ""}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        editor?.chain().focus().setFontSize(s.value).run();
                        setPicker(null);
                      }}
                    >
                      <span className={styles.sheetItemText}>{s.label}</span>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("bold") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().toggleBold().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <Bold className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Bold</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("italic") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().toggleItalic().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <Italic className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Italic</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("underline") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().toggleUnderline().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <UnderlineIcon className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Underline</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("strike") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().toggleStrike().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <Strikethrough className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Strikethrough</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("bulletList") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().toggleBulletList().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <List className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Bullet list</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("orderedList") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().toggleOrderedList().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <ListOrdered className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Numbered list</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("blockquote") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().toggleBlockquote().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <Quote className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Quote</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${editor?.isActive("link") ? styles.sheetItemActive : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!editor) return;
                      const prev = editor.getAttributes("link").href as string | undefined;
                      const href = window.prompt("Enter link URL", prev ?? "");
                      if (!href) return;
                      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <Link2 className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Insert link</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().unsetLink().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <Link2Off className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Remove link</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={styles.sheetItem}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPicker(null);
                      window.requestAnimationFrame(() => imageInputRef.current?.click());
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <ImagePlus className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Insert image</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={styles.sheetItem}
                    disabled={!canRedo}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().redo().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <Redo2 className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Redo</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      editor?.chain().focus().clearNodes().unsetAllMarks().run();
                      setPicker(null);
                    }}
                  >
                    <span className={styles.sheetItemRow}>
                      <XCircle className={styles.sheetItemIcon} aria-hidden="true" />
                      <span className={styles.sheetItemText}>Clear formatting</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
