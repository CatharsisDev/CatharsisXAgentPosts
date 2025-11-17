import ImageGenPlugin from "@virtuals-protocol/game-imagegen-plugin";
import { storeImageUrl, getLastImageUrl } from './imageUrlHandler';

// Default image dimensions
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 1440;

// Create a function to wrap the default image generator with URL capturing
export function createEnhancedImageGenPlugin(config: any) {
  // Set default dimensions in config if not provided
  const enhancedConfig = {
    ...config,
    defaultWidth: config.defaultWidth || DEFAULT_WIDTH,
    defaultHeight: config.defaultHeight || DEFAULT_HEIGHT
  };
  
  // Create the original plugin
  const originalPlugin = new ImageGenPlugin(enhancedConfig);
  
  // Get the original worker
  const originalWorker = originalPlugin.getWorker({});
  
  // Find the generate_image function
  const generateImageFunction = originalWorker.functions.find(f => f.name === "generate_image");
  
  if (!generateImageFunction) {
    throw new Error("Could not find generate_image function in the plugin");
  }
  
  // Wrap the executable function to intercept URLs
  const originalExecutable = generateImageFunction.executable;
  
  generateImageFunction.executable = async (args: any, logger?: any) => {
    // Apply default dimensions if not specified
    const enhancedArgs = {
      ...args,
      width: args.width || enhancedConfig.defaultWidth,
      height: args.height || enhancedConfig.defaultHeight
    };
    
    console.log(`🖼️ Running enhanced image generation with prompt: "${enhancedArgs.prompt}" and dimensions ${enhancedArgs.width}x${enhancedArgs.height}`);
    
    // Call the original function with enhanced args
    const result = await originalExecutable(enhancedArgs, (msg: string) => {
      // Pass through to the original logger
      if (logger) logger(msg);
      
      // Check if the message contains a URL
      if (msg.includes("URL is:")) {
        try {
          const urlMatch = msg.match(/URL is: (https:\/\/[^\s]+)/);
          if (urlMatch && urlMatch[1]) {
            // Store the URL
            storeImageUrl(urlMatch[1]);
          }
        } catch (e) {
          console.error("Error extracting URL from progress message:", e);
        }
      }
    });
    
    // Extract and store URL from the result if present
    try {
      if (result) {
        // Try to extract URL from feedback_message
        if ((result as any).feedback_message && typeof (result as any).feedback_message === 'string') {
          const message = (result as any).feedback_message;
          if (message.includes("URL is:")) {
            const urlMatch = message.match(/URL is: (https:\/\/[^\s]+)/);
            if (urlMatch && urlMatch[1]) {
              storeImageUrl(urlMatch[1]);
            }
          }
        }
        
        // Try to find URL in the entire result string
        const resultStr = JSON.stringify(result);
        const urlMatches = resultStr.match(/https:\/\/api\.together\.ai\/imgproxy\/[^"\\]+/);
        if (urlMatches && urlMatches[0]) {
          storeImageUrl(urlMatches[0]);
        }
      }
    } catch (e) {
      console.error("Error extracting URL from result:", e);
    }
    
    const finalUrl = getLastImageUrl();
    if (finalUrl) {
      console.log("✅ Successfully captured image URL:", finalUrl);
    } else {
      console.warn("⚠️ Failed to capture image URL from response");
    }
    
    return result;
  };
  
  return originalWorker;
}