import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Underline as UnderlineIcon,
  AlignLeft,
  Code,
  Quote,
  MinusSquare,
} from "lucide-react";

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  // Function to handle link addition
  const addLink = () => {
    const url = window.prompt("Enter URL");

    // Check if the URL is valid
    if (url && url.startsWith("http")) {
      // Set the link on the selected text
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    } else if (url) {
      // If URL doesn't start with http/https, add https prefix
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: `https://${url}` })
        .run();
    }
  };

  return (
    <div className="sticky top-0 z-10 border border-input bg-background rounded-md p-1 mb-2 flex flex-wrap gap-1">
      <Button
        variant={
          editor.isActive("heading", { level: 1 }) ? "default" : "outline"
        }
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </Button>

      <Button
        variant={
          editor.isActive("heading", { level: 2 }) ? "default" : "outline"
        }
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </Button>

      <Button
        variant={
          editor.isActive("heading", { level: 3 }) ? "default" : "outline"
        }
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1 self-center" />

      <Button
        variant={editor.isActive("bold") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>

      <Button
        variant={editor.isActive("italic") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>

      <Button
        variant={editor.isActive("underline") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <UnderlineIcon className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1 self-center" />

      <Button
        variant={editor.isActive("bulletList") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </Button>

      <Button
        variant={editor.isActive("orderedList") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1 self-center" />

      <Button
        variant={editor.isActive("blockquote") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </Button>

      <Button
        variant={editor.isActive("codeBlock") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code Block"
      >
        <Code className="h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <MinusSquare className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1 self-center" />

      <Button
        variant={editor.isActive("link") ? "default" : "outline"}
        size="icon"
        onClick={addLink}
        title="Add Link"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

// Add this utility function before the RichTextEditor component
const isPlainText = (content: string): boolean => {
  // Check if content has any HTML tags
  return !/<[a-z][\s\S]*>/i.test(content);
};

const convertPlainTextToHtml = (plainText: string): string => {
  if (!plainText) return "";

  // Split on double newlines (paragraphs)
  const paragraphs = plainText.split(/\n\s*\n/);

  // Wrap each paragraph in <p> tags and join
  return paragraphs
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export const RichTextEditor = ({
  content,
  onChange,
  placeholder = "Write your article content here...",
}: RichTextEditorProps) => {
  // Check if content is plain text and convert if needed
  const initialContent = isPlainText(content)
    ? convertPlainTextToHtml(content)
    : content;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      Underline,
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[500px] p-4",
      },
    },
  });

  return (
    <div className="border border-input rounded-md bg-background overflow-hidden flex flex-col">
      <MenuBar editor={editor} />
      <EditorContent
        editor={editor}
        className="prose dark:prose-invert max-w-none overflow-y-auto"
      />
    </div>
  );
};
