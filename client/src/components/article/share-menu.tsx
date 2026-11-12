import type { ReactNode } from "react";
import { Link2, Share2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

/** Copy link + native share sheet, for the byline and the end of the article. */
export function ShareMenu({
  title,
  text,
  trigger,
  align = "end",
}: {
  title: string;
  text?: string;
  /** The button that opens the menu (must forward refs, e.g. a <button>). */
  trigger: ReactNode;
  align?: "start" | "end";
}) {
  const { toast } = useToast();
  const url = () => window.location.href.split("?")[0].split("#")[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      toast({ title: "Link copied", description: "Paste it anywhere to share this story." });
    } catch {
      toast({
        title: "Could not copy the link",
        description: "Copy it from the address bar instead.",
        variant: "destructive",
      });
    }
  };

  const share = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title, text: text || title, url: url() });
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        toast({ title: "Sharing failed", description: "Please try again.", variant: "destructive" });
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[11rem]">
        <DropdownMenuItem onClick={copy}>
          <Link2 className="mr-2 h-4 w-4" />
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={share}>
          <Share2 className="mr-2 h-4 w-4" />
          Share via…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
