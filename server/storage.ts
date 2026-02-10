import createMemoryStore from "memorystore";
import session from "express-session";
import {
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
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, update: Partial<User>): Promise<User>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  getChannel(id: number): Promise<Channel | null>;
  listChannels(): Promise<Channel[]>;
  createArticle(article: InsertArticle): Promise<Article>;
  getArticle(id: number): Promise<Article | null>;
  listArticles(): Promise<Article[]>;
  updateArticle(id: number, update: Partial<Article>): Promise<Article>;
  deleteArticle(id: number): Promise<void>;
  createComment(comment: InsertComment): Promise<Comment>;
  listComments(articleId: number): Promise<Comment[]>;
  createReaction(reaction: InsertReaction): Promise<Reaction>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  deleteSubscription(channelId: number, userId: number): Promise<void>;
  createNote(note: InsertNote): Promise<Note>;
}

const MemoryStore = createMemoryStore(session);

// A simple in-memory implementation, not used with Supabase but kept for reference
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private channels: Map<number, Channel>;
  private articles: Map<number, Article>;
  private comments: Map<number, Comment>;
  private reactions: Map<number, Reaction>;
  private subscriptions: Map<number, Subscription>;
  private notes: Map<number, Note>;
  sessionStore: session.Store;
  private currentId: number;

  constructor() {
    this.users = new Map();
    this.channels = new Map();
    this.articles = new Map();
    this.comments = new Map();
    this.reactions = new Map();
    this.subscriptions = new Map();
    this.notes = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    ) || null;
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = this.currentId++;
    const newUser = { ...user, id } as User;
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUser(id: number, update: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updatedUser = { ...user, ...update };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async createChannel(channel: InsertChannel): Promise<Channel> {
    const id = this.currentId++;
    const newChannel = { ...channel, id } as Channel;
    this.channels.set(id, newChannel);
    return newChannel;
  }

  async getChannel(id: number): Promise<Channel | null> {
    return this.channels.get(id) || null;
  }

  async listChannels(): Promise<Channel[]> {
    return Array.from(this.channels.values());
  }

  async createArticle(article: InsertArticle): Promise<Article> {
    const id = this.currentId++;
    const newArticle = {
      ...article,
      id,
      createdAt: new Date().toISOString()
    } as unknown as Article;
    this.articles.set(id, newArticle);
    return newArticle;
  }

  async getArticle(id: number): Promise<Article | null> {
    return this.articles.get(id) || null;
  }

  async listArticles(): Promise<Article[]> {
    return Array.from(this.articles.values());
  }

  async updateArticle(id: number, update: Partial<Article>): Promise<Article> {
    const article = this.articles.get(id);
    if (!article) throw new Error("Article not found");
    const updatedArticle = { ...article, ...update };
    this.articles.set(id, updatedArticle);
    return updatedArticle;
  }

  async deleteArticle(id: number): Promise<void> {
    if (!this.articles.has(id)) throw new Error("Article not found");
    this.articles.delete(id);
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const id = this.currentId++;
    const newComment = {
      ...comment,
      id,
      createdAt: new Date().toISOString()
    } as unknown as Comment;
    this.comments.set(id, newComment);
    return newComment;
  }

  async listComments(articleId: number): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(
      (comment) => comment.articleId === articleId
    );
  }

  async createReaction(reaction: InsertReaction): Promise<Reaction> {
    const id = this.currentId++;
    const newReaction = { ...reaction, id } as Reaction;
    this.reactions.set(id, newReaction);
    return newReaction;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const id = this.currentId++;
    const newSubscription = { ...subscription, id } as Subscription;
    this.subscriptions.set(id, newSubscription);
    return newSubscription;
  }

  async deleteSubscription(channelId: number, userId: number): Promise<void> {
    const subscription = Array.from(this.subscriptions.values()).find(
      (sub) => sub.channelId === channelId && sub.userId === userId
    );
    if (subscription) {
      this.subscriptions.delete(subscription.id);
    }
  }

  async createNote(note: InsertNote): Promise<Note> {
    const id = this.currentId++;
    const newNote = { ...note, id } as Note;
    this.notes.set(id, newNote);
    return newNote;
  }
}

// This used to be the SQLite implementation, now we'll just re-export from storage-supabase
import { storage as supabaseStorage } from './storage-supabase';
export const storage = supabaseStorage;