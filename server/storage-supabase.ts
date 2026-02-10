import { db } from './db';
import {
  users,
  channels,
  articles,
  comments,
  reactions,
  subscriptions,
  notes,
  User,
  Channel,
  Article,
  Comment,
  Reaction,
  Subscription,
  Note,
  InsertUser,
  InsertChannel,
  InsertArticle,
  InsertComment,
  InsertReaction,
  InsertSubscription,
  InsertNote
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { IStorage } from './storage';
import { supabase } from './supabase';
// @ts-ignore -- no @types/bcrypt installed
import bcrypt from 'bcrypt';

// Implement the storage interface using Drizzle with PostgreSQL
export const storage: IStorage = {
  // Users
  async getUser(id: number): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  },
  
  async getUserByUsername(username: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result.length > 0 ? result[0] : null;
  },
  
  async createUser({ username, password, supabase_uid }: { 
    username: string; 
    password: string;
    supabase_uid?: string;
  }): Promise<User> {
    // Check if username already exists
    const existingUser = await this.getUserByUsername(username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Only hash password if it's provided (for non-OAuth users)
    const hashedPassword = password ? await bcrypt.hash(password, 10) : '';

    // Insert the new user
    const { data, error } = await supabase
      .from('users')
      .insert([
        { 
          username, 
          password: hashedPassword,
          supabase_uid: supabase_uid || null
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }

    return data as User;
  },
  
  async updateUser(userId: number, updates: { description?: string }): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      console.error("Error updating user:", error);
      throw new Error(`Failed to update user: ${error.message}`);
    }

    return data;
  },
  
  // Channels
  async createChannel(channel: InsertChannel): Promise<Channel> {
    const result = await db.insert(channels).values(channel).returning();
    return result[0];
  },
  
  async getChannel(id: number): Promise<Channel | null> {
    const result = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  },
  
  async listChannels(): Promise<Channel[]> {
    return await db.select().from(channels);
  },
  
  // Articles
  async createArticle(article: InsertArticle): Promise<Article> {
    const result = await db.insert(articles).values(article).returning();
    return result[0];
  },
  
  async getArticle(id: number): Promise<Article | null> {
    const result = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  },
  
  async listArticles(): Promise<Article[]> {
    return await db.select().from(articles);
  },
  
  async updateArticle(id: number, update: Partial<Article>): Promise<Article> {
    const result = await db.update(articles)
      .set(update)
      .where(eq(articles.id, id))
      .returning();
    
    if (!result.length) {
      throw new Error("Article not found");
    }
    
    return result[0];
  },
  
  async deleteArticle(id: number): Promise<void> {
    const result = await db.delete(articles)
      .where(eq(articles.id, id))
      .returning();
      
    if (!result.length) {
      throw new Error("Article not found");
    }
  },
  
  // Comments
  async createComment(comment: InsertComment): Promise<Comment> {
    const result = await db.insert(comments).values(comment).returning();
    return result[0];
  },
  
  async listComments(articleId: number): Promise<Comment[]> {
    return await db.select()
      .from(comments)
      .where(eq(comments.articleId, articleId));
  },
  
  // Reactions
  async createReaction(reaction: InsertReaction): Promise<Reaction> {
    const result = await db.insert(reactions).values(reaction).returning();
    return result[0];
  },
  
  // Subscriptions
  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(subscription).returning();
    return result[0];
  },
  
  async deleteSubscription(channelId: number, userId: number): Promise<void> {
    await db.delete(subscriptions)
      .where(
        and(
          eq(subscriptions.channelId, channelId),
          eq(subscriptions.userId, userId)
        )
      );
  },
  
  // Notes
  async createNote(note: InsertNote): Promise<Note> {
    const result = await db.insert(notes).values(note).returning();
    return result[0];
  }
};

// Add this function to get a user by Supabase ID
export async function getUserBySupabaseId(supabaseUid: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_uid', supabaseUid)
      .single();
    
    if (error || !data) {
      console.log('No user found with supabase_uid:', supabaseUid);
      return null;
    }
    
    return data as User;
  } catch (error) {
    console.error('Error getting user by Supabase ID:', error);
    return null;
  }
}