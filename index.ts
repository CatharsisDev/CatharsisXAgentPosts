import { wisdom_agent } from './agent';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { TwitterApi } from '@virtuals-protocol/game-twitter-node';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

// Configuration
const POSTS_PER_DAY = 5;
const POST_INTERVAL = (24 * 60 * 60 * 1000) / POSTS_PER_DAY;
const POSTS_PER_CYCLE = 5;
const IMAGES_PER_CYCLE = 1;

// Consistent watercolor style
const WATERCOLOR_STYLE = `Traditional watercolor painting with these exact characteristics:
- Visible brush strokes and paper texture
- Wet-on-wet technique with intentional bleeding
- Color palette: warm earth tones (burnt sienna, raw umber, ochre) with soft blue, sage green, or muted terracotta accents
- Strong natural window light creating dramatic shadows
- Large areas of pure white (unpainted paper) for highlights
- Soft shadow washes in cool grays and blues
- Soft edges, atmospheric washes
- Minimal but intentional details
- Serene, contemplative mood`;

// Scene variations to rotate through
const SCENE_TYPES = [
  "Sunlit reading corner with an armchair, open book, and large arched window",
  "Open window overlooking a distant garden with soft morning light",
  "Quiet library alcove with bookshelves and dappled sunlight on the floor",
  "Simple tea setting on a wooden table near a window",
  "Garden bench under a tree with filtered light through leaves",
  "Peaceful courtyard with a small fountain and stone archways",
  "Morning light streaming through a hallway with columns",
  "Window seat with cushions and a view of hills in the distance",
  "Writing desk by a window with vintage books and a teacup",
  "Cloister walkway with arches and soft shadows on stone floor"
];

let currentSceneIndex = 0;

function getNextScene(): string {
  const scene = SCENE_TYPES[currentSceneIndex];
  currentSceneIndex = (currentSceneIndex + 1) % SCENE_TYPES.length;
  return scene;
}

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
      lastPostTime,
      currentSceneIndex
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
      currentSceneIndex = state.currentSceneIndex || 0;
      
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
  "Quotes from ancient Philosophers",
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
  if (postsInCurrentCycle >= POSTS_PER_CYCLE) {
    postsInCurrentCycle = 0;
    imagesInCurrentCycle = 0;
    console.log("📊 New cycle started");
    saveState();
  }
  
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
    let promptContent = '';
    
    // Special handling for philosopher quotes
    if (topic.toLowerCase().includes('philosopher') || topic.toLowerCase().includes('quotes')) {
      promptContent = `Share a profound quote from an ancient philosopher (Socrates, Plato, Aristotle, Marcus Aurelius, Seneca, Epictetus, Confucius, Laozi).

Format:
"[exact quote]" - [Philosopher name]

One brief sentence relating it to modern life. No hashtags.`;
    } else {
      promptContent = `Write a tweet about: ${topic}. 1-2 sentences, practical advice, no hashtags.`;
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: promptContent
      }]
    });
    
    const tweetText = response.choices[0].message.content?.trim() || '';
    console.log("Generated text:", tweetText);
    
    if (!tweetText || tweetText.length < 10) {
      console.log("❌ Failed to generate tweet text");
      return false;
    }
    
    const result = await twitterClient.v2.tweet(tweetText);
    console.log("✅ Tweet posted! ID:", result.data.id);
    
    lastPostTime = Date.now();
    totalPosts++;
    textPosts++;
    postsInCurrentCycle++;
    saveState();
    return true;
  } catch (error: any) {
    console.error("❌ Twitter API error:", error);
    return false;
  }
}

async function postWithImage(): Promise<boolean> {
  const topic = getNextWisdomTopic();
  console.log(`🖼️ Creating image post about: ${topic}`);
  
  try {
    // Get next scene for variety
    const sceneDescription = getNextScene();
    
    // Generate image prompt with consistent style
    const imagePromptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `${WATERCOLOR_STYLE}

Scene to paint: ${sceneDescription}

Write a single detailed sentence describing this exact scene in watercolor style. Focus on light, shadows, and the peaceful atmosphere.`
      }]
    });
    
    const imagePrompt = imagePromptResponse.choices[0].message.content?.trim() || 'peaceful watercolor interior scene with window light';
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
    
    // Generate image with DALL-E 3
    console.log("🎨 Generating image with DALL-E 3...");
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    });
    
    if (!imageResponse.data || !imageResponse.data[0]?.url) {
      console.log("❌ No image URL returned");
      return false;
    }

    const imageUrl = imageResponse.data[0].url;
    
    // Post with image using media worker
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
Post interval: ${(POST_INTERVAL / 60000).toFixed(1)} minutes

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

async function runScheduler(): Promise<void> {
  try {
    await attemptPost();
  } catch (error) {
    console.error("❌ Scheduler error:", error);
  }
  
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
  console.log("- TWITTER_API_SECRET:", !!process.env.TWITTER_API_SECRET ? "✅" : "❌");
  console.log("- TWITTER_ACCESS_TOKEN:", !!process.env.TWITTER_ACCESS_TOKEN ? "✅" : "❌");
  console.log("- TWITTER_ACCESS_SECRET:", !!process.env.TWITTER_ACCESS_SECRET ? "✅" : "❌");
  console.log(`\n📊 Config: ${POSTS_PER_DAY} posts/day (every ${(POST_INTERVAL / 60000).toFixed(1)} minutes)`);
  console.log(`📊 Cycle: ${IMAGES_PER_CYCLE} image per ${POSTS_PER_CYCLE} posts\n`);
  
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