import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { supabase } from "./supabase";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: (storage as any).sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  // Only set up Google strategy if environment variables are defined
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: "/api/auth/google/callback",
          accessType: "offline",
          includeGrantedScopes: true
        } as any,
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
          // For now, just log the profile info to verify it's working
          console.log("Google profile:", profile);
          return done(null, { id: "temp-user", username: profile.displayName });
        }
      )
    );

    // Routes for Google authentication
    app.get(
      "/api/auth/google",
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/auth" }),
      (req, res) => {
        // For now, just log the user and redirect to home
        console.log("Google auth successful, user:", req.user);
        res.redirect("/");
      }
    );
  }

  app.post('/api/auth/supabase-callback', async (req, res) => {
    try {
      const { supabase_uid, email } = req.body;
      
      if (!supabase_uid) {
        return res.status(400).json({ success: false, error: 'Missing Supabase user ID' });
      }
      
      console.log('Received Supabase callback:', { supabase_uid, email });
      
      // Use your existing database query to find a user with this supabase_uid
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('supabase_uid', supabase_uid)
        .single();
      
      if (existingUser) {
        // User exists, log them in with your existing session system
        req.login(existingUser, (err) => {
          if (err) {
            return res.status(500).json({ success: false, error: 'Failed to login' });
          }
          return res.json({ success: true, user: existingUser });
        });
      } else {
        // Create a new user directly with supabase
        const username = email ? email.split('@')[0] : `user_${Date.now()}`;
        
        const { data: newUser, error } = await supabase
          .from('users')
          .insert([{ 
            username, 
            password: '', // No password needed
            supabase_uid 
          }])
          .select()
          .single();
        
        if (error) {
          console.error('Error creating user:', error);
          return res.status(500).json({ success: false, error: 'Failed to create user' });
        }
        
        // Log in the new user with your existing session system
        req.login(newUser, (err) => {
          if (err) {
            return res.status(500).json({ success: false, error: 'Failed to login new user' });
          }
          return res.json({ success: true, user: newUser });
        });
      }
    } catch (error) {
      console.error('Error in Supabase callback:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
}
