import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, User } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { z } from "zod";

// Type for API response format
interface CommentResponse {
  id: number;
  content: string;
  created_at: string;
  parent_id: number | null;
  user: {
    id: number;
    username: string;
  };
}

interface CommentSectionProps {
  articleId: number;
  onCommentsLoaded?: (count: number) => void;
}

// Define a simple schema for comment validation
const commentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty"),
});
type CommentFormValues = z.infer<typeof commentSchema>;

export function CommentSection({
  articleId,
  onCommentsLoaded,
}: CommentSectionProps) {
  const { user } = useAuth();
  const [replyToId, setReplyToId] = useState<number | null>(null);

  // Query for comments with the correct response type
  const { data: comments, isLoading } = useQuery<CommentResponse[]>({
    queryKey: [`/api/articles/${articleId}/comments`],
  });

  // Send the comment count to the parent component when comments are loaded
  useEffect(() => {
    if (comments && onCommentsLoaded) {
      onCommentsLoaded(comments.length);
    }
  }, [comments, onCommentsLoaded]);

  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: "",
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (data: CommentFormValues) => {
      if (!user) {
        throw new Error("You must be logged in to post a comment");
      }

      console.log("Attempting to post comment:", {
        content: data.content,
        parent_id: replyToId,
        articleId: articleId,
      });

      try {
        const res = await apiRequest(
          "POST",
          `/api/articles/${articleId}/comments`,
          {
            content: data.content,
            parent_id: replyToId,
          }
        );

        console.log("Comment post response:", res.status, res.statusText);

        if (!res.ok) {
          const errorData = await res.json();
          console.error("Error response from server:", errorData);
          throw new Error(errorData.error || "Failed to post comment");
        }

        return await res.json();
      } catch (err) {
        console.error("Exception during comment post:", err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${articleId}/comments`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${articleId}`],
      });
      queryClient.invalidateQueries({ queryKey: [`/api/articles`] });
      form.reset();
      setReplyToId(null);
    },
    onError: (error: Error) => {
      console.error("Error posting comment:", error);
      // Using window.alert for immediate feedback since we don't have access to the toast component
      window.alert(error.message || "Failed to post comment");
    },
  });

  // Helper function to handle form submission
  const handleSubmit = (data: CommentFormValues) => {
    // Check if user is authenticated
    if (!user) {
      window.alert("You must be logged in to post a comment");
      return;
    }

    // Submit the comment
    commentMutation.mutate(data);
  };

  function CommentComponent({ comment }: { comment: CommentResponse }) {
    const isReply = comment.parent_id !== null;

    // Format relative time (e.g., "5 minutes ago")
    function formatTimeAgo(dateString: string) {
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffInSeconds < 60) {
        return diffInSeconds <= 1 ? "just now" : `${diffInSeconds} seconds ago`;
      }

      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) {
        return diffInMinutes === 1
          ? "1 minute ago"
          : `${diffInMinutes} minutes ago`;
      }

      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) {
        return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
      }

      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays < 7) {
        return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`;
      }

      const diffInWeeks = Math.floor(diffInDays / 7);
      if (diffInWeeks < 4) {
        return diffInWeeks === 1 ? "1 week ago" : `${diffInWeeks} weeks ago`;
      }

      const diffInMonths = Math.floor(diffInDays / 30);
      if (diffInMonths < 12) {
        return diffInMonths === 1
          ? "1 month ago"
          : `${diffInMonths} months ago`;
      }

      const diffInYears = Math.floor(diffInDays / 365);
      return diffInYears === 1 ? "1 year ago" : `${diffInYears} years ago`;
    }

    // Format absolute date (e.g., "Mar 15, 2023, 2:30 PM")
    const formattedDate = comment.created_at
      ? new Date(comment.created_at).toLocaleString()
      : "Unknown date";

    return (
      <div
        className={`${
          isReply ? "ml-8 mt-4" : "mt-6"
        } border-l-2 pl-4 border-slate-200 dark:border-slate-700`}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center text-sm font-medium">
                <User className="h-4 w-4 mr-1 text-slate-400" />
                {comment.user?.username || "Anonymous"}
              </div>
              <span className="text-sm text-muted-foreground">•</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="cursor-default">
                    <span className="text-sm text-muted-foreground">
                      {formatTimeAgo(comment.created_at)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{formattedDate}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm">{comment.content}</p>
            {user && !isReply && (
              <Button
                variant="link"
                size="sm"
                className="px-0 text-muted-foreground"
                onClick={() => setReplyToId(comment.id)}
              >
                Reply
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const parentComments = comments?.filter((c) => !c.parent_id) || [];
  const childComments = comments?.filter((c) => c.parent_id) || [];

  return (
    <div id="comments">
      <h2 className="text-2xl font-semibold mb-6">
        Comments ({comments?.length || 0})
      </h2>

      {user && (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4 mb-8"
          >
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea placeholder="Write a comment..." {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex items-center gap-4">
              <Button type="submit" disabled={commentMutation.isPending}>
                Post Comment
              </Button>
              {replyToId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setReplyToId(null)}
                >
                  Cancel Reply
                </Button>
              )}
            </div>
          </form>
        </Form>
      )}

      <div className="space-y-6">
        {parentComments.map((comment) => (
          <div key={comment.id}>
            <CommentComponent comment={comment} />
            {childComments
              .filter((c) => c.parent_id === comment.id)
              .map((reply) => (
                <CommentComponent key={reply.id} comment={reply} />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
