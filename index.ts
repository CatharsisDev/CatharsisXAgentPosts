import { wisdom_agent } from './agent';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';
import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import { ImageHostPlugin } from './plugins/imageHostPlugin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

const imageHostPlugin = new ImageHostPlugin({
  apiKey: process.env.IMGBB_API_KEY!,
});

// Configuration
const WEEKLY_POST_SCHEDULE: Record<number, number> = {
  0: 2, // Sunday
  1: 4, // Monday
  2: 3, // Tuesday
  3: 5, // Wednesday
  4: 3, // Thursday
  5: 4, // Friday
  6: 2  // Saturday
};
const MAX_POSTS_PER_DAY = 5;
const POSTS_PER_CYCLE = MAX_POSTS_PER_DAY;
const IMAGES_PER_CYCLE = 1;
const INSTAGRAM_MAX_RETRIES = 2;
const PHILOSOPHER_QUOTES_PER_DAY = 2;
const PHILOSOPHER_BIO_POSTS_PER_DAY = 1;

// Per-day scheduling state
let postsToday = 0;
let currentDayKey = '';
let nextScheduledPostAt = 0;

// Consistent watercolor style
const WATERCOLOR_STYLE = `Traditional watercolor painting with these exact characteristics:
- Visible brush strokes and paper texture
- Wet-on-wet technique with intentional bleeding
- Color palette: VERY muted and desaturated - pale ochre, light taupe, soft beige, dusty rose, faded sage green, weathered terracotta, all colors heavily diluted with water
- Strong natural window light creating dramatic shadows
- Large areas of pure white (unpainted paper) for highlights
- Soft shadow washes in pale grays and diluted blues
- Soft edges, atmospheric washes
- Minimal but intentional details
- Serene, contemplative mood
- Overall impression: faded, gentle, low saturation`;

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

// List of philosophers for quote selection
const PHILOSOPHERS = [
  "Socrates",
  "Plato",
  "Aristotle",
  "Marcus Aurelius",
  "Seneca",
  "Epictetus",
  "Confucius",
  "Laozi",
  "Diogenes",
  "Heraclitus",
  "Zeno of Citium",
  "Pythagoras",
  "Plotinus",
  "Hypatia",
  "Simone Weil",
  "Immanuel Kant",
  "Friedrich Nietzsche",
  "Baruch Spinoza",
  "David Hume",
  "John Stuart Mill",
  "Hannah Arendt",
  "Simone de Beauvoir",
  "Ludwig Wittgenstein",
  "Jean-Paul Sartre",
  "Albert Camus",
  "Blaise Pascal"
];

// State
let postsInCurrentCycle = 0;
let imagesInCurrentCycle = 0;
let lastPostTime = 0;
let totalPosts = 0;
let imagePosts = 0;
let textPosts = 0;
let instagramPosts = 0;
let philosopherPosts = 0;
let philosopherBioPosts = 0;
let lastContentType: 'quote' | 'bio' | 'wisdom' | 'philosophical' | null = null;
let postedQuotes: Set<string> = new Set();
let postedBioPhilosophers: Set<string> = new Set();
let recentPostedContent: string[] = [];

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
      instagramPosts,
      lastPostTime,
      currentSceneIndex,
      philosopherPosts,
      philosopherBioPosts,
      lastContentType,
      postedQuotes: Array.from(postedQuotes),
      postedBioPhilosophers: Array.from(postedBioPhilosophers),
      recentPostedContent,
      postsToday,
      currentDayKey,
      nextScheduledPostAt,
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
      instagramPosts = state.instagramPosts || 0;
      lastPostTime = state.lastPostTime || 0;
      currentSceneIndex = state.currentSceneIndex || 0;
      philosopherPosts = state.philosopherPosts || 0;
      philosopherBioPosts = state.philosopherBioPosts || 0;
      lastContentType = state.lastContentType || null;
      postedQuotes = new Set(state.postedQuotes || []);
      postedBioPhilosophers = new Set(state.postedBioPhilosophers || []);
      recentPostedContent = state.recentPostedContent || [];
      postsToday = state.postsToday || 0;
      currentDayKey = state.currentDayKey || '';
      nextScheduledPostAt = state.nextScheduledPostAt || 0;
      console.log('✅ State loaded:', {
        totalPosts,
        imagePosts,
        textPosts,
        instagramPosts,
        postsInCycle: postsInCurrentCycle,
        imagesInCycle: imagesInCurrentCycle,
        philosopherPosts,
        philosopherBioPosts,
        lastContentType,
        uniqueQuotes: postedQuotes.size,
        uniqueBioPhilosophers: postedBioPhilosophers.size,
        recentPostedContentCount: recentPostedContent.length,
        postsToday,
        currentDayKey,
        nextScheduledPostAt,
      });
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

const WISDOM_TOPICS = [
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

const PHILOSOPHICAL_TOPICS = [
  "virtue vs pleasure",
  "freedom and responsibility",
  "ego and identity",
  "meaning without certainty",
  "discipline as self-respect",
  "suffering and interpretation",
  "truth-seeking vs approval",
  "character built in private"
];

let currentPhilosophicalTopicIndex = 0;

function getNextPhilosophicalTopic(): string {
  const topic = PHILOSOPHICAL_TOPICS[currentPhilosophicalTopicIndex];
  currentPhilosophicalTopicIndex = (currentPhilosophicalTopicIndex + 1) % PHILOSOPHICAL_TOPICS.length;
  return topic;
}

// --- Scheduling helpers ---
function getLocalDayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getScheduledPostsForToday(date: Date = new Date()): number {
  const posts = WEEKLY_POST_SCHEDULE[date.getDay()] ?? 3;
  return Math.min(posts, MAX_POSTS_PER_DAY);
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRemainingPostsToday(now: Date = new Date()): number {
  const target = getScheduledPostsForToday(now);
  return Math.max(0, target - postsToday);
}

function getTomorrowStart(now: Date = new Date()): Date {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

function scheduleNextPostTime(now: Date = new Date()): number {
  const remainingPosts = getRemainingPostsToday(now);
  if (remainingPosts <= 0) {
    return getTomorrowStart(now).getTime() + getRandomInt(45, 180) * 60 * 1000;
  }

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 0, 0, 0);
  const remainingWindow = Math.max(60 * 60 * 1000, endOfDay.getTime() - now.getTime());
  const averageGap = Math.max(45 * 60 * 1000, Math.floor(remainingWindow / remainingPosts));
  const jitter = Math.floor(averageGap * 0.35);
  const minGap = Math.max(35 * 60 * 1000, averageGap - jitter);
  const maxGap = averageGap + jitter;
  return now.getTime() + getRandomInt(minGap, maxGap);
}

function ensureDailySchedule(now: Date = new Date()): void {
  const todayKey = getLocalDayKey(now);
  if (currentDayKey !== todayKey) {
    currentDayKey = todayKey;
    postsToday = 0;
    postsInCurrentCycle = 0;
    imagesInCurrentCycle = 0;
    philosopherPosts = 0;
    philosopherBioPosts = 0;
    lastContentType = null;
    nextScheduledPostAt = scheduleNextPostTime(now);
    console.log(`📅 New day detected (${todayKey}). Target posts today: ${getScheduledPostsForToday(now)}`);
    saveState();
  }
}

function shouldPostWithImage(): boolean {
  if (postsInCurrentCycle >= POSTS_PER_CYCLE) {
    postsInCurrentCycle = 0;
    imagesInCurrentCycle = 0;
    philosopherPosts = 0;
    philosopherBioPosts = 0;
    lastContentType = null;
    console.log("📊 New content cycle started");
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

function truncateTweet(text: string, maxLength: number = 25000): string {
  if (text.length <= maxLength) return text;
  console.log(`⚠️ Text too long (${text.length} chars), truncating to ${maxLength}...`);
  return text.substring(0, maxLength - 3) + '...';
}

function toUnicodeBold(input: string): string {
  // Unicode Mathematical Bold (A–Z, a–z, 0–9)
  const A = 'A'.charCodeAt(0);
  const Z = 'Z'.charCodeAt(0);
  const a = 'a'.charCodeAt(0);
  const z = 'z'.charCodeAt(0);
  const zero = '0'.charCodeAt(0);
  const nine = '9'.charCodeAt(0);

  const boldA = 0x1D400; // 𝐀
  const bolda = 0x1D41A; // 𝐚
  const bold0 = 0x1D7CE; // 𝟎

  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= A && code <= Z) out += String.fromCodePoint(boldA + (code - A));
    else if (code >= a && code <= z) out += String.fromCodePoint(bolda + (code - a));
    else if (code >= zero && code <= nine) out += String.fromCodePoint(bold0 + (code - zero));
    else out += ch;
  }
  return out;
}

function normalizeGeneratedContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'’]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function getTokenSet(text: string): Set<string> {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by',
    'is', 'are', 'be', 'this', 'that', 'it', 'as', 'from', 'into', 'your', 'you', 'when', 'not'
  ]);

  return new Set(
    normalizeGeneratedContent(text)
      .split(' ')
      .filter(token => token.length > 2 && !stopwords.has(token))
  );
}

function contentTooSimilar(candidate: string, history: string[]): boolean {
  const normalizedCandidate = normalizeGeneratedContent(candidate);
  if (!normalizedCandidate) return true;

  for (const previous of history) {
    const normalizedPrevious = normalizeGeneratedContent(previous);
    if (!normalizedPrevious) continue;

    if (normalizedCandidate === normalizedPrevious) {
      return true;
    }

    const candidateTokens = getTokenSet(candidate);
    const previousTokens = getTokenSet(previous);

    if (candidateTokens.size === 0 || previousTokens.size === 0) continue;

    let intersection = 0;
    for (const token of candidateTokens) {
      if (previousTokens.has(token)) intersection++;
    }

    const union = new Set([...candidateTokens, ...previousTokens]).size;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity >= 0.65) {
      return true;
    }
  }

  return false;
}

function getRecentContentGuidance(): string {
  if (recentPostedContent.length === 0) return '';

  const recentExamples = recentPostedContent
    .slice(-5)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');

  return `\n\nAvoid repeating or closely paraphrasing these recent posts:\n${recentExamples}`;
}

function rememberPostedContent(text: string): void {
  recentPostedContent.push(text.trim());
  if (recentPostedContent.length > 30) {
    recentPostedContent = recentPostedContent.slice(-30);
  }
}

// Post a philosopher biography
async function postPhilosopherBio(): Promise<boolean> {
    if (postedBioPhilosophers.size >= PHILOSOPHERS.length) {
    console.log("🔄 All philosophers have been used for bio posts. Resetting bio philosopher history.");
    postedBioPhilosophers.clear();
  }

  const availablePhilosophers = PHILOSOPHERS.filter(name => !postedBioPhilosophers.has(name));
  const philosopherName = availablePhilosophers[Math.floor(Math.random() * availablePhilosophers.length)];
  console.log(`📚 Creating BIO post about: ${philosopherName}`);

  const prompt = `Create a "Be like" post about ${philosopherName} in a punchy milestone list.

Output format (strict):
- First line must be exactly: Be like ${philosopherName}.
- Then 8 to 12 bullet lines, each starting with the character > followed by a space.
  Example:
  > Short milestone.

Style requirements (strict):
- NO dates, years, centuries, BCE/CE, or numeric time ranges. Do not write any years like 1724, 399 BCE, 450s, etc.
- Do not start lines with dates. If you mention time at all, use words only (e.g., "early life", "later", "in exile", "near the end").
- Each bullet must be a concrete milestone: origin/early life, education, turning point, major works, core idea, controversy, influence/legacy.
- Keep each bullet short (ideally 8–14 words).
- Neutral tone; no slang; never use the word "bro".
- No hashtags. No emojis.

Return only the first line + bullet list. Nothing else.`;

try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 400,
      messages: [{ role: "user", content: prompt }]
    });

    let tweetText = response.choices[0].message.content?.trim() || "";

    // Enforce formatting: bold header + > bullets
const lines = tweetText
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l.length > 0);

const plainHeader = `Be like ${philosopherName}.`;

if (lines.length === 0) lines.push(plainHeader);

// Ensure header exists and is correct
if (!lines[0].toLowerCase().startsWith('be like')) lines.unshift(plainHeader);
else lines[0] = plainHeader;

// Convert any numbered/dashed/bulleted lines to `> ` bullets
for (let i = 1; i < lines.length; i++) {
  let l = lines[i];
  l = l.replace(/^\d+\)\s*/, '');   // 1) ...
  l = l.replace(/^[-•]\s*/, '');    // - ... / • ...
  l = l.replace(/^>\s*/, '');       // > ...
  lines[i] = `> ${l}`;
}

// Bold the header visually (Unicode bold)
lines[0] = toUnicodeBold(lines[0]);

tweetText = lines.join('\n');

    if (!tweetText || tweetText.length < 40) {
      console.log(`❌ Bio attempt ${attempt}: generated text too short/empty`);
      continue;
    }

        if (contentTooSimilar(tweetText, recentPostedContent.slice(-8))) {
      console.log(`⚠️ Bio attempt ${attempt}: text too similar to recent posts, retrying...`);
      if (attempt === 1) {
        continue;
      }
    }

    const hasHeader = tweetText.startsWith(toUnicodeBold(`Be like ${philosopherName}.`));
    const hasDates =
      /\b\d{3,4}\b/.test(tweetText) ||               // 1724, 399, etc.
      /\b(bce|ce|bc|ad)\b/i.test(tweetText) ||       // BCE/CE/BC/AD
      /\b\d{2,4}s\b/.test(tweetText) ||              // 450s
      /\b\d+–\d+\b/.test(tweetText) ||               // 1740–1746
      /\b\d+-\d+\b/.test(tweetText); 
      
      const bulletLines = tweetText.split(/\r?\n/).slice(1).filter(l => l.trim().length > 0);
const bulletsOk = bulletLines.length >= 6 && bulletLines.every(l => l.trim().startsWith('> '));// 1740-1746

    if (!hasHeader || hasDates || !bulletsOk) {
      console.log(`⚠️ Bio attempt ${attempt}: invalid format (header=${hasHeader}, dates=${hasDates}, bullets=${bulletsOk}).`);
      if (attempt === 1) {
        console.log("🔁 Regenerating bio once...");
        continue;
      }
    }

    console.log(`📏 Bio length: ${tweetText.length} chars`);
    console.log(`📄 Bio text: ${tweetText}`);

    const result = await twitterClient.v2.tweet(tweetText);
    console.log("✅ Bio tweet posted! ID:", result.data.id);

    rememberPostedContent(tweetText);
    postedBioPhilosophers.add(philosopherName);
    philosopherBioPosts++;
    totalPosts++;
    textPosts++;
    postsInCurrentCycle++;
    lastPostTime = Date.now();
    saveState();

    return true;
  }

  console.log("❌ Bio generation failed validation after 2 attempts");
  return false;

} catch (error: any) {
  console.error("❌ Bio post error:", error.message);
  if (error.data) console.error("   → API response:", JSON.stringify(error.data));
  return false;
}
}

function isValidPhilosopherQuote(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  const invalidPhrases = [
    "i'm sorry",
    "i apologize",
    "no surviving quotes",
    "no known quotes",
    "no recorded quotes",
    "cannot find",
    "unable to provide",
    "don't have",
    "not available"
  ];
  
  for (const phrase of invalidPhrases) {
    if (lowerText.includes(phrase)) {
      console.log(`❌ Invalid quote detected: contains "${phrase}"`);
      return false;
    }
  }
  
  if (!text.includes('"')) {
    console.log('❌ Invalid quote: missing quotation marks');
    return false;
  }
  
  if (!text.includes('—') && !text.includes(' - ')) {
    console.log('❌ Invalid quote: missing attribution');
    return false;
  }
  
  return true;
}

function normalizeQuote(text: string): string {
  const quoteMatch = text.match(/"([^"]+)"/);
  if (quoteMatch) {
    return quoteMatch[1].toLowerCase().trim();
  }
  return text.toLowerCase().trim();
}

async function postTextOnly(isPhilosopherQuote: boolean = false, topicOverride?: string): Promise<boolean> {
  let topic = "";
  let promptContent = "";
  let isPhilosopher = isPhilosopherQuote;
  let philosopherName = "";
  
  if (isPhilosopher) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      philosopherName = PHILOSOPHERS[Math.floor(Math.random() * PHILOSOPHERS.length)];
      console.log(`📝 Creating PHILOSOPHER QUOTE post (${philosopherPosts + 1}/${PHILOSOPHER_QUOTES_PER_DAY}) from: ${philosopherName} (attempt ${attempt}/3)`);

      promptContent = `Output one short modern framing sentence (max 12 words) that connects the quote to a present-day personal growth struggle.

Then output a single authentic, well-known quote by ${philosopherName}.

Format strictly as:

[framing sentence]

"[quote text]"

🌿 ${philosopherName}

Important: The entire response must be under 1000 characters total.
Return ONLY the formatted result. No commentary. No explanations.`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_completion_tokens: 150,
          messages: [{
            role: "user",
            content: promptContent
          }]
        });

        let tweetText = response.choices[0].message.content?.trim() || '';
        console.log(`📏 Quote length: ${tweetText.length} chars`);
        console.log("Generated text:", tweetText);

        if (!tweetText || tweetText.length < 10) {
          console.log("❌ Failed to generate tweet text");
          continue;
        }

        if (contentTooSimilar(tweetText, recentPostedContent.slice(-8))) {
          console.log(`⚠️ Quote attempt ${attempt}: text too similar to recent posts, retrying...`);
          continue;
        }

        if (!isValidPhilosopherQuote(tweetText)) {
          console.log(`⚠️ Invalid quote on attempt ${attempt}, retrying...`);
          continue;
        }

        const normalizedQuote = normalizeQuote(tweetText);
        if (postedQuotes.has(normalizedQuote)) {
          console.log(`⚠️ Duplicate quote detected on attempt ${attempt}, retrying...`);
          continue;
        }

        // Enforce limit before posting
        tweetText = truncateTweet(tweetText);

        // Add author formatting with leaf emoji
        tweetText = `${tweetText}\n\n🌿 ${philosopherName}`;

        const result = await twitterClient.v2.tweet(tweetText);
        console.log("✅ Tweet posted! ID:", result.data.id);

        rememberPostedContent(tweetText);
        postedQuotes.add(normalizedQuote);
        lastPostTime = Date.now();
        totalPosts++;
        textPosts++;
        postsInCurrentCycle++;
        philosopherPosts++;
        saveState();
        return true;

      } catch (error: any) {
        console.error(`❌ Error on attempt ${attempt}:`, error.message);
        if (error.data) console.error("   → API response:", JSON.stringify(error.data));
        if (attempt === 3) {
          console.error("❌ All 3 attempts failed");
          return false;
        }
      }
    }

    return false;
  } else {
    topic = topicOverride ?? getNextWisdomTopic();
    console.log(`📝 Creating text post about: ${topic}`);
    promptContent = `Write a tweet about: ${topic}. Practical advice, no hashtags. Stay under 500 characters.`;
    
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_completion_tokens: 150,
          messages: [{
            role: "user",
            content: `${promptContent}${getRecentContentGuidance()}\n\nMake this meaningfully different in wording and angle from the recent posts above.`
          }]
        });

        let tweetText = response.choices[0].message.content?.trim() || '';
        console.log(`📏 Text length: ${tweetText.length} chars`);
        console.log(`Generated text (attempt ${attempt}):`, tweetText);

        if (!tweetText || tweetText.length < 10) {
          console.log(`❌ Wisdom attempt ${attempt}: failed to generate tweet text`);
          continue;
        }

        if (contentTooSimilar(tweetText, recentPostedContent.slice(-8))) {
          console.log(`⚠️ Wisdom attempt ${attempt}: text too similar to recent posts, retrying...`);
          continue;
        }

        tweetText = truncateTweet(tweetText);

        const result = await twitterClient.v2.tweet(tweetText);
        console.log("✅ Tweet posted! ID:", result.data.id);

        rememberPostedContent(tweetText);
        lastPostTime = Date.now();
        totalPosts++;
        textPosts++;
        postsInCurrentCycle++;
        saveState();
        return true;
      }

      console.log("❌ Wisdom post generation failed after 3 attempts");
      return false;
    } catch (error: any) {
      console.error("❌ Twitter API error:", error.message);
      if (error.data) console.error("   → API response:", JSON.stringify(error.data));
      return false;
    }
  }
}

async function postWithImage(topicOverride?: string): Promise<boolean> {
  const topic = topicOverride ?? getNextPhilosophicalTopic();
  console.log(`🖼️ Creating image post about: ${topic}`);
  
  try {
    const sceneDescription = getNextScene();
    
    const imagePromptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 200,
      messages: [{
        role: "user",
        content: `${WATERCOLOR_STYLE}

Scene to paint: ${sceneDescription}

Write a single detailed sentence describing this exact scene in watercolor style. Focus on light, shadows, and the peaceful atmosphere.`
      }]
    });
    
    const imagePrompt = imagePromptResponse.choices[0].message.content?.trim() || 'peaceful watercolor interior scene with window light';
    console.log("Image prompt:", imagePrompt);
    
    let tweetText = '';
    let captionOk = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const tweetResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 100,
        messages: [{
          role: "user",
          content: `Write a tweet about: ${topic}. Practical advice, no hashtags. Stay under 500 characters.${getRecentContentGuidance()}\n\nMake this meaningfully different in wording and angle from the recent posts above.`
        }]
      });

      tweetText = tweetResponse.choices[0].message.content?.trim() || '';
      console.log(`📏 Image tweet length: ${tweetText.length} chars`);
      console.log(`Generated image text (attempt ${attempt}):`, tweetText);

      if (!tweetText || tweetText.length < 10) {
        console.log(`❌ Image caption attempt ${attempt}: failed to generate tweet text`);
        continue;
      }

      if (contentTooSimilar(tweetText, recentPostedContent.slice(-8))) {
        console.log(`⚠️ Image caption attempt ${attempt}: text too similar to recent posts, retrying...`);
        continue;
      }

      captionOk = true;
      break;
    }

    if (!captionOk) {
      console.log("❌ Failed to generate a sufficiently distinct image caption after 3 attempts");
      return false;
    }

    tweetText = truncateTweet(tweetText);
    
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
    
    const mediaWorker = wisdom_agent.workers.find(w => w.id === "twitter_media_worker");
    if (!mediaWorker) {
      console.log("❌ Media worker not found");
      return false;
    }
    
    const postResult = await mediaWorker.functions
      .find(f => f.name === 'upload_image_and_tweet')
      ?.executable({ text: tweetText, image_url: imageUrl }, (msg: string) => console.log(`[Twitter] ${msg}`));
    
    if (postResult?.status !== 'done') {
      console.log("❌ Failed to post to Twitter - Status:", postResult?.status);
      return false;
    }
    
    console.log("✅ Twitter post successful!");
    rememberPostedContent(tweetText);
    
    try {
      console.log("📸 Preparing Instagram post...");
      
      const imageBufferResponse = await fetch(imageUrl);
      const imageArrayBuffer = await imageBufferResponse.arrayBuffer();
      const imageBuffer = Buffer.from(imageArrayBuffer);
      
      console.log("🔗 Uploading to image host...");
      const uploadResult = await imageHostPlugin.uploadImage(imageBuffer, `post_${Date.now()}`);
      
      if (!uploadResult.success || !uploadResult.url) {
        console.log("⚠️ Image upload failed, skipping Instagram");
      } else {
        console.log("✅ Image hosted at:", uploadResult.url);
        
        const instagramWorker = wisdom_agent.workers.find(w => w.id === "instagram_worker");
        if (instagramWorker) {
          let instagramSuccess = false;
          
          for (let attempt = 1; attempt <= INSTAGRAM_MAX_RETRIES && !instagramSuccess; attempt++) {
            try {
              if (attempt > 1) {
                console.log(`🔄 Instagram retry attempt ${attempt}/${INSTAGRAM_MAX_RETRIES}...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
              
              const instagramResult = await instagramWorker.functions
                .find(f => f.name === 'post_to_instagram')
                ?.executable(
                  { imageUrl: uploadResult.url, caption: tweetText }, 
                  (msg: string) => console.log(`[Instagram] ${msg}`)
                );
              
              if (instagramResult?.status === 'done') {
                console.log("✅ Instagram post successful!");
                instagramPosts++;
                instagramSuccess = true;
              } else {
                console.log(`⚠️ Instagram post attempt ${attempt} failed`);
              }
            } catch (retryError: any) {
              console.log(`⚠️ Instagram attempt ${attempt} error: ${retryError.message}`);
            }
          }
          
          if (!instagramSuccess) {
            console.log("❌ Instagram post failed after all retries");
          }
        }
      }
    } catch (instagramError: any) {
      console.log("⚠️ Instagram posting error (continuing anyway):", instagramError.message);
    }
    
    lastPostTime = Date.now();
    totalPosts++;
    imagePosts++;
    imagesInCurrentCycle++;
    postsInCurrentCycle++;
    saveState();
    return true;
  } catch (error: any) {
    console.error("❌ Image post error:", error.message);
    if (error.data) console.error("   → API response:", JSON.stringify(error.data));
    return false;
  }
}

async function postPhilosophicalInsight(topicOverride?: string): Promise<boolean> {
  const topic = topicOverride ?? getNextPhilosophicalTopic();
  console.log(`🧠 Creating philosophical post about: ${topic}`);

  const promptContent = `Write a philosophical tweet about: ${topic}.

Rules:
- 1-2 sentences
- reflective and intellectually grounded
- no hashtags
- no emojis
- do NOT quote any philosopher
- stay under 500 characters
Return only the tweet text.`;

  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 150,
        messages: [{
          role: "user",
          content: `${promptContent}${getRecentContentGuidance()}\n\nMake this meaningfully different in wording and angle from the recent posts above.`
        }]
      });

      let tweetText = response.choices[0].message.content?.trim() || '';
      console.log(`📏 Philosophical tweet length: ${tweetText.length} chars`);
      console.log(`Generated philosophical text (attempt ${attempt}):`, tweetText);

      if (!tweetText || tweetText.length < 10) {
        console.log(`❌ Philosophical attempt ${attempt}: failed to generate text`);
        continue;
      }

      if (contentTooSimilar(tweetText, recentPostedContent.slice(-8))) {
        console.log(`⚠️ Philosophical attempt ${attempt}: text too similar to recent posts, retrying...`);
        continue;
      }

      tweetText = truncateTweet(tweetText);

      const result = await twitterClient.v2.tweet(tweetText);
      console.log("✅ Philosophical tweet posted! ID:", result.data.id);

      rememberPostedContent(tweetText);
      lastPostTime = Date.now();
      totalPosts++;
      textPosts++;
      postsInCurrentCycle++;
      saveState();
      return true;
    }

    console.log("❌ Philosophical post generation failed after 3 attempts");
    return false;
  } catch (error: any) {
    console.error("❌ Philosophical post error:", error.message);
    if (error.data) console.error("   → API response:", JSON.stringify(error.data));
    return false;
  }
}

async function attemptPost(): Promise<void> {
  const now = new Date();
  ensureDailySchedule(now);

  const todayTarget = getScheduledPostsForToday(now);
  if (postsToday >= todayTarget) {
    if (!nextScheduledPostAt || nextScheduledPostAt <= now.getTime()) {
      nextScheduledPostAt = scheduleNextPostTime(now);
      saveState();
    }
    const minutesRemaining = Math.max(1, Math.round((nextScheduledPostAt - now.getTime()) / 60000));
    console.log(`📭 Daily quota reached (${postsToday}/${todayTarget}). Next scheduled window in ${minutesRemaining} minutes`);
    return;
  }

  if (!nextScheduledPostAt) {
    nextScheduledPostAt = scheduleNextPostTime(now);
    saveState();
  }

  if (now.getTime() < nextScheduledPostAt) {
    const minutesRemaining = Math.max(1, Math.round((nextScheduledPostAt - now.getTime()) / 60000));
    console.log(`⏰ Next irregular post window in ${minutesRemaining} minutes`);
    return;
  }

  console.log("📢 Time to post!");
  let success = false;

  const useImage = shouldPostWithImage();

  if (useImage) {
    const useWisdomTopic = Math.random() < 0.5;

    if (useWisdomTopic) {
      const topic = getNextWisdomTopic();
      console.log(`🎨 Posting DAILY IMAGE (wisdom): ${topic}`);
      success = await postWithImage(topic);
      if (!success) {
        console.log("⚠️ Image post failed, trying text-only wisdom...");
        success = await postTextOnly(false, topic);
      }
      if (success) lastContentType = 'wisdom';
    } else {
      const topic = getNextPhilosophicalTopic();
      console.log(`🎨 Posting DAILY IMAGE (philosophical): ${topic}`);
      success = await postWithImage(topic);
      if (!success) {
        console.log("⚠️ Image post failed, trying text-only philosophical...");
        success = await postPhilosophicalInsight(topic);
      }
      if (success) lastContentType = 'philosophical';
    }

  } else {
    const contentOptions: Array<{
      type: 'quote' | 'bio' | 'wisdom' | 'philosophical';
      weight: number;
    }> = [
      { type: 'quote', weight: 0.25 },
      { type: 'bio', weight: 0.50 },
      { type: 'wisdom', weight: 0.125 },
      { type: 'philosophical', weight: 0.125 }
    ];

    let allowedOptions = contentOptions.filter(option => option.type !== lastContentType);
    if (allowedOptions.length === 0) {
      allowedOptions = contentOptions;
    }

    const totalWeight = allowedOptions.reduce((sum, option) => sum + option.weight, 0);
    let roll = Math.random() * totalWeight;
    let selectedType: 'quote' | 'bio' | 'wisdom' | 'philosophical' = allowedOptions[0].type;

    for (const option of allowedOptions) {
      if (roll < option.weight) {
        selectedType = option.type;
        break;
      }
      roll -= option.weight;
    }

    if (selectedType === 'quote') {
      console.log(`🔮 Posting philosopher quote`);
      success = await postTextOnly(true);
      if (success) lastContentType = 'quote';
    } else if (selectedType === 'bio') {
      console.log(`📚 Posting philosopher biography`);
      success = await postPhilosopherBio();
      if (success) lastContentType = 'bio';
    } else if (selectedType === 'wisdom') {
      const topic = getNextWisdomTopic();
      console.log(`📘 Posting wisdom topic: ${topic}`);
      success = await postTextOnly(false, topic);
      if (success) lastContentType = 'wisdom';
    } else {
      const topic = getNextPhilosophicalTopic();
      console.log(`🧠 Posting philosophical topic: ${topic}`);
      success = await postPhilosophicalInsight(topic);
      if (success) lastContentType = 'philosophical';
    }
  }

  if (success) {
    postsToday++;
    nextScheduledPostAt = scheduleNextPostTime(new Date());
    saveState();
    const imagePercentage = totalPosts > 0 ? (imagePosts / totalPosts * 100).toFixed(1) : '0.0';
    const todayTargetAfterPost = getScheduledPostsForToday(new Date());
    console.log(`📊 Total: ${totalPosts} posts (${imagePosts} images [${imagePercentage}%], ${textPosts} text, ${instagramPosts} Instagram, ${philosopherPosts}/${PHILOSOPHER_QUOTES_PER_DAY} philosopher, ${philosopherBioPosts}/${PHILOSOPHER_BIO_POSTS_PER_DAY} bio)`);
    console.log(`📅 Today: ${postsToday}/${todayTargetAfterPost} posts completed`);
  }
}

// HTTP Server
const server = http.createServer((request, response) => {
  if (request.url === '/') {
    const imagePercentage = totalPosts > 0 ? (imagePosts / totalPosts * 100).toFixed(1) : '0.0';
    const minutesSincePost = Math.round((Date.now() - lastPostTime) / 60000);
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end(`AIleen Poster Agent

Status: Running
Daily target today: ${getScheduledPostsForToday(new Date())}
Posts today: ${postsToday}
Next irregular slot: ${nextScheduledPostAt ? Math.max(1, Math.round((nextScheduledPostAt - Date.now()) / 60000)) : 'n/a'} minutes

Stats:
- Total Posts: ${totalPosts}
- Image Posts: ${imagePosts} (${imagePercentage}%)
- Text Posts: ${textPosts}
- Instagram Posts: ${instagramPosts}
- Philosopher Posts: ${philosopherPosts}/${PHILOSOPHER_QUOTES_PER_DAY}
- Philosopher Bio Posts: ${philosopherBioPosts}/${PHILOSOPHER_BIO_POSTS_PER_DAY}
- Bio Philosophers Used: ${postedBioPhilosophers.size}/${PHILOSOPHERS.length}
- Last Content Type: ${lastContentType ?? 'none'}
- Recent Content History: ${recentPostedContent.length}
- Unique Quotes: ${postedQuotes.size}
- Cycle: ${postsInCurrentCycle}/${POSTS_PER_CYCLE} posts, ${imagesInCurrentCycle}/${IMAGES_PER_CYCLE} images

Timing:
- Last post: ${minutesSincePost} minutes ago
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

  if (request.url === '/post-bio') {
    postPhilosopherBio()
      .then(success => {
        response.writeHead(success ? 200 : 500, {'Content-Type': 'text/plain'});
        response.end(success ? 'Bio post successful' : 'Bio post failed');
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
    philosopherPosts = 0;
    philosopherBioPosts = 0;
    postsToday = 0;
    currentDayKey = getLocalDayKey(new Date());
    nextScheduledPostAt = scheduleNextPostTime(new Date());
    lastContentType = null;
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
  console.log("- INSTAGRAM_ACCESS_TOKEN:", !!process.env.INSTAGRAM_ACCESS_TOKEN ? "✅" : "❌");
  console.log("- INSTAGRAM_ACCOUNT_ID:", !!process.env.INSTAGRAM_ACCOUNT_ID ? "✅" : "❌");
  console.log("- IMGBB_API_KEY:", !!process.env.IMGBB_API_KEY ? "✅" : "❌");
  console.log(`\n📊 Config: irregular weekly schedule with max ${MAX_POSTS_PER_DAY} posts/day`);
  console.log(`📊 Today target: ${getScheduledPostsForToday(new Date())} posts`);
  console.log(`📊 Cycle: ${IMAGES_PER_CYCLE} image per ${POSTS_PER_CYCLE} posts, ${PHILOSOPHER_QUOTES_PER_DAY} philosopher quotes, ${PHILOSOPHER_BIO_POSTS_PER_DAY} bio\n`);
  
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