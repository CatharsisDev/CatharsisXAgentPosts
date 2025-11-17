import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import { getLastImageUrl, storeImageUrl, shortenUrl } from './imageUrlHandler';

declare global {
  var activeAgent: any;
}

// Helper function to check if text resembles a command
function isCommandLike(text: string): boolean {
  if (!text) return false;
  
  // Check for known function names
  if (
    text.includes('generate_and_tweet(') || 
    text.includes('generate_image(') || 
    text.includes('upload_image_and_tweet(') ||
    text.includes('post_tweet(') ||
    text.includes('get_latest_image_url(') ||
    text.includes('Execute ') ||
    text.includes('function') ||
    /^[a-zA-Z_]+\(['"].+['"]\)/.test(text) // Regex to catch function call patterns
  ) {
    console.log("⚠️ Command-like text detected:", text);
    return true;
  }
  
  return false;
}

function containsHashtags(text?: string): boolean {
  return Boolean(text && text.includes('#'));
}

export function createTwitterMediaWorker(
  apiKey: string, 
  apiSecret: string, 
  accessToken: string, 
  accessSecret: string
): GameWorker {
  const twitterClient = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  const tmpDir = path.resolve(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  async function validateAndFixImageUrl(providedUrl?: string): Promise<string | null> {
    if (!providedUrl || 
        providedUrl.includes("[") || 
        providedUrl.includes("generated.image") ||
        !providedUrl.startsWith("https://") ||
        providedUrl.endsWith("...")) {
      
      console.log("⚠️ Invalid image URL detected:", providedUrl);
      
      // Try to use the stored URL
      const storedUrl = getLastImageUrl();
      if (storedUrl) {
        console.log("✅ Using stored image URL instead:", storedUrl);
        // Shorten the URL before returning
        return await shortenUrl(storedUrl);
      } else {
        console.log("❌ No stored URL available");
        return null;
      }
    }
    
    // URL seems valid but still shorten it if it's too long    
    if (providedUrl.length > 500) {
      return await shortenUrl(providedUrl);
    }
    
    return providedUrl;
  }

  const uploadImageAndTweet = new GameFunction({
    name: "upload_image_and_tweet",
    description: "Upload an image URL and post a tweet with the image properly attached",
    args: [
      { name: "text", description: "The tweet text content" },
      { name: "image_url", description: "The URL of the image to upload" },
    ],
    executable: async (args: {text?: string, image_url?: string}, logger?: ((msg: string) => void) | null) => {
      try {
        const { text, image_url } = args;
        
        // Added logging at beginning
        console.log("⚠️ TWEET ATTEMPT ⚠️");
        console.log("Text:", text);
        console.log("Image URL (first 100 chars):", image_url ? image_url.substring(0, 100) + "..." : "undefined");
        
        if (!text) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Tweet text is required"
          );
        }
        
        // Check if text resembles a command
        if (isCommandLike(text)) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Text appears to be a command rather than tweet content. Remove function names and try again."
          );
        }
        
        // Validate and fix the image URL
        const finalImageUrl = await validateAndFixImageUrl(image_url);
        
        if (!finalImageUrl) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No valid image URL provided and no stored URL available. Generate an image first."
          );
        }

        if (containsHashtags(text)) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Please remove hashtags from your tweet content as per guidelines."
          );
        }
    
        console.log("📸 Final image URL used:", finalImageUrl);
        
        // Download with retry logic
        if (logger) logger(`Downloading image from ${finalImageUrl}`);
        console.log("📥 Attempting image download...");
        
        let mediaBuffer;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            const imageResponse = await axios.get(finalImageUrl, { 
              responseType: 'arraybuffer',
              timeout: 15000,
              maxRedirects: 5,
              headers: {
                'Accept': 'image/jpeg,image/*',
                'User-Agent': 'TwitterBot/1.0'
              }
            });
            
            mediaBuffer = Buffer.from(imageResponse.data);
            console.log("✅ Image downloaded successfully, size:", mediaBuffer.length);
            
            if (logger) logger(`Created media buffer of size: ${mediaBuffer.length}`);
    
            if (!mediaBuffer || mediaBuffer.length < 1024) {
              if (retryCount >= maxRetries - 1) {
                throw new Error(`Downloaded image too small (${mediaBuffer?.length || 0} bytes) - possible download failure.`);
              } else {
                retryCount++;
                console.log(`🔄 Retry ${retryCount}/${maxRetries}: Image too small`);
                if (logger) logger(`Retry ${retryCount}/${maxRetries}: Image too small`);
                await new Promise(r => setTimeout(r, 1000)); // Wait 1s between retries
                continue;
              }
            }
            
            break; // Success - exit retry loop
            
          } catch (downloadError: any) {
            console.error("❌ Image download error:", downloadError.message);
            if (retryCount >= maxRetries - 1) {
              throw downloadError;
            }
            retryCount++;
            console.log(`🔄 Retry ${retryCount}/${maxRetries} after error`);
            if (logger) logger(`Retry ${retryCount}/${maxRetries} after error: ${downloadError.message}`);
            await new Promise(r => setTimeout(r, 1000)); // Wait 1s between retries
          }
        }
    
        // Upload to Twitter
        console.log("📤 Uploading image to Twitter...");
        if (logger) logger(`Uploading image to Twitter`);
        
        // Use mimeType instead of type (per deprecation warning)
        const mediaId = await twitterClient.v1.uploadMedia(mediaBuffer as Buffer, { 
          mimeType: 'image/jpeg' 
        });
        
        console.log("✅ Image uploaded to Twitter, media ID:", mediaId);
        
        // Post tweet with media
        console.log("📝 Posting tweet with media...");
        if (logger) logger('Posting tweet with attached media');
        const tweet = await twitterClient.v2.tweet(text, {
          media: { media_ids: [mediaId] }
        });
    
        console.log("🎉 SUCCESS: Tweet posted with ID:", tweet.data.id);
        if (logger) logger(`Successfully posted tweet: ${tweet.data.id}`);
        
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          `Tweet posted successfully with media: ${tweet.data.id}`
        );
      } catch (error: any) {
        console.error('❌ DETAILED ERROR:', JSON.stringify(error, null, 2));
        console.error('Error posting tweet with media:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Failed to post tweet with media: ${error?.message || 'Unknown error'}`
        );
      }
    }
  });

  // Combined function that handles both image generation and tweet posting
  const generateAndTweet = new GameFunction({
    name: "generate_and_tweet",
    description: "Generate an image and immediately post a tweet with it in a single step",
    args: [
      { name: "prompt", description: "The image generation prompt" },
      { name: "tweet_text", description: "The tweet text content" },
      { name: "width", description: "Width of generated image (optional)", default: 768 },
      { name: "height", description: "Height of generated image (optional)", default: 768 }
    ],
    executable: async (args: {prompt?: string, tweet_text?: string, width?: number, height?: number}, logger?: ((msg: string) => void) | null) => {
      try {
        const { prompt, tweet_text, width = 768, height = 768 } = args;
        
        if (!prompt || !tweet_text) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Both image prompt and tweet text are required"
          );
        }
        
        // Check if tweet text resembles a command
        if (isCommandLike(tweet_text)) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Tweet text appears to be a command rather than content. Remove function names and try again."
          );
        }

        if (containsHashtags(tweet_text)) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Please remove hashtags from your tweet content as per guidelines."
          );
        }
        
        console.log("🔄 Combined generate_and_tweet starting...");
        console.log(`Using image dimensions: ${width}x${height}`);
        if (logger) logger(`Starting combined image generation and tweet posting with dimensions ${width}x${height}`);
        
        // Get all workers from current application context
        let imageGenWorker = null;
        
        // Try to find through any available context methods
        if (typeof global !== 'undefined' && global.activeAgent && global.activeAgent.workers) {
          const workers = global.activeAgent.workers;
          imageGenWorker = workers.find((w: any) => 
            (w.id && w.id.includes('image_gen')) || 
            (w.name && typeof w.name === 'string' && w.name.includes('Image Generator'))
          );
          console.log("Found image gen worker through global context");
        }
        
        if (!imageGenWorker) {
          console.error("Image generation worker not found");
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Image generation worker not found. Try using generate_image and upload_image_and_tweet separately."
          );
        }
        
        // Find the generate_image function
        const generateImageFunction = imageGenWorker.functions.find((f: any) => f.name === "generate_image");
        
        if (!generateImageFunction) {
          console.error("generate_image function not found");
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Image generation function not found. Try using generate_image and upload_image_and_tweet separately."
          );
        }
        
        // Generate the image with specified dimensions
        console.log(`🖼️ Generating image with prompt: "${prompt}" and dimensions ${width}x${height}`);
        if (logger) logger(`Generating image with prompt: ${prompt}`);
        
        const genResult = await generateImageFunction.executable({ prompt, width, height }, logger);
        
        console.log("Generation result type:", typeof genResult);
        console.log("Generation result keys:", Object.keys(genResult || {}));
        
        // Extract URL directly from generation result
        let imageUrl = null;
        
        // Try to extract from feedback_message
        if (genResult && (genResult as any).feedback_message) {
          const feedbackMessage = (genResult as any).feedback_message;
          const urlMatch = feedbackMessage.match(/URL is: (https:\/\/[^\s]+)/);
          if (urlMatch && urlMatch[1]) {
            imageUrl = urlMatch[1];
            console.log("✅ Extracted URL from feedback_message:", imageUrl);
            // Store the URL for potential future use
            storeImageUrl(imageUrl);
          }
        }
        
        // If not found in feedback, try looking in the entire result
        if (!imageUrl) {
          const resultStr = JSON.stringify(genResult);
          const urlMatches = resultStr.match(/https:\/\/api\.together\.ai\/imgproxy\/[^"\\]+/);
          if (urlMatches && urlMatches[0]) {
            imageUrl = urlMatches[0];
            console.log("✅ Extracted URL from result string:", imageUrl);
            // Store the URL for potential future use
            storeImageUrl(imageUrl);
          }
        }
        
        if (!imageUrl) {
          imageUrl = getLastImageUrl();
          if (imageUrl) {
            console.log("✅ Using previously stored URL:", imageUrl);
          }
        }
        
        if (!imageUrl) {
          console.error("❌ Failed to extract image URL");
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Failed to extract image URL from generation result"
          );
        }
        
        // Shorten the URL before tweeting
        const shortImageUrl = await shortenUrl(imageUrl);
        console.log(`📝 Posting tweet with shortened image URL: ${shortImageUrl}`);
        if (logger) logger(`Posting tweet with shortened URL: ${shortImageUrl}`);
        
        // Use the existing upload function
        return await uploadImageAndTweet.executable({
          text: tweet_text,
          image_url: shortImageUrl
        }, logger || (() => {}));
        
      } catch (error: any) {
        console.error('❌ ERROR in generate_and_tweet:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Failed to generate and tweet: ${error?.message || 'Unknown error'}`
        );
      }
    }
  });

  return new GameWorker({
    id: "twitter_media_worker",
    name: "Twitter Media Worker",
    description: "Worker that handles Twitter media uploads and posting",
    functions: [uploadImageAndTweet, generateAndTweet]
  });
}