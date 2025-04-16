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
import { Pencil, Save, XCircle, Users } from "lucide-react"; // Icons

// Type matching the data structure returned by GET /admin-channels
interface AdminChannel {
  id: number;
  name: string;
  description: string;
  created_at: string;
  real_subscriber_count: number;
  subscriber_count: number;
  admin_subscriber_count: number;
  user_id: string;
}

// Type for the data sent in the PATCH request
interface UpdateChannelPayload {
  subscriber_count: number;
}

export function AdminChannelTable() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<UpdateChannelPayload>({
    subscriber_count: 0,
  });

  // --- Fetching Channels ---
  const {
    data: channels,
    isLoading,
    error,
  } = useQuery<AdminChannel[], Error>({
    queryKey: ["adminChannels"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin-channels");
      return await response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // --- Updating Channel Subscriber Count ---
  const mutation = useMutation<
    AdminChannel,
    Error,
    { id: number; payload: UpdateChannelPayload }
  >({
    mutationFn: async ({ id, payload }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin-channels/${id}`,
        payload
      );
      return await response.json();
    },
    onSuccess: (updatedChannel) => {
      queryClient.setQueryData<AdminChannel[]>(["adminChannels"], (oldData) =>
        oldData?.map((channel) =>
          channel.id === updatedChannel.id
            ? {
                ...channel,
                subscriber_count: updatedChannel.subscriber_count,
                admin_subscriber_count: updatedChannel.admin_subscriber_count,
              }
            : channel
        )
      );

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/channels/${updatedChannel.id}`],
      });

      toast({
        title: "Success",
        description: `Channel "${updatedChannel.name}" subscriber count updated.`,
      });
      setEditingRowId(null);
    },
    onError: (error, variables) => {
      console.error("Error updating channel:", error);
      toast({
        title: "Error Updating Channel",
        description: error.message || "An unknown error occurred.",
        variant: "destructive",
      });
    },
  });

  // --- Event Handlers ---
  const handleEditClick = (channel: AdminChannel) => {
    setEditingRowId(channel.id);
    setEditFormData({
      subscriber_count: channel.subscriber_count,
    });
  };

  const handleCancelClick = () => {
    setEditingRowId(null);
    setEditFormData({ subscriber_count: 0 });
  };

  const handleSaveClick = (id: number) => {
    const payload: UpdateChannelPayload = {
      subscriber_count: Math.max(0, editFormData.subscriber_count),
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
        Error loading channels: {error.message}
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return <div className="p-4 text-muted-foreground">No channels found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">
              <Users className="inline h-4 w-4 mr-1" />
              Real Subs
            </TableHead>
            <TableHead className="text-right">
              <Users className="inline h-4 w-4 mr-1" />
              Total Subs
            </TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((channel) => (
            <TableRow key={channel.id}>
              <TableCell
                className="font-medium max-w-xs truncate"
                title={channel.name}
              >
                {channel.name}
              </TableCell>
              <TableCell
                className="max-w-sm truncate"
                title={channel.description}
              >
                {channel.description || "No description"}
              </TableCell>
              <TableCell>{formatDate(channel.created_at)}</TableCell>
              <TableCell className="text-right">
                {channel.real_subscriber_count}
              </TableCell>

              {/* Editable Cell */}
              {editingRowId === channel.id ? (
                <TableCell className="text-right">
                  <Input
                    type="number"
                    name="subscriber_count"
                    value={editFormData.subscriber_count}
                    onChange={handleInputChange}
                    className="h-8 text-right w-20"
                    min="0"
                  />
                </TableCell>
              ) : (
                <TableCell className="text-right">
                  {channel.subscriber_count}
                </TableCell>
              )}

              <TableCell className="text-center">
                <div className="flex justify-center gap-2">
                  {editingRowId === channel.id ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSaveClick(channel.id)}
                        disabled={mutation.isPending}
                        title="Save changes"
                      >
                        {mutation.isPending &&
                        mutation.variables?.id === channel.id ? (
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
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(channel)}
                      title="Edit subscriber count"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
