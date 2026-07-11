import React, { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { mergeAttributes } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Underline as UnderlineIcon,
  Code,
  Quote,
  MinusSquare,
  Table as TableIcon,
  Image as ImageIcon,
  Images,
  Film,
  BarChart3,
  Lightbulb,
  TextQuote,
  TrendingUp,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  ArticleFigure,
  ArticleGallery,
  VideoEmbed,
  ArticleChartNode,
  Callout,
  PullQuote,
  StatCallout,
  CALLOUT_TYPES,
  videoEmbedSrc,
} from "@/components/editor-extensions";

/* ------------------------- Supabase image upload ------------------------- */

async function uploadEditorImage(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `editor_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { data: uploadData, error } = await supabase.storage
    .from("article-images")
    .upload(filename, file);
  if (error || !uploadData) throw error || new Error("Upload failed");
  const { data: urlData } = await supabase.storage
    .from("article-images")
    .createSignedUrl(uploadData.path, 31536000); // 1 year
  if (urlData?.signedUrl) return urlData.signedUrl;
  const {
    data: { publicUrl },
  } = supabase.storage.from("article-images").getPublicUrl(uploadData.path);
  return publicUrl;
}

/* ----------------------- Table with reader-parity HTML ---------------------- */

const WrappedTable = Table.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "table-wrap" },
      [
        "table",
        mergeAttributes(HTMLAttributes, { class: "article-table" }),
        ["tbody", 0],
      ],
    ];
  },
}).configure({ resizable: false });

/* --------------------------------- Toolbar --------------------------------- */

const Divider = () => <div className="w-px h-6 bg-border mx-1 self-center" />;

const MenuBar = ({ editor }: { editor: any }) => {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [statOpen, setStatOpen] = useState(false);
  const [statFigure, setStatFigure] = useState("");
  const [statCaption, setStatCaption] = useState("");
  const [chartOpen, setChartOpen] = useState(false);
  const [chartType, setChartType] = useState<"bar" | "line" | "area" | "pie">(
    "bar"
  );
  const [chartTitle, setChartTitle] = useState("");
  const [chartLabels, setChartLabels] = useState("");
  const [chartSeriesName, setChartSeriesName] = useState("");
  const [chartSeriesData, setChartSeriesData] = useState("");
  const [chartSource, setChartSource] = useState("");

  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt("Enter URL");
    if (!url) return;
    const href = url.startsWith("http") ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const insertImages = async (files: FileList | null, asGallery: boolean) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await uploadEditorImage(file));
      }
      const figures = urls.map((src) => ({
        type: "articleFigure",
        attrs: { src, alt: "" },
        content: [],
      }));
      if (asGallery && figures.length >= 2) {
        editor
          .chain()
          .focus()
          .insertContent({ type: "articleGallery", content: figures })
          .run();
      } else {
        editor.chain().focus().insertContent(figures).run();
      }
      toast({
        title: `${urls.length} image${urls.length > 1 ? "s" : ""} added`,
        description: "Click below an image to write its caption.",
      });
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: e?.message || "Could not upload image",
        variant: "destructive",
      });
    }
    setUploading(false);
  };

  const insertVideo = () => {
    const src = videoEmbedSrc(videoUrl.trim());
    if (!src) {
      toast({
        title: "Unsupported video URL",
        description: "Paste a YouTube or Vimeo link.",
        variant: "destructive",
      });
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: "videoEmbed", attrs: { src } })
      .run();
    setVideoUrl("");
    setVideoOpen(false);
  };

  const insertStat = () => {
    if (!statFigure.trim()) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "statCallout",
        attrs: { figure: statFigure.trim(), caption: statCaption.trim() },
      })
      .run();
    setStatFigure("");
    setStatCaption("");
    setStatOpen(false);
  };

  const insertChart = () => {
    const labels = chartLabels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const data = chartSeriesData
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    if (labels.length < 2 || data.length !== labels.length) {
      toast({
        title: "Check the chart data",
        description:
          "Provide 2+ labels, and the same number of values as labels.",
        variant: "destructive",
      });
      return;
    }
    const spec = {
      type: chartType,
      ...(chartTitle.trim() ? { title: chartTitle.trim() } : {}),
      labels,
      series: [{ name: chartSeriesName.trim() || "Series", data }],
      ...(chartSource.trim() ? { source: chartSource.trim() } : {}),
    };
    editor
      .chain()
      .focus()
      .insertContent({
        type: "articleChart",
        attrs: { spec: JSON.stringify(spec) },
      })
      .run();
    setChartOpen(false);
    setChartTitle("");
    setChartLabels("");
    setChartSeriesName("");
    setChartSeriesData("");
    setChartSource("");
  };

  const insertCallout = (type: string) => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "callout",
        attrs: { calloutType: type },
        content: [{ type: "paragraph" }],
      })
      .run();
  };

  const insertPullQuote = () => {
    const selection = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " "
    );
    const attribution = window.prompt("Attribution (optional)") || "";
    editor
      .chain()
      .focus()
      .insertContent({
        type: "pullQuote",
        attrs: { attribution },
        content: selection ? [{ type: "text", text: selection }] : [],
      })
      .run();
  };

  return (
    <div className="sticky top-0 z-10 border border-input bg-background rounded-md p-1 mb-2 flex flex-wrap gap-1">
      {/* Text structure */}
      <Button
        variant={editor.isActive("heading", { level: 2 }) ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Section heading"
      >
        <Heading2 className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive("heading", { level: 3 }) ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Sub-heading"
      >
        <Heading3 className="h-4 w-4" />
      </Button>

      <Divider />

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
      <Button
        variant={editor.isActive("link") ? "default" : "outline"}
        size="icon"
        onClick={addLink}
        title="Add link"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>

      <Divider />

      <Button
        variant={editor.isActive("bulletList") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive("orderedList") ? "default" : "outline"}
        size="icon"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
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
        title="Code block"
      >
        <Code className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
      >
        <MinusSquare className="h-4 w-4" />
      </Button>

      <Divider />

      {/* Media */}
      <Button
        variant="outline"
        size="icon"
        disabled={uploading}
        onClick={() => imageInputRef.current?.click()}
        title="Image (with caption)"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        disabled={uploading}
        onClick={() => galleryInputRef.current?.click()}
        title="Gallery (choose 2+ images — readers get a lightbox)"
      >
        <Images className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setVideoOpen(true)}
        title="Video (YouTube / Vimeo)"
      >
        <Film className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setChartOpen(true)}
        title="Chart"
      >
        <BarChart3 className="h-4 w-4" />
      </Button>

      <Divider />

      {/* Editorial blocks */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={editor.isActive("callout") ? "default" : "outline"}
            size="sm"
            className="gap-1 px-2"
            title="Callout box"
          >
            <Lightbulb className="h-4 w-4" />
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Insert callout</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CALLOUT_TYPES.map((c) => (
            <DropdownMenuItem key={c.value} onClick={() => insertCallout(c.value)}>
              {c.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant={editor.isActive("pullQuote") ? "default" : "outline"}
        size="icon"
        onClick={insertPullQuote}
        title="Pull quote (uses selected text)"
      >
        <TextQuote className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setStatOpen(true)}
        title="Big stat"
      >
        <TrendingUp className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive("table") ? "default" : "outline"}
        size="icon"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        title="Table"
      >
        <TableIcon className="h-4 w-4" />
      </Button>
      {editor.isActive("table") && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 px-2">
              Table
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
              Add row below
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
              Add column right
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
              Delete row
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
              Delete column
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              Delete table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => insertImages(e.target.files, false)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => insertImages(e.target.files, true)}
      />

      {/* Video dialog */}
      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Embed a video</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="video-url">YouTube or Vimeo URL</Label>
            <Input
              id="video-url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && insertVideo()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoOpen(false)}>
              Cancel
            </Button>
            <Button onClick={insertVideo}>Embed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stat dialog */}
      <Dialog open={statOpen} onOpenChange={setStatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Big stat</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="stat-figure">The number</Label>
              <Input
                id="stat-figure"
                placeholder="68%"
                value={statFigure}
                onChange={(e) => setStatFigure(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stat-caption">What it means</Label>
              <Input
                id="stat-caption"
                placeholder="of readers couldn't tell the difference…"
                value={statCaption}
                onChange={(e) => setStatCaption(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatOpen(false)}>
              Cancel
            </Button>
            <Button onClick={insertStat}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chart dialog */}
      <Dialog open={chartOpen} onOpenChange={setChartOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Insert a chart</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as any)}
                >
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                  <option value="pie">Pie</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chart-title">Title (optional)</Label>
                <Input
                  id="chart-title"
                  value={chartTitle}
                  onChange={(e) => setChartTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chart-labels">Labels (comma-separated)</Label>
              <Input
                id="chart-labels"
                placeholder="2023, 2024, 2025, 2026"
                value={chartLabels}
                onChange={(e) => setChartLabels(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <div className="space-y-2">
                <Label htmlFor="chart-series-name">Series name</Label>
                <Input
                  id="chart-series-name"
                  placeholder="Countries"
                  value={chartSeriesName}
                  onChange={(e) => setChartSeriesName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chart-series-data">
                  Values (one per label)
                </Label>
                <Input
                  id="chart-series-data"
                  placeholder="0, 1, 3, 7"
                  value={chartSeriesData}
                  onChange={(e) => setChartSeriesData(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chart-source">Source (strongly encouraged)</Label>
              <Input
                id="chart-source"
                placeholder="European Digital Policy Tracker, 2026"
                value={chartSource}
                onChange={(e) => setChartSource(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChartOpen(false)}>
              Cancel
            </Button>
            <Button onClick={insertChart}>Insert chart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ---------------------------------- Editor --------------------------------- */

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const isPlainText = (content: string): boolean =>
  !/<[a-z][\s\S]*>/i.test(content);

const convertPlainTextToHtml = (plainText: string): string => {
  if (!plainText) return "";
  return plainText
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export const RichTextEditor = ({
  content,
  onChange,
}: RichTextEditorProps) => {
  const initialContent = isPlainText(content)
    ? convertPlainTextToHtml(content)
    : content;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      Underline,
      WrappedTable,
      TableRow,
      TableHeader,
      TableCell,
      ArticleFigure,
      ArticleGallery,
      VideoEmbed,
      ArticleChartNode,
      Callout,
      PullQuote,
      StatCallout,
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
      {/* article-body = the SAME classes the reader uses → true WYSIWYG */}
      <EditorContent
        editor={editor}
        className="article-body prose dark:prose-invert max-w-none overflow-y-auto"
      />
    </div>
  );
};
