import { wisdom_agent } from './agent';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// Configuration
const POSTS_PER_DAY = 96;
const POST_INTERVAL = (24 * 60 * 60 * 1000) / POSTS_PER_DAY;
const POSTS_PER_CYCLE = 5;
const IMAGES_PER_CYCLE = 1;

// State
let postsInCurrentCycle = 0;
let imagesInCurrentCycle = 0;
let lastPostTime = 0;
let totalPosts = 0;
let imagePosts = 0;
let textPosts = 0;

const STATE_FILE = '/app/data/poster_state.json';

function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      postsInCurrentCycle,
      imagesInCurrentCycle,
      totalPosts,
      imagePosts,
      textPosts,
      lastPostTime
    }, null, 2));
    
    console.log('💾 State saved');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      postsInCurrentCycle = state.postsInCurrentCycle || 0;
      imagesInCurrentCycle = state.imagesInCurrentCycle || 0;
      totalPosts = state.totalPosts || 0;
      imagePosts = state.imagePosts || 0;
      textPosts = state.textPosts || 0;
      lastPostTime = state.lastPostTime || 0;
      
      console.log('✅ State loaded:', {
        totalPosts,
        imagePosts,
        textPosts,
        postsInCycle: postsInCurrentCycle,
        imagesInCycle: imagesInCurrentCycle
      });
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

const WISDOM_TOPICS = [
  "Philosopher quotes",
  "starting new habits and overcoming procrastination",
  "dealing with failure and building resilience",
  "time management and prioritization",
  "maintaining focus in distractions",
  "setting boundaries and saying no",
  "consistency vs perfection mindset",
  "learning from mistakes and iteration",
  "building discipline when motivation fades",
  "breaking big goals into small steps",
  "managing energy not just time"
];

let currentTopicIndex = 0;

function getNextWisdomTopic(): string {
  const topic = WISDOM_TOPICS[currentTopicIndex];
  currentTopicIndex = (currentTopicIndex + 1) % WISDOM_TOPICS.length;
  return topic;
}

function shouldPostWithImage(): boolean {
  // Reset cycle if needed
  if (postsInCurrentCycle >= POSTS_PER_CYCLE) {
    postsInCurrentCycle = 0;
    imagesInCurrentCycle = 0;
    console.log("📊 New cycle started");
    saveState();
  }
  
  // Calculate if we should use image
  let useImage = false;
  if (imagesInCurrentCycle < IMAGES_PER_CYCLE) {
    const postsRemaining = POSTS_PER_CYCLE - postsInCurrentCycle;
    const imagesRemaining = IMAGES_PER_CYCLE - imagesInCurrentCycle;
    const chanceOfImage = imagesRemaining / postsRemaining;
    useImage = Math.random() <= chanceOfImage;
  }
  
  return useImage;
}

async function postTextOnly(): Promise<boolean> {
  const topic = getNextWisdomTopic();
  console.log(`📝 Creating text post about: ${topic}`);
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Write a tweet about: ${topic}. 1-2 sentences, practical advice, no hashtags.`
      }]
    });
    
    const tweetText = response.choices[0].message.content?.trim() || '';
    console.log("Generated text:", tweetText);
    
    if (!tweetText || tweetText.length < 10) {
      console.log("❌ Failed to generate tweet text");
      return false;
    }
    
    const twitterWorker = wisdom_agent.workers.find(w => w.id === "wisdom_twitter_worker");
    if (!twitterWorker) {
      console.log("❌ Twitter worker not found");
      return false;
    }
    
    const postResult = await twitterWorker.functions
      .find(f => f.name === 'post_tweet')
      ?.executable({ text: tweetText }, (msg: string) => console.log(`[Twitter] ${msg}`));
    
    if (postResult?.status === 'done') {
      console.log("✅ Text post successful!");
      lastPostTime = Date.now();
      totalPosts++;
      textPosts++;
      postsInCurrentCycle++;
      saveState();
      return true;
    } else {
      console.log("❌ Failed to post - Status:", postResult?.status);
      return false;
    }
  } catch (error: any) {
    console.error("❌ Text post error:", error.message);
    return false;
  }
}

async function postWithImage(): Promise<boolean> {
  const topic = getNextWisdomTopic();
  console.log(`🖼️ Creating image post about: ${topic}`);
  
  try {
    // Generate image prompt
    const imagePromptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Create a unique watercolor image description for a tweet about: ${topic}. Describe a peaceful scene (courtyard, teacup, window seat, etc). One sentence, focus on mood and composition.`
      }]
    });
    
    const imagePrompt = imagePromptResponse.choices[0].message.content?.trim() || 'watercolor peaceful scene';
    console.log("Image prompt:", imagePrompt);
    
    // Generate tweet text
    const tweetResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Write a tweet about: ${topic}. 1-2 sentences, practical advice, no hashtags.`
      }]
    });
    
    const tweetText = tweetResponse.choices[0].message.content?.trim() || '';
    console.log("Generated text:", tweetText);
    
    if (!tweetText || tweetText.length < 10) {
      console.log("❌ Failed to generate tweet text");
      return false;
    }
    
    // Generate image
    const imageGenWorker = wisdom_agent.workers.find(w => w.id === "wisdom_image_gen");
    if (!imageGenWorker) {
      console.log("❌ Image gen worker not found");
      return false;
    }
    
    const imageResult = await imageGenWorker.functions
      .find(f => f.name === 'generate_image')
      ?.executable({ prompt: imagePrompt, width: '768', height: '768' }, (msg: string) => console.log(`[ImageGen] ${msg}`));
    
    if (imageResult?.status !== 'done') {
      console.log("❌ Image generation failed");
      return false;
    }
    
    // Get image URL
    const urlHandlerWorker = wisdom_agent.workers.find(w => w.id === "image_url_handler");
    if (!urlHandlerWorker) {
      console.log("❌ URL handler worker not found");
      return false;
    }
    
    const urlResult = await urlHandlerWorker.functions
      .find(f => f.name === 'get_latest_image_url')
      ?.executable({}, (msg: string) => console.log(`[URLHandler] ${msg}`));
    
    if (urlResult?.status !== 'done') {
      console.log("❌ Failed to get image URL");
      return false;
    }
    
    const imageUrl = urlResult.feedback;
    console.log("Image URL:", imageUrl);
    
    // Post with image
    const mediaWorker = wisdom_agent.workers.find(w => w.id === "twitter_media_worker");
    if (!mediaWorker) {
      console.log("❌ Media worker not found");
      return false;
    }
    
    const postResult = await mediaWorker.functions
      .find(f => f.name === 'upload_image_and_tweet')
      ?.executable({ text: tweetText, image_url: imageUrl }, (msg: string) => console.log(`[Twitter] ${msg}`));
    
    if (postResult?.status === 'done') {
      console.log("✅ Image post successful!");
      lastPostTime = Date.now();
      totalPosts++;
      imagePosts++;
      imagesInCurrentCycle++;
      postsInCurrentCycle++;
      saveState();
      return true;
    } else {
      console.log("❌ Failed to post with image - Status:", postResult?.status);
      return false;
    }
  } catch (error: any) {
    console.error("❌ Image post error:", error.message);
    return false;
  }
}

async function attemptPost(): Promise<void> {
  const now = Date.now();
  const timeSinceLastPost = now - lastPostTime;
  
  if (timeSinceLastPost < POST_INTERVAL) {
    const minutesRemaining = Math.round((POST_INTERVAL - timeSinceLastPost) / 60000);
    console.log(`⏰ Next post in ${minutesRemaining} minutes`);
    return;
  }
  
  console.log("📢 Time to post!");
  
  const useImage = shouldPostWithImage();
  let success = false;
  
  if (useImage) {
    console.log(`🎨 Posting WITH image (${imagesInCurrentCycle + 1}/${IMAGES_PER_CYCLE} in cycle)`);
    success = await postWithImage();
    
    // Fallback to text if image fails
    if (!success) {
      console.log("⚠️ Image post failed, trying text-only...");
      success = await postTextOnly();
    }
  } else {
    console.log(`📝 Posting WITHOUT image (${postsInCurrentCycle + 1 - imagesInCurrentCycle}/${POSTS_PER_CYCLE - IMAGES_PER_CYCLE} text posts in cycle)`);
    success = await postTextOnly();
  }
  
  if (success) {
    const imagePercentage = totalPosts > 0 ? (imagePosts / totalPosts * 100).toFixed(1) : '0.0';
    console.log(`📊 Total: ${totalPosts} posts (${imagePosts} images [${imagePercentage}%], ${textPosts} text)`);
  }
}

// HTTP Server
const server = http.createServer((request, response) => {
  if (request.url === '/') {
    const imagePercentage = totalPosts > 0 ? (imagePosts / totalPosts * 100).toFixed(1) : '0.0';
    const minutesSincePost = Math.round((Date.now() - lastPostTime) / 60000);
    const minutesUntilNext = Math.max(0, Math.round((POST_INTERVAL - (Date.now() - lastPostTime)) / 60000));
    
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end(`AIleen Poster Agent

Status: Running
Posts per day: ${POSTS_PER_DAY}
Post interval: ${POST_INTERVAL / 60000} minutes

Stats:
- Total Posts: ${totalPosts}
- Image Posts: ${imagePosts} (${imagePercentage}%)
- Text Posts: ${textPosts}
- Cycle: ${postsInCurrentCycle}/${POSTS_PER_CYCLE} posts, ${imagesInCurrentCycle}/${IMAGES_PER_CYCLE} images

Timing:
- Last post: ${minutesSincePost} minutes ago
- Next post: in ${minutesUntilNext} minutes
`);
    return;
  }
  
  if (request.url === '/post-text') {
    postTextOnly()
      .then(success => {
        response.writeHead(success ? 200 : 500, {'Content-Type': 'text/plain'});
        response.end(success ? 'Text post successful' : 'Text post failed');
      })
      .catch(err => {
        response.writeHead(500, {'Content-Type': 'text/plain'});
        response.end('Error: ' + err.message);
      });
    return;
  }
  
  if (request.url === '/post-image') {
    postWithImage()
      .then(success => {
        response.writeHead(success ? 200 : 500, {'Content-Type': 'text/plain'});
        response.end(success ? 'Image post successful' : 'Image post failed');
      })
      .catch(err => {
        response.writeHead(500, {'Content-Type': 'text/plain'});
        response.end('Error: ' + err.message);
      });
    return;
  }
  
  if (request.url === '/reset') {
    postsInCurrentCycle = 0;
    imagesInCurrentCycle = 0;
    saveState();
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end('Cycle reset');
    return;
  }
  
  response.writeHead(404, {'Content-Type': 'text/plain'});
  response.end('Not found');
});

// Main scheduler
async function runScheduler(): Promise<void> {
  try {
    await attemptPost();
  } catch (error) {
    console.error("❌ Scheduler error:", error);
  }
  
  // Check every 5 minutes
  setTimeout(runScheduler, 5 * 60 * 1000);
}

async function main(): Promise<void> {
  console.log("=========================================");
  console.log("🚀 AIleen Poster Agent Starting...");
  console.log("=========================================");
  
  loadState();
  
  console.log("Environment check:");
  console.log("- API_KEY:", !!process.env.API_KEY ? "✅" : "❌");
  console.log("- OPENAI_API_KEY:", !!process.env.OPENAI_API_KEY ? "✅" : "❌");
  console.log("- TWITTER_API_KEY:", !!process.env.TWITTER_API_KEY ? "✅" : "❌");
  console.log("- TOGETHER_API_KEY:", !!process.env.TOGETHER_API_KEY ? "✅" : "❌");
  console.log(`\n📊 Config: ${POSTS_PER_DAY} posts/day (every ${POST_INTERVAL / 60000} minutes)`);
  console.log(`📊 Cycle: ${IMAGES_PER_CYCLE} image per ${POSTS_PER_CYCLE} posts\n`);
  
  console.log("Twitter creds check:", {
  key: !!process.env.TWITTER_API_KEY,
  secret: !!process.env.TWITTER_API_SECRET,
  token: !!process.env.TWITTER_ACCESS_TOKEN,
  tokenSecret: !!process.env.TWITTER_ACCESS_SECRET
});
  
  try {
    console.log("Initializing agent...");
    await wisdom_agent.init();
    console.log("✅ Agent initialized!");
  } catch (error) {
    console.error("❌ Failed to initialize agent:", error);
    process.exit(1);
  }
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });
  
  console.log("⏰ Starting scheduler...");
  runScheduler();
  
  console.log("✅ Poster agent running!");
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  saveState();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  saveState();
});

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});