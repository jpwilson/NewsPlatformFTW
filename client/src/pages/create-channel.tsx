import { useForm } from "react-hook-form";
import { insertChannelSchema, type InsertChannel } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { NavigationBar } from "@/components/navigation-bar";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Channel } from "@shared/schema";
import { useEffect } from "react";

export default function CreateChannel() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Fetch user's existing channels to check against limit
  const { data: userChannels, refetch: refetchUserChannels } = useQuery<
    Channel[]
  >({
    queryKey: ["/api/channels"],
    select: (channels) => {
      console.log("All channels:", channels);
      const filteredChannels = channels.filter((c) => {
        const matches = c.userId === user?.id || c.user_id === user?.id;
        return matches;
      });
      console.log(
        `Found ${filteredChannels.length} channels for user:`,
        filteredChannels
      );
      return filteredChannels;
    },
    enabled: !!user,
    // Use shorter stale time to ensure we get fresh data
    staleTime: 0,
  });

  // Force refetch on component mount to ensure fresh data
  useEffect(() => {
    if (user) {
      console.log("Refetching channels for user:", user.id);
      refetchUserChannels();
    }
  }, [user, refetchUserChannels]);

  const remainingChannels = userChannels ? 10 - userChannels.length : 10;
  const isAtLimit = remainingChannels <= 0;

  const form = useForm<InsertChannel>({
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createChannelMutation = useMutation({
    mutationFn: async (data: InsertChannel) => {
      console.log("Making API request with data:", data);
      const response = await apiRequest("POST", "/api/channels", data);
      if (!response.ok) {
        const error = await response.json();
        console.error("API error:", error);
        throw new Error(error.message || "Failed to create channel");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      console.log("Channel created successfully:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({
        title: "Channel created!",
        description: "Your channel has been created successfully.",
      });
      // Redirect to the newly created channel's profile page
      if (data && data.id) {
        window.location.href = `/channels/${data.id}`;
      } else {
        console.error("No channel ID received, falling back to channels page");
        window.location.href = "/channels";
      }
    },
    onError: (error: Error) => {
      console.error("Creation failed:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: InsertChannel) => {
    try {
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to create a channel",
          variant: "destructive",
        });
        return;
      }

      const channelData = {
        ...data,
        userId: user.id,
      };

      console.log("Submitting channel data:", channelData);
      await createChannelMutation.mutateAsync(channelData);
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />

      <div className="container mx-auto p-4 lg:p-8 max-w-2xl">
        <h1 className="text-4xl font-bold mb-8">Create Channel</h1>

        <div className="text-center text-muted-foreground">
          {isAtLimit ? (
            <p className="text-red-500">
              You have reached the maximum limit of 10 channels.
            </p>
          ) : (
            <p>
              You can create {remainingChannels} more{" "}
              {remainingChannels === 1 ? "channel" : "channels"} (limit: 10).
            </p>
          )}
        </div>

        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit(onSubmit)(e);
            }}
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={createChannelMutation.isPending || isAtLimit}
            >
              {createChannelMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Channel"
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
