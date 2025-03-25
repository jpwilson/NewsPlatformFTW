import { pgTable, serial, text, integer, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Define tables without circular references first
export const categoriesTable = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  parentId: integer('parent_id'),
  createdAt: timestamp('created_at').defaultNow()
});

export const locationsTable = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  parentId: integer('parent_id'),
  type: text('type').notNull(),  // 'country', 'state', 'city'
  createdAt: timestamp('created_at').defaultNow()
});

// Now add self-references
export const categories = categoriesTable;
export const locations = locationsTable;

// Define relations for self-references
export const categoriesRelations = relations(categories, ({ one }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
}));

export const locationsRelations = relations(locations, ({ one }) => ({
  parent: one(locations, {
    fields: [locations.parentId],
    references: [locations.id],
  }),
}));

// Define tables using pgTable for PostgreSQL (Supabase)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  description: text('description'),
  supabase_uid: text('supabase_uid'),
  created_at: timestamp('created_at').defaultNow()
});

export const channels = pgTable('channels', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  userId: integer('user_id').notNull(),
  category: text('category'),
  location: text('location'),
  bannerImage: text('banner_image'),
  profileImage: text('profile_image'),
  slug: text('slug').unique(),
  locationId: integer('location_id').references(() => locations.id),
  createdAt: timestamp('created_at').defaultNow()
});

export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  channelId: integer('channel_id').notNull(),
  userId: integer('user_id').notNull(),
  category: text('category').notNull(),
  location: text('location'),
  locationId: integer('location_id').references(() => locations.id),
  slug: text('slug').unique(),
  published: boolean('published').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  status: text('status').notNull().default('published'),
  lastEdited: timestamp('last_edited').defaultNow(),
  publishedAt: timestamp('published_at').defaultNow(),
  viewCount: integer('view_count').default(0)
});

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  articleId: integer('article_id').notNull(),
  userId: integer('user_id').notNull(),
  parentId: integer('parent_id'),
  createdAt: timestamp('created_at').defaultNow()
});

export const reactions = pgTable('reactions', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  userId: integer('user_id').notNull(),
  isLike: boolean('is_like').notNull()
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  channelId: integer('channel_id').notNull(),
  userId: integer('user_id').notNull()
});

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  userId: integer('user_id').notNull(),
  articleId: integer('article_id'),
  channelId: integer('channel_id')
});

// Junction tables for many-to-many relationships
export const articleCategories = pgTable('article_categories', {
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  isPrimary: boolean('is_primary').default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.articleId, t.categoryId] })
}));

export const channelCategories = pgTable('channel_categories', {
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  isPrimary: boolean('is_primary').default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.channelId, t.categoryId] })
}));

// Define schema relations
export const usersRelations = relations(users, ({ many }) => ({
  channels: many(channels),
  articles: many(articles),
  comments: many(comments),
  reactions: many(reactions),
  subscriptions: many(subscriptions),
  notes: many(notes)
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  user: one(users, {
    fields: [channels.userId],
    references: [users.id]
  }),
  articles: many(articles),
  subscriptions: many(subscriptions)
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  channel: one(channels, {
    fields: [articles.channelId],
    references: [channels.id]
  }),
  user: one(users, {
    fields: [articles.userId],
    references: [users.id]
  }),
  comments: many(comments),
  reactions: many(reactions)
}));

// Create Zod schemas from Drizzle schema
export const insertUserSchema = createInsertSchema(users);
export const insertChannelSchema = createInsertSchema(channels);
export const insertArticleSchema = createInsertSchema(articles).omit({ 
  createdAt: true 
}).extend({
  locationId: z.number().optional(),
  categoryId: z.number().optional(),
  status: z.enum(['draft', 'published']).optional()
});
export const insertCommentSchema = createInsertSchema(comments).omit({ 
  createdAt: true 
});
export const insertReactionSchema = createInsertSchema(reactions);
export const insertSubscriptionSchema = createInsertSchema(subscriptions);
export const insertNoteSchema = createInsertSchema(notes);
export const insertCategorySchema = createInsertSchema(categories);
export const insertLocationSchema = createInsertSchema(locations);
export const insertArticleCategorySchema = createInsertSchema(articleCategories);
export const insertChannelCategorySchema = createInsertSchema(channelCategories);

// Export types
export type User = typeof users.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type ArticleCategory = typeof articleCategories.$inferSelect;
export type ChannelCategory = typeof channelCategories.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type InsertReaction = z.infer<typeof insertReactionSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type InsertArticleCategory = z.infer<typeof insertArticleCategorySchema>;
export type InsertChannelCategory = z.infer<typeof insertChannelCategorySchema>;