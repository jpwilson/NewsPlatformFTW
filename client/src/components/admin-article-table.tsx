import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatDate } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Save, XCircle, ThumbsUp, ThumbsDown } from "lucide-react"; // Icons

// Type matching the data structure returned by GET /admin-articles
interface AdminArticle {
  id: number;
  title: string;
  created_at: string;
  view_count: number | null;
  like_count: number | null;
  dislike_count: number | null;
  channels: { name: string } | null;
}

// Type for the data sent in the PATCH request
interface UpdateArticlePayload {
  view_count?: number;
  like_count?: number;
  dislike_count?: number;
}

export function AdminArticleTable() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<UpdateArticlePayload>({});

  // --- Fetching Articles ---
  const {
    data: articles,
    isLoading,
    error,
  } = useQuery<AdminArticle[], Error>({
    // Specify Error type
    queryKey: ["adminArticles"],
    queryFn: async () => {
      // Use apiRequest which handles auth and base URL via proxy
      const response = await apiRequest("GET", "/api/admin-articles");
      return await response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // --- Updating Article Metrics ---
  const mutation = useMutation<
    AdminArticle,
    Error,
    { id: number; payload: UpdateArticlePayload }
  >({
    mutationFn: async ({ id, payload }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin-articles/${id}`,
        payload
      );
      return await response.json();
    },
    onSuccess: (updatedArticle) => {
      queryClient.setQueryData<AdminArticle[]>(["adminArticles"], (oldData) =>
        oldData?.map((article) =>
          article.id === updatedArticle.id
            ? {
                ...article,
                view_count: updatedArticle.view_count,
                like_count: updatedArticle.like_count,
                dislike_count: updatedArticle.dislike_count,
              }
            : article
        )
      );

      // Invalidate article queries to update counts everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${updatedArticle.id}`],
      });

      toast({
        title: "Success",
        description: `Article "${updatedArticle.title}" metrics updated.`,
      });
      setEditingRowId(null);
    },
    onError: (error, variables) => {
      console.error("Error updating article:", error);
      toast({
        title: "Error Updating Article",
        description: error.message || "An unknown error occurred.",
        variant: "destructive",
      });
    },
  });

  // --- Event Handlers ---
  const handleEditClick = (article: AdminArticle) => {
    setEditingRowId(article.id);
    setEditFormData({
      view_count: article.view_count ?? 0,
      like_count: article.like_count ?? 0,
      dislike_count: article.dislike_count ?? 0,
    });
  };

  const handleCancelClick = () => {
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleSaveClick = (id: number) => {
    const payload: UpdateArticlePayload = {
      view_count: Math.max(0, editFormData.view_count ?? 0),
      like_count: Math.max(0, editFormData.like_count ?? 0),
      dislike_count: Math.max(0, editFormData.dislike_count ?? 0),
    };
    mutation.mutate({ id, payload });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericValue = value === "" ? 0 : parseInt(value, 10);
    setEditFormData((prev) => ({
      ...prev,
      [name]: isNaN(numericValue) ? 0 : numericValue,
    }));
  };

  // --- Render Logic ---
  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 p-4">
        Error loading articles: {error.message}
      </div>
    );
  }

  if (!articles || articles.length === 0) {
    return <div className="p-4 text-muted-foreground">No articles found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="text-right">
              <ThumbsUp className="inline h-4 w-4 mr-1" />
              Likes
            </TableHead>
            <TableHead className="text-right">
              <ThumbsDown className="inline h-4 w-4 mr-1" />
              Dislikes
            </TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {articles.map((article) => (
            <TableRow key={article.id}>
              <TableCell
                className="font-medium max-w-xs truncate"
                title={article.title}
              >
                {article.title}
              </TableCell>
              <TableCell>{article.channels?.name ?? "N/A"}</TableCell>
              <TableCell>{formatDate(article.created_at)}</TableCell>

              {/* Editable Cells */}
              {editingRowId === article.id ? (
                <>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      name="view_count"
                      value={editFormData.view_count ?? ""}
                      onChange={handleInputChange}
                      className="h-8 text-right w-20"
                      min="0"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      name="like_count"
                      value={editFormData.like_count ?? ""}
                      onChange={handleInputChange}
                      className="h-8 text-right w-20"
                      min="0"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      name="dislike_count"
                      value={editFormData.dislike_count ?? ""}
                      onChange={handleInputChange}
                      className="h-8 text-right w-20"
                      min="0"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSaveClick(article.id)}
                        disabled={mutation.isPending}
                        title="Save changes"
                      >
                        {mutation.isPending &&
                        mutation.variables?.id === article.id ? (
                          <LoadingSpinner size={16} />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCancelClick}
                        disabled={mutation.isPending}
                        title="Cancel edit"
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className="text-right">
                    {article.view_count ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {article.like_count ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {article.dislike_count ?? 0}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(article)}
                      title="Edit metrics"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
