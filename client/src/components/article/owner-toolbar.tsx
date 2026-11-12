import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Edit, ExternalLink, FileDown, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Owner-only strip above the kicker: Draft badge, Edit, Publish / Move to Drafts, Delete. */
export function OwnerToolbar({
  articleId,
  isDraft,
  onEdit,
}: {
  articleId: string;
  isDraft: boolean;
  onEdit: () => void;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const togglePublish = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/articles/${articleId}/toggle-status`);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/articles/${articleId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({
        title: `Article ${data.published ? "published" : "moved to drafts"}`,
        description: `The article has been ${data.published ? "published" : "moved to your drafts"}.`,
      });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to change article status.", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/articles/${articleId}`);
      if (response.status === 204) return null;
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setLocation("/");
      toast({ title: "Article deleted", description: "The article has been deleted." });
    },
    onError: (error: Error) =>
      toast({
        title: "Error",
        description: error.message || "Failed to delete the article.",
        variant: "destructive",
      }),
  });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {isDraft && (
        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900 dark:text-amber-100">
          Draft
        </span>
      )}
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Edit className="mr-2 h-4 w-4" />
        Edit
      </Button>
      <Button
        variant={isDraft ? "default" : "outline"}
        size="sm"
        onClick={() => togglePublish.mutate()}
        disabled={togglePublish.isPending}
      >
        {togglePublish.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : isDraft ? (
          <ExternalLink className="mr-2 h-4 w-4" />
        ) : (
          <FileDown className="mr-2 h-4 w-4" />
        )}
        {isDraft ? "Publish" : "Move to Drafts"}
      </Button>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this article? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false);
                remove.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
