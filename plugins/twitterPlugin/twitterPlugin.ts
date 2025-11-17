import TwitterPlugin from "@virtuals-protocol/game-twitter-plugin";
import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from "dotenv";
dotenv.config();

// Create Twitter client with OAuth 1.0a using Virtuals' TwitterApi
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

console.log("Twitter creds check:", {
  key: !!process.env.TWITTER_API_KEY,
  secret: !!process.env.TWITTER_API_SECRET,
  token: !!process.env.TWITTER_ACCESS_TOKEN,
  tokenSecret: !!process.env.TWITTER_ACCESS_SECRET
});

// Create plugin
export const twitterPlugin = new TwitterPlugin({
  id: "wisdom_twitter_worker",
  name: "Wisdom Twitter Worker",
  description: "Worker that posts wisdom and knowledge tweets",
  twitterClient: twitterClient
});