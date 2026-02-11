import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage-supabase";
import { insertArticleSchema, insertCommentSchema, User } from "@shared/schema";
import { z } from "zod";
import { supabase } from "./supabase";
import passport from "passport";
import { isDev } from "./constants";
import { generateApiKey, hashApiKey, authenticateApiKey } from "./api-auth";
import { normalizeContent } from "./markdown-to-html";
import { downloadAndUploadImage } from "./image-downloader";

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
    }
  }
}

// Update the channel schema for creation (separate from the full channel schema)
const insertChannelSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  location: z.string().optional(),
  bannerImage: z.string().optional(),
  profileImage: z.string().optional(),
  // Note: No 'id' required here since it will be auto-generated
});

export async function registerRoutes(app: Express): Promise<void> {
  setupAuth(app);

  // Channels
  app.post("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Parse and validate the incoming data with the insert schema
      const channelData = insertChannelSchema.parse(req.body);
      
      // Check if user has reached the maximum number of channels (10)
      const { data: existingChannels, error: countError } = await supabase
        .from("channels")
        .select("id")
        .eq("user_id", req.user.id);
      
      if (countError) throw countError;
      
      if (existingChannels && existingChannels.length >= 10) {
        return res.status(400).json({ 
          message: "Maximum limit reached. You cannot create more than 10 channels."
        });
      }
      
      console.log("Received channel data:", {
        ...channelData,
        userId: req.user.id
      });
      
      // Generate a slug from the channel name
      let slug = channelData.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Insert the channel with created_at timestamp and slug
      const { data: channel, error } = await supabase
        .from("channels")
        .insert([{
          ...channelData,
          user_id: req.user.id,
          created_at: new Date().toISOString(),
          slug: slug
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(channel);
    } catch (error) {
      console.error("Channel creation error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: JSON.stringify(error.errors, null, 2) });
      }
      
      res.status(500).json({ message: "Failed to create channel" });
    }
  });

  app.get("/api/channels", async (req, res) => {
    try {
      // Fetch all channels first using storage
      const channels = await storage.listChannels();
      
      // Enrich each channel with subscriber count and article count
      const enrichedChannels = await Promise.all(channels.map(async (channel) => {
        // Get subscriber count
        const { count: subscriberCount, error: countError } = await supabase
          .from("subscriptions")
          .select("*", { count: 'exact', head: true })
          .eq("channel_id", channel.id);
          
        if (countError) {
          console.error(`Error fetching subscriber count for channel ${channel.id}:`, countError);
        }
        
        // Get article count (only published articles)
        const { count: articleCount, error: articleError } = await supabase
          .from("articles")
          .select("*", { count: 'exact', head: true })
          .eq("channel_id", channel.id)
          .eq("status", "published");
          
        if (articleError) {
          console.error(`Error fetching article count for channel ${channel.id}:`, articleError);
        }
        
        return {
          ...channel,
          subscriberCount: subscriberCount || 0,
          articleCount: articleCount || 0
        };
      }));
      
      res.json(enrichedChannels || []);
    } catch (error) {
      console.error("Error fetching channels:", error);
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.get("/api/channels/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log("Channel lookup request for:", id);
      
      let channel;
      let error;
      
      // Check if id is numeric (old format) or a slug (new format)
      if (/^\d+$/.test(id)) {
        console.log("Looking up channel by numeric ID:", id);
        const result = await supabase
          .from("channels")
          .select("*")
          .eq("id", id)
          .single();
          
        channel = result.data;
        error = result.error;
      } else {
        console.log("Looking up channel by slug:", id);
        const result = await supabase
          .from("channels")
          .select("*")
          .eq("slug", id)
          .single();
          
        channel = result.data;
        error = result.error;
        
        // If not found by slug, try extracting ID from slug
        if (!channel && !error) {
          const idMatch = id.match(/-(\d+)$/);
          if (idMatch) {
            const extractedId = idMatch[1];
            console.log("Extracted ID from slug:", extractedId);
            
            const idResult = await supabase
              .from("channels")
              .select("*")
              .eq("id", extractedId)
              .single();
              
            channel = idResult.data;
            error = idResult.error;
          }
        }
      }
      
      if (error) {
        console.error("Error fetching channel:", error);
        throw error;
      }
      
      if (!channel) {
        console.log("Channel not found for slug or ID:", id);
        return res.status(404).json({ error: "Channel not found" });
      }
      
      console.log("Retrieved channel:", channel.id, channel.name);
      
      // Get subscriber count
      const { count: subscriberCount, error: countError } = await supabase
        .from("subscriptions")
        .select("*", { count: 'exact', head: true })
        .eq("channel_id", channel.id);
        
      if (countError) {
        console.error("Error fetching subscriber count:", countError);
      }
      
      // Add subscriber count and transform snake_case to camelCase
      const channelWithCount = {
        ...channel,
        profileImage: channel.profile_image,
        bannerImage: channel.banner_image,
        userId: channel.user_id,
        createdAt: channel.created_at,
        updatedAt: channel.updated_at,
        subscriberCount: subscriberCount || 0
      };

      console.log("GET /api/channels/:id - Response:", {
        id: channelWithCount.id,
        name: channelWithCount.name,
        profile_image: channel.profile_image,
        banner_image: channel.banner_image,
        profileImage: channelWithCount.profileImage,
        bannerImage: channelWithCount.bannerImage,
      });

      res.json(channelWithCount);
    } catch (error) {
      console.error("Error fetching channel:", error);
      res.status(500).json({ error: "Failed to fetch channel" });
    }
  });

  // Update channel endpoint
  app.patch("/api/channels/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { id } = req.params;
      
      // First, check if the user is the owner of the channel
      const { data: channel, error: fetchError } = await supabase
        .from("channels")
        .select("*")
        .eq("id", id)
        .single();
      
      if (fetchError) throw fetchError;
      
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }
      
      // Check ownership
      if (channel.user_id !== req.user.id) {
        return res.status(403).json({ error: "You don't have permission to edit this channel" });
      }
      
      // Update the channel
      const updateData: any = {};

      // Map camelCase to snake_case for database fields
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.category !== undefined) updateData.category = req.body.category;
      if (req.body.profileImage !== undefined) updateData.profile_image = req.body.profileImage;
      if (req.body.bannerImage !== undefined) updateData.banner_image = req.body.bannerImage;

      console.log("PATCH /api/channels/:id - updateData:", JSON.stringify(updateData, null, 2));

      const { data: updatedChannel, error: updateError } = await supabase
        .from("channels")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      console.log("PATCH /api/channels/:id - updatedChannel from DB:", {
        id: updatedChannel.id,
        profile_image: updatedChannel.profile_image,
        banner_image: updatedChannel.banner_image,
      });

      // Transform snake_case to camelCase for the response
      const transformedChannel = {
        ...updatedChannel,
        profileImage: updatedChannel.profile_image,
        bannerImage: updatedChannel.banner_image,
        userId: updatedChannel.user_id,
        createdAt: updatedChannel.created_at,
        updatedAt: updatedChannel.updated_at,
      };

      console.log("PATCH /api/channels/:id - transformedChannel response:", {
        id: transformedChannel.id,
        profileImage: transformedChannel.profileImage,
        bannerImage: transformedChannel.bannerImage,
      });

      res.json(transformedChannel);
    } catch (error) {
      console.error("Error updating channel:", error);
      res.status(500).json({ error: "Failed to update channel" });
    }
  });

  // Fetch articles by channel ID
  app.get("/api/channels/:id/articles", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Fetch articles for this channel that are published
      const { data: articles, error } = await supabase
        .from("articles")
        .select("*")
        .eq("channel_id", id)
        .eq("published", true)  // Only return published articles
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      res.json(articles || []);
    } catch (error) {
      console.error("Error fetching channel articles:", error);
      res.status(500).json({ error: "Failed to fetch channel articles" });
    }
  });

  // Fetch draft articles by channel ID
  app.get("/api/channels/:id/drafts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const channelId = parseInt(req.params.id);
      
      // Check if the user has permission to view drafts for this channel
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("user_id")
        .eq("id", channelId)
        .single();
        
      if (channelError) throw channelError;
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      
      // Only the channel owner can see drafts
      if (channel.user_id !== req.user.id) {
        return res.status(403).json({ error: "You don't have permission to view drafts for this channel" });
      }
      
      // Fetch draft articles for this channel
      const { data: articles, error } = await supabase
        .from("articles")
        .select("*")
        .eq("channel_id", channelId)
        .eq("published", false);  // Only return draft articles
        
      if (error) throw error;
      
      res.json(articles || []);
    } catch (error) {
      console.error("Error fetching channel drafts:", error);
      res.status(500).json({ error: "Failed to fetch channel drafts" });
    }
  });

  // Articles
  // Article creation endpoint moved to api/index.ts
  
  app.get("/api/articles", async (req, res) => {
    try {
      // First, fetch the articles (only published ones)
      const { data: articles, error } = await supabase
        .from("articles")
        .select("*")
        .eq("published", true)  // Only return published articles
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // If we have articles, fetch the related channels
      if (articles && articles.length > 0) {
        // Extract all unique channel IDs
        const channelIds = Array.from(new Set(articles.map(article => article.channel_id)));
        
        // Fetch all relevant channels in a single query
        const { data: channels, error: channelsError } = await supabase
          .from("channels")
          .select("id, name")
          .in("id", channelIds);
          
        if (channelsError) throw channelsError;
        
        // For each article, fetch reaction counts and comment counts
        const enrichedArticles = await Promise.all(articles.map(async article => {
          // Find the channel for this article
          const channel = channels?.find(c => c.id === article.channel_id) || null;
          
          // Get reaction counts
          const { data: reactions, error: reactionsError } = await supabase
            .from("reactions")
            .select("is_like, user_id")
            .eq("article_id", article.id);
            
          let likes = 0;
          let dislikes = 0;
          let userReaction = null;
          
          if (!reactionsError && reactions) {
            likes = reactions.filter(r => r.is_like).length;
            dislikes = reactions.filter(r => !r.is_like).length;
            
            // If user is authenticated, check if they have reacted
            if (req.isAuthenticated()) {
              const userReactionData = reactions.find(r => 
                r.user_id === req.user.id
              );
              
              if (userReactionData) {
                userReaction = userReactionData.is_like;
              }
            }
          }
          
          // Get comment count
          const { data: commentCountData, error: commentCountError } = await supabase
            .from("comments")
            .select("*", { count: "exact", head: true })
            .eq("article_id", article.id);
            
          // Ensure view_count is present, defaulting to 0 if not
          const viewCount = article.view_count || 0;
            
          return {
            ...article,
            channel,
            likes,
            dislikes,
            viewCount,
            userReaction,
            _count: { 
              comments: commentCountError ? 0 : (commentCountData?.length || 0)
            },
            // Add additional comment count fields for backward compatibility
            comment_count: commentCountError ? 0 : (commentCountData?.length || 0),
            commentCount: commentCountError ? 0 : (commentCountData?.length || 0)
          };
        }));
        
        res.json(enrichedArticles);
      } else {
        res.json(articles || []);
      }
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });

  // Comment out this endpoint since we're using the one in api/index.ts
  // app.get("/api/articles/:id", async (req, res) => {
  //   try {
  //     const { id } = req.params;
  //     console.log("Article lookup request for:", id);
      
  //     let article;
  //     let error;
      
  //     // Check if id is numeric (old format) or a slug (new format)
  //     if (/^\d+$/.test(id)) {
  //       // Numeric ID
  //       console.log("Looking up article by numeric ID:", id);
  //       const result = await supabase
  //         .from("articles")
  //         .select("*")
  //         .eq("id", id)
  //         .single();
          
  //       article = result.data;
  //       error = result.error;
  //     } else {
  //       // Slug lookup
  //       console.log("Looking up article by slug:", id);
  //       const result = await supabase
  //         .from("articles")
  //         .select("*")
  //         .eq("slug", id)
  //         .single();
          
  //       article = result.data;
  //       error = result.error;
        
  //       // If not found by slug, try extracting ID from slug
  //       if (!article && !error) {
  //         const idMatch = id.match(/-(\d+)$/);
  //         if (idMatch) {
  //           const extractedId = idMatch[1];
  //           console.log("Extracted ID from slug:", extractedId);
            
  //           const idResult = await supabase
  //             .from("articles")
  //             .select("*")
  //             .eq("id", extractedId)
  //             .single();
              
  //           article = idResult.data;
  //           error = idResult.error;
  //         }
  //       }
  //     }
      
  //     if (error) {
  //       console.error("Error fetching article:", error);
  //       throw error;
  //     }
      
  //     if (!article) {
  //       console.log("Article not found for slug or ID:", id);
  //       return res.status(404).json({ error: "Article not found" });
  //     }
      
  //     console.log("Retrieved article:", article.id, article.title);
      
  //     // Fetch the related channel
  //     if (article && article.channel_id) {
  //       const { data: channel, error: channelError } = await supabase
  //         .from("channels")
  //         .select("id, name, slug")
  //         .eq("id", article.channel_id)
  //         .single();
          
  //       if (!channelError && channel) {
  //         article.channel = channel;
  //       }
  //     }
      
  //     // Fetch reaction counts
  //     const { data: reactions, error: reactionsError } = await supabase
  //       .from("reactions")
  //       .select("is_like, user_id")
  //       .eq("article_id", article.id);
        
  //     if (!reactionsError && reactions) {
  //       const likes = reactions.filter(r => r.is_like).length;
  //       const dislikes = reactions.filter(r => !r.is_like).length;
  //       article.likes = likes;
  //       article.dislikes = dislikes;
  //     }
      
  //     // If user is authenticated, check if they have reacted
  //     if (req.isAuthenticated()) {
  //       const { data: userReaction, error: userReactionError } = await supabase
  //         .from("reactions")
  //         .select("is_like")
  //         .eq("article_id", article.id)
  //         .eq("user_id", req.user.id)
  //         .maybeSingle();
          
  //       if (!userReactionError && userReaction) {
  //         article.userReaction = userReaction.is_like;
  //       }
  //     }
      
  //     // Get comment count
  //     const { data: commentCountData, error: commentCountError } = await supabase
  //       .from("comments")
  //       .select("*", { count: "exact", head: true })
  //       .eq("article_id", article.id);
        
  //     if (!commentCountError) {
  //       article._count = { comments: commentCountData?.length || 0 };
  //     }
      
  //     // Ensure viewCount is included in the response
  //     article.viewCount = article.view_count || 0;
      
  //     res.json(article);
  //   } catch (error) {
  //     console.error("Error fetching article:", error);
  //     res.status(500).json({ error: "Failed to fetch article" });
  //   }
  // });

  app.patch("/api/articles/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const article = await storage.getArticle(parseInt(req.params.id));
      if (!article) return res.sendStatus(404);
      if (article.userId !== req.user!.id) return res.sendStatus(403);
      
      // Add lastEdited timestamp to the update
      const updatedArticle = await storage.updateArticle(
        parseInt(req.params.id),
        {
          ...req.body,
          lastEdited: new Date()
        }
      );
      res.json(updatedArticle);
    } catch (error) {
      console.error("Error updating article:", error);
      res.status(500).json({ error: "Failed to update article" });
    }
  });

  // Delete an article
  app.delete("/api/articles/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const article = await storage.getArticle(parseInt(req.params.id));
      if (!article) return res.sendStatus(404);
      if (article.userId !== req.user!.id) return res.sendStatus(403);
      
      await storage.deleteArticle(parseInt(req.params.id));
      res.sendStatus(204); // No content
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({ error: "Failed to delete article" });
    }
  });

  // Toggle article publish status
  app.post("/api/articles/:id/toggle-status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const article = await storage.getArticle(parseInt(req.params.id));
      if (!article) return res.sendStatus(404);
      if (article.userId !== req.user!.id) return res.sendStatus(403);
      
      const newStatus = article.status === 'published' ? 'draft' : 'published';
      const published = newStatus === 'published';
      
      const updatedArticle = await storage.updateArticle(
        parseInt(req.params.id),
        { 
          status: newStatus,
          published,
          publishedAt: published ? new Date() : article.publishedAt
        }
      );
      
      res.json(updatedArticle);
    } catch (error) {
      console.error("Error toggling article status:", error);
      res.status(500).json({ error: "Failed to update article status" });
    }
  });

  // Comments
  app.post("/api/articles/:id/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const commentData = insertCommentSchema.parse(req.body);
    const comment = await storage.createComment({
      ...commentData,
      articleId: parseInt(req.params.id),
      userId: req.user.id,
    });
    res.json(comment);
  });

  app.get("/api/articles/:id/comments", async (req, res) => {
    const comments = await storage.listComments(parseInt(req.params.id));
    res.json(comments);
  });

  // Reactions
  app.post("/api/articles/:id/reactions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const articleId = parseInt(req.params.id);
      const userId = req.user.id;
      const isLike = req.body.isLike;
      
      console.log("Processing reaction:", { articleId, userId, isLike });
      
      // First, clean up any duplicate reactions (temporary fix)
      try {
        const { data: duplicates, error: findAllError } = await supabase
          .from("reactions")
          .select("id")
          .eq("article_id", articleId)
          .eq("user_id", userId);
          
        if (findAllError) {
          console.error("Error finding all reactions:", findAllError);
        } else if (duplicates && duplicates.length > 1) {
          console.log(`Found ${duplicates.length} duplicate reactions, keeping only the first one`);
          
          // Keep the first one, delete the rest
          const keepId = duplicates[0].id;
          const idsToDelete = duplicates.slice(1).map(d => d.id);
          
          const { error: cleanupError } = await supabase
            .from("reactions")
            .delete()
            .in("id", idsToDelete);
            
          if (cleanupError) {
            console.error("Error cleaning up duplicate reactions:", cleanupError);
          } else {
            console.log(`Successfully deleted ${idsToDelete.length} duplicate reactions`);
          }
        }
      } catch (cleanupError) {
        console.error("Error in cleanup process:", cleanupError);
        // Continue with the main operation even if cleanup fails
      }
      
      // Get the single reaction (after cleanup)
      const { data: existingReactions, error: findError } = await supabase
        .from("reactions")
        .select("id, is_like")
        .eq("article_id", articleId)
        .eq("user_id", userId)
        .limit(1);
      
      if (findError) {
        console.error("Error finding existing reaction:", findError);
        throw findError;
      }
      
      // Get the first reaction if any exist
      const existingReaction = existingReactions && existingReactions.length > 0 
        ? existingReactions[0] 
        : null;
      
      console.log("Existing reaction:", existingReaction);
      
      // If reaction exists and is the same type, remove it (toggle off)
      if (existingReaction && existingReaction.is_like === isLike) {
        const { error: deleteError } = await supabase
          .from("reactions")
          .delete()
          .eq("id", existingReaction.id);
          
        if (deleteError) {
          console.error("Error deleting reaction:", deleteError);
          throw deleteError;
        }
        
        return res.json({ removed: true, isLike });
      }
      
      // If reaction exists but is different type, update it
      if (existingReaction) {
        const { data: updatedReaction, error: updateError } = await supabase
          .from("reactions")
          .update({ is_like: isLike })
          .eq("id", existingReaction.id)
          .select()
          .single();
          
        if (updateError) {
          console.error("Error updating reaction:", updateError);
          throw updateError;
        }
        
        return res.json(updatedReaction);
      }
      
      // Otherwise create a new reaction
      const { data: newReaction, error: createError } = await supabase
        .from("reactions")
        .insert({
          article_id: articleId,
          user_id: userId,
          is_like: isLike
        })
        .select()
        .single();
        
      if (createError) {
        console.error("Error creating reaction:", createError, {
          article_id: articleId,
          user_id: userId,
          is_like: isLike
        });
        throw createError;
      }
      
      res.json(newReaction);
    } catch (error) {
      console.error("Error handling reaction:", error);
      res.status(500).json({ error: "Failed to process reaction", details: String(error) });
    }
  });

  // Get reactions for an article
  app.get("/api/articles/:id/reactions", async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);
      
      // Get all reactions for this article
      const { data: reactions, error } = await supabase
        .from("reactions")
        .select("is_like, user_id")
        .eq("article_id", articleId);
        
      if (error) throw error;
      
      // Calculate counts
      const likes = reactions?.filter(r => r.is_like).length || 0;
      const dislikes = reactions?.filter(r => !r.is_like).length || 0;
      
      // Get user's reaction if authenticated
      let userReaction = null;
      if (req.isAuthenticated()) {
        const { data: userReactionData, error: userError } = await supabase
          .from("reactions")
          .select("is_like")
          .eq("article_id", articleId)
          .eq("user_id", req.user.id)
          .maybeSingle();
          
        if (!userError && userReactionData) {
          userReaction = userReactionData.is_like;
        }
      }
      
      res.json({ likes, dislikes, userReaction });
    } catch (error) {
      console.error("Error fetching reactions:", error);
      res.status(500).json({ error: "Failed to fetch reactions" });
    }
  });

  // Subscriptions
  app.post("/api/channels/:id/subscribe", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const subscription = await storage.createSubscription({
      channelId: parseInt(req.params.id),
      userId: req.user.id,
    });
    res.json(subscription);
  });

  app.delete("/api/channels/:id/subscribe", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteSubscription(
      parseInt(req.params.id),
      req.user.id
    );
    res.sendStatus(200);
  });

  // Get channels that a user is subscribed to
  app.get("/api/user/subscriptions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // First, fetch the user's subscriptions
      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from("subscriptions")
        .select("*")  // Select all fields including created_at
        .eq("user_id", req.user.id);
      
      if (subscriptionsError) throw subscriptionsError;
      
      if (!subscriptions || subscriptions.length === 0) {
        return res.json([]);
      }
      
      // Then fetch details of those channels
      const channelIds = subscriptions.map(sub => sub.channel_id);
      
      const { data: channels, error: channelsError } = await supabase
        .from("channels")
        .select("*")
        .in("id", channelIds);
        
      if (channelsError) throw channelsError;
      
      // For each channel, get the subscriber count
      const enrichedChannels = await Promise.all(channels.map(async (channel) => {
        // Get subscriber count
        const { count, error: countError } = await supabase
          .from("subscriptions")
          .select("*", { count: 'exact', head: true })
          .eq("channel_id", channel.id);
          
        // Find the subscription date for this user+channel
        const subscription = subscriptions.find(sub => sub.channel_id === channel.id);
        const subscriptionDate = subscription ? subscription.created_at : null;
        
        return {
          ...channel,
          subscriberCount: count || 0,
          subscriptionDate
        };
      }));
      
      res.json(enrichedChannels || []);
    } catch (error) {
      console.error("Error fetching user subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  // Get user information by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      console.log("Fetching user with ID:", userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Fetch user from database with Supabase
      const { data: user, error } = await supabase
        .from("users")
        .select("id, username, description, created_at")
        .eq("id", userId)
        .single();
      
      console.log("Supabase query result:", { user, error });
        
      if (error || !user) {
        console.error("Error fetching user from Supabase:", error);
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get categories
  app.get("/api/categories", async (req, res) => {
    try {
      // Fetch all categories from the database
      const { data: categories, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      
      if (error) throw error;
      
      // Transform into a hierarchical structure
      const categoryMap = new Map<number, any>();
      const rootCategories: any[] = [];

      // First pass: create all category objects and store in map
      categories.forEach(category => {
        categoryMap.set(category.id, { ...category, children: [] });
      });
      
      // Second pass: build the hierarchy
      categories.forEach(category => {
        const categoryWithChildren = categoryMap.get(category.id);
        
        if (category.parent_id === null) {
          // This is a root category
          rootCategories.push(categoryWithChildren);
        } else {
          // This is a child category, add to its parent's children array
          const parent = categoryMap.get(category.parent_id);
          if (parent) {
            parent.children.push(categoryWithChildren);
          }
        }
      });
      
      res.json(rootCategories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Get locations
  app.get("/api/locations", async (req, res) => {
    try {
      // Fetch all locations from the database
      const { data: locations, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");
      
      if (error) throw error;
      
      // Transform into a hierarchical structure
      const locationMap = new Map<number, any>();
      const rootLocations: any[] = [];

      // First pass: create all location objects and store in map
      locations.forEach(location => {
        locationMap.set(location.id, { ...location, children: [] });
      });
      
      // Second pass: build the hierarchy
      locations.forEach(location => {
        const locationWithChildren = locationMap.get(location.id);
        
        if (location.parent_id === null) {
          // This is a root location
          rootLocations.push(locationWithChildren);
        } else {
          // This is a child location, add to its parent's children array
          const parent = locationMap.get(location.parent_id);
          if (parent) {
            parent.children.push(locationWithChildren);
          }
        }
      });
      
      res.json(rootLocations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  // Update user information by ID
  app.patch("/api/users/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Check if the authenticated user is trying to update their own profile
      if (req.user.id !== userId) {
        return res.status(403).json({ message: "Not authorized to update this user" });
      }
      
      const updates = req.body;
      const updatedUser = await storage.updateUser(userId, updates);
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Add article view endpoint
  app.post("/api/articles/:id/view", async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);
      console.log(`Processing view for article ID: ${articleId}`);
      
      // Get user ID if authenticated or use null for anonymous users
      const userId = req.isAuthenticated() ? req.user.id : null;
      
      // Use IP address as client identifier
      const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const clientIdentifier = userId ? `user-${userId}` : `ip-${clientIp}`;
      
      console.log("Processing view with client identifier:", clientIdentifier);
      
      // First get the article to check its current view count
      const { data: article, error: articleError } = await supabase
        .from("articles")
        .select("view_count, title")
        .eq("id", articleId)
        .single();
        
      if (articleError || !article) {
        console.error("Error getting article:", articleError);
        return res.status(404).json({ error: "Article not found" });
      }
      
      const currentCount = article.view_count || 0;
      console.log(`Found article "${article.title}" with current view_count: ${currentCount}`);
      
      // Check if this client has viewed this article before (anti-gaming mechanism)
      const { data: existingViews, error: viewsError } = await supabase
        .from("article_views")
        .select("id")
        .eq("article_id", articleId)
        .eq("client_identifier", clientIdentifier);
        
      if (viewsError) {
        console.error("Error checking views:", viewsError);
        return res.status(500).json({ error: "Failed to check view count" });
      }
      
      // If user has already viewed this article before, don't count another view
      if (existingViews && existingViews.length > 0) {
        console.log('View already recorded for this client, not incrementing count');
        return res.json({
          counted: false, 
          message: "View already counted for this article",
          alreadyViewed: true,
          view_count: currentCount 
        });
      }
      
      console.log('New view detected, recording view');
      
      // Record this view in article_views table
      const { error: insertError } = await supabase
        .from("article_views")
        .insert({
          article_id: articleId,
          user_id: userId,
          client_identifier: clientIdentifier
        });
        
      if (insertError) {
        console.error("Error recording view:", insertError);
        return res.status(500).json({ error: "Failed to record view" });
      }
      
      // Increment the current view count by 1, ALWAYS keeping the admin-set counts
      // This ensures we're incrementing from the current value, which may be admin-set
      const updatedViewCount = currentCount + 1;
      console.log(`Incrementing view count from ${currentCount} to ${updatedViewCount}`);
      
      const { error: updateError } = await supabase
        .from("articles")
        .update({ view_count: updatedViewCount })
        .eq("id", articleId);
        
      if (updateError) {
        console.error("Error updating view count:", updateError);
        return res.status(500).json({ error: "Failed to update view count" });
      }
      
      // Return the updated view count
      return res.json({ 
        counted: true, 
        message: "View recorded",
        view_count: updatedViewCount
      });
    } catch (error) {
      console.error("Error handling view count:", error);
      res.status(500).json({ error: "Failed to update view count" });
    }
  });

  // ===================================================================
  // Content API v1 — Programmatic article creation (dev mode)
  // ===================================================================

  // Unified auth for dev mode: check X-API-Key, fall back to session auth
  async function authenticateDevRequest(
    req: Request
  ): Promise<{ userId?: number; error?: string }> {
    const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
    if (apiKeyHeader) {
      return authenticateApiKey(apiKeyHeader, supabase);
    }
    if (req.isAuthenticated() && req.user) {
      return { userId: (req.user as any).id };
    }
    return { error: "Authentication required" };
  }

  // --- API Key Management ---

  app.post("/api/v1/api-keys", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { name, expiresInDays } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ error: "Key name is required" });
      }

      const { key, hash, prefix } = generateApiKey();
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data: apiKeyRow, error } = await supabase
        .from("api_keys")
        .insert([{
          key_prefix: prefix,
          key_hash: hash,
          user_id: req.user!.id,
          name: name.trim(),
          expires_at: expiresAt,
        }])
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: "Failed to create API key" });
      }

      return res.status(201).json({
        id: apiKeyRow.id,
        key,
        prefix,
        name: apiKeyRow.name,
        createdAt: apiKeyRow.created_at,
        expiresAt: apiKeyRow.expires_at,
      });
    } catch (error) {
      console.error("Error in POST /api/v1/api-keys:", error);
      return res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/v1/api-keys", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { data: keys, error } = await supabase
        .from("api_keys")
        .select("id, key_prefix, name, created_at, last_used_at, expires_at, is_revoked")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ error: "Failed to list API keys" });
      }

      return res.json(keys.map((k: any) => ({
        id: k.id,
        prefix: k.key_prefix,
        name: k.name,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
        expiresAt: k.expires_at,
        isRevoked: k.is_revoked,
      })));
    } catch (error) {
      console.error("Error in GET /api/v1/api-keys:", error);
      return res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/v1/api-keys/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const keyId = req.params.id;
      const { data: existing } = await supabase
        .from("api_keys")
        .select("id, user_id")
        .eq("id", keyId)
        .single();

      if (!existing) {
        return res.status(404).json({ error: "API key not found" });
      }
      if (existing.user_id !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to revoke this key" });
      }

      await supabase.from("api_keys").update({ is_revoked: true }).eq("id", keyId);
      return res.json({ message: "API key revoked" });
    } catch (error) {
      console.error("Error in DELETE /api/v1/api-keys/:id:", error);
      return res.status(500).json({ error: "Server error" });
    }
  });

  // --- API Access Management (admin-only) ---

  // Helper: check if the current session user is admin
  async function isDevAdmin(req: Request): Promise<boolean> {
    if (!req.isAuthenticated()) return false;
    const userId = (req.user as any).id;
    const { data: dbUser } = await supabase
      .from("users")
      .select("supabase_uid")
      .eq("id", userId)
      .maybeSingle();
    if (!dbUser?.supabase_uid) return false;
    const { data: admin } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", dbUser.supabase_uid)
      .maybeSingle();
    return !!admin;
  }

  // Helper: get Supabase UUID for the current dev session user
  async function getDevSupabaseUid(req: Request): Promise<string | null> {
    if (!req.isAuthenticated()) return null;
    const userId = (req.user as any).id;
    const { data } = await supabase
      .from("users")
      .select("supabase_uid")
      .eq("id", userId)
      .maybeSingle();
    return data?.supabase_uid || null;
  }

  app.get("/api/v1/api-access-users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!(await isDevAdmin(req))) return res.status(403).json({ error: "Admin access required" });

    const { data: grants } = await supabase
      .from("api_access_users")
      .select("user_id, created_at, granted_by")
      .order("created_at", { ascending: false });

    const results = [];
    for (const grant of grants || []) {
      const { data: authUser } = await supabase
        .from("users")
        .select("id, username")
        .eq("supabase_uid", grant.user_id)
        .maybeSingle();
      results.push({
        supabaseUid: grant.user_id,
        username: authUser?.username || "Unknown",
        localUserId: authUser?.id,
        grantedAt: grant.created_at,
      });
    }
    return res.json(results);
  });

  app.post("/api/v1/api-access-users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!(await isDevAdmin(req))) return res.status(403).json({ error: "Admin access required" });

    const { username } = req.body;
    if (!username?.trim()) return res.status(400).json({ error: "Username is required" });

    const { data: dbUser } = await supabase
      .from("users")
      .select("id, username, supabase_uid")
      .eq("username", username.trim())
      .maybeSingle();

    if (!dbUser || !dbUser.supabase_uid) return res.status(404).json({ error: "User not found" });

    const { data: existing } = await supabase
      .from("api_access_users")
      .select("user_id")
      .eq("user_id", dbUser.supabase_uid)
      .maybeSingle();

    if (existing) return res.status(409).json({ error: "User already has API access" });

    const grantedBy = await getDevSupabaseUid(req);
    const { error } = await supabase
      .from("api_access_users")
      .insert([{ user_id: dbUser.supabase_uid, granted_by: grantedBy }]);

    if (error) return res.status(500).json({ error: "Failed to grant API access" });

    return res.status(201).json({
      supabaseUid: dbUser.supabase_uid,
      username: dbUser.username,
      localUserId: dbUser.id,
    });
  });

  app.delete("/api/v1/api-access-users/:userId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!(await isDevAdmin(req))) return res.status(403).json({ error: "Admin access required" });

    const { error } = await supabase
      .from("api_access_users")
      .delete()
      .eq("user_id", req.params.userId);

    if (error) return res.status(500).json({ error: "Failed to revoke API access" });
    return res.json({ message: "API access revoked" });
  });

  app.get("/api/users/search", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!(await isDevAdmin(req))) return res.status(403).json({ error: "Admin access required" });

    const q = ((req.query.q as string) || "").trim();
    if (!q) return res.json([]);

    const { data: users } = await supabase
      .from("users")
      .select("id, username")
      .ilike("username", `%${q}%`)
      .limit(10);

    return res.json(users || []);
  });

  // --- Content API Endpoints ---

  // Helper: create a single article (shared by single and batch endpoints)
  async function createSingleArticleDev(articleData: any, userId: number): Promise<any> {
    const {
      title, content, contentFormat = "markdown", channelId,
      categoryIds = [], location, locationLat, locationLng,
      published = true, images = [],
    } = articleData;

    if (!title?.trim()) throw new Error("Title is required");
    if (!content?.trim()) throw new Error("Content is required");
    if (!channelId) throw new Error("channelId is required");
    if (categoryIds.length > 3) throw new Error("Maximum 3 categories allowed");
    if (images.length > 5) throw new Error("Maximum 5 images allowed");

    const htmlContent = normalizeContent(content, contentFormat);

    // Verify channel ownership
    const { data: channel } = await supabase
      .from("channels").select("id, user_id").eq("id", channelId).single();
    if (!channel) throw new Error("Channel not found");
    if (channel.user_id !== userId) throw new Error("Not authorized for this channel");

    // Duplicate check
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("articles").select("id").eq("channel_id", channelId)
      .eq("title", title.trim()).gte("created_at", oneDayAgo);
    if (existing && existing.length > 0) {
      const err: any = new Error(`Duplicate: "${title}" already published in last 24h`);
      err.status = 409;
      err.existingArticleId = existing[0].id;
      throw err;
    }

    // Generate slug with collision handling
    const baseSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").substring(0, 60);
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let fullSlug = `${dateStr}-${baseSlug}`;

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = attempt === 0 ? fullSlug : `${fullSlug}-${attempt + 1}`;
      const { data: ex } = await supabase.from("articles").select("id").eq("slug", candidate).single();
      if (!ex) { fullSlug = candidate; break; }
    }

    const articleRecord: any = {
      title: title.trim(), content: htmlContent, channel_id: channelId,
      user_id: userId, category: "", slug: fullSlug, published,
      status: published ? "published" : "draft", view_count: 0,
      location: location || null, location_name: location || null,
      location_lat: locationLat || null, location_lng: locationLng || null,
    };
    if (locationLat && locationLng) {
      articleRecord.geom = `SRID=4326;POINT(${locationLng} ${locationLat})`;
    }

    const { data: article, error: createError } = await supabase
      .from("articles").insert([articleRecord]).select().single();
    if (createError || !article) throw new Error(`Failed to create article: ${createError?.message}`);

    // Categories
    const categoryResults = [];
    for (let i = 0; i < categoryIds.length; i++) {
      const { error: catError } = await supabase.from("article_categories").insert([{
        article_id: article.id, category_id: categoryIds[i], is_primary: i === 0,
      }]);
      if (!catError) categoryResults.push(categoryIds[i]);
    }
    if (categoryIds.length > 0) {
      const { data: catData } = await supabase.from("categories").select("name").eq("id", categoryIds[0]).single();
      if (catData) await supabase.from("articles").update({ category: catData.name }).eq("id", article.id);
    }

    // Images
    const processedImages = [];
    for (let i = 0; i < images.length; i++) {
      const result = await downloadAndUploadImage(images[i], article.id, i, supabase);
      if (result) {
        const { data: imgRecord } = await supabase.from("article_images").insert([{
          article_id: article.id, image_url: result.imageUrl, caption: result.caption, order: result.order,
        }]).select().single();
        if (imgRecord) processedImages.push(imgRecord);
      }
    }

    return {
      id: article.id, title: article.title, slug: article.slug,
      channelId: article.channel_id, status: article.status,
      published: article.published, createdAt: article.created_at,
      url: `/articles/${article.id}/${article.slug}`,
      images: processedImages, categories: categoryResults,
    };
  }

  // Create single article
  app.post("/api/v1/content/articles", async (req, res) => {
    try {
      const { userId, error: authError } = await authenticateDevRequest(req);
      if (authError || !userId) {
        return res.status(401).json({ error: authError || "Authentication required" });
      }
      const result = await createSingleArticleDev(req.body, userId);
      return res.status(201).json(result);
    } catch (error: any) {
      if (error.status === 409) {
        return res.status(409).json({ error: "Duplicate article detected", message: error.message });
      }
      const status = error.message?.includes("Not authorized") ? 403
        : error.message?.includes("not found") ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
  });

  // Batch create articles
  app.post("/api/v1/content/articles/batch", async (req, res) => {
    try {
      const { userId, error: authError } = await authenticateDevRequest(req);
      if (authError || !userId) {
        return res.status(401).json({ error: authError || "Authentication required" });
      }

      const { articles } = req.body;
      if (!Array.isArray(articles) || articles.length === 0) {
        return res.status(400).json({ error: "articles array is required" });
      }
      if (articles.length > 10) {
        return res.status(400).json({ error: "Maximum 10 articles per batch" });
      }

      const created: any[] = [];
      const failed: any[] = [];
      for (let i = 0; i < articles.length; i++) {
        try {
          const result = await createSingleArticleDev(articles[i], userId);
          created.push({ index: i, ...result });
        } catch (err: any) {
          failed.push({ index: i, title: articles[i]?.title || "Unknown", error: err.message });
        }
      }

      return res.status(201).json({
        created, failed,
        summary: { total: articles.length, succeeded: created.length, failed: failed.length },
      });
    } catch (error) {
      return res.status(500).json({ error: "Server error" });
    }
  });

  // Get article details
  app.get("/api/v1/content/articles/:id", async (req, res) => {
    try {
      const { userId, error: authError } = await authenticateDevRequest(req);
      if (authError || !userId) {
        return res.status(401).json({ error: authError || "Authentication required" });
      }

      const articleId = req.params.id;
      const isNumeric = /^\d+$/.test(articleId);
      let query = supabase.from("articles").select("*");
      query = isNumeric ? query.eq("id", parseInt(articleId)) : query.eq("slug", articleId);

      const { data: article } = await query.single();
      if (!article) return res.status(404).json({ error: "Article not found" });
      if (article.user_id !== userId) return res.status(403).json({ error: "Not authorized" });

      const { data: channel } = await supabase.from("channels").select("id, name, slug").eq("id", article.channel_id).single();
      const { data: images } = await supabase.from("article_images").select("*").eq("article_id", article.id).order("order");
      const { data: categories } = await supabase.from("article_categories").select("category_id, is_primary, categories(id, name)").eq("article_id", article.id);

      return res.json({
        id: article.id, title: article.title, slug: article.slug,
        channelId: article.channel_id, channelName: channel?.name || null,
        status: article.status, published: article.published,
        createdAt: article.created_at, viewCount: article.view_count,
        url: `/articles/${article.id}/${article.slug}`,
        images: images || [], categories: categories || [],
      });
    } catch (error) {
      return res.status(500).json({ error: "Server error" });
    }
  });

  // List user's channels
  app.get("/api/v1/content/channels", async (req, res) => {
    try {
      const { userId, error: authError } = await authenticateDevRequest(req);
      if (authError || !userId) {
        return res.status(401).json({ error: authError || "Authentication required" });
      }

      const { data: channels } = await supabase
        .from("channels").select("*").eq("user_id", userId).order("created_at", { ascending: false });

      const enriched = await Promise.all(
        (channels || []).map(async (ch: any) => {
          const { count: articleCount } = await supabase
            .from("articles").select("*", { count: "exact", head: true }).eq("channel_id", ch.id).eq("published", true);
          const { count: subscriberCount } = await supabase
            .from("subscriptions").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
          return {
            id: ch.id, name: ch.name, slug: ch.slug, description: ch.description,
            category: ch.category, articleCount: articleCount || 0,
            subscriberCount: (subscriberCount || 0) + (ch.admin_subscriber_count || 0),
          };
        })
      );

      return res.json(enriched);
    } catch (error) {
      return res.status(500).json({ error: "Server error" });
    }
  });

  // List categories (hierarchical)
  app.get("/api/v1/content/categories", async (req, res) => {
    try {
      const { userId, error: authError } = await authenticateDevRequest(req);
      if (authError || !userId) {
        return res.status(401).json({ error: authError || "Authentication required" });
      }

      const { data: categories } = await supabase.from("categories").select("*").order("name");

      const categoryMap = new Map<number, any>();
      const roots: any[] = [];
      for (const cat of categories || []) {
        categoryMap.set(cat.id, { ...cat, children: [] });
      }
      for (const cat of categories || []) {
        const node = categoryMap.get(cat.id);
        if (cat.parent_id && categoryMap.has(cat.parent_id)) {
          categoryMap.get(cat.parent_id).children.push(node);
        } else {
          roots.push(node);
        }
      }

      return res.json(roots);
    } catch (error) {
      return res.status(500).json({ error: "Server error" });
    }
  });
}