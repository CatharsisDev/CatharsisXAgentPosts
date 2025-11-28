import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import { createTwitterMediaWorker } from './plugins/twitterMediaPlugin';
import { createEnhancedImageGenPlugin } from './plugins/modifiedImageGenPlugin';
import { createImageUrlHandlerWorker } from './plugins/imageUrlHandler';
import { InstagramPlugin } from "./plugins/instagramPlugin/instagramPlugin";
import dotenv from "dotenv";
dotenv.config();

console.log("API_KEY exists:", !!process.env.API_KEY);
console.log("TOGETHER_API_KEY exists:", !!process.env.TOGETHER_API_KEY);
console.log("INSTAGRAM_ACCESS_TOKEN exists:", !!process.env.INSTAGRAM_ACCESS_TOKEN);
console.log("INSTAGRAM_ACCOUNT_ID exists:", !!process.env.INSTAGRAM_ACCOUNT_ID);

/*
if (!process.env.API_KEY) {
    throw new Error('API_KEY is required in environment variables');
}

if (!process.env.TOGETHER_API_KEY) {
    throw new Error('TOGETHER_API_KEY is required in environment variables');
}

if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN is required in environment variables');
}

if (!process.env.INSTAGRAM_ACCOUNT_ID) {
    throw new Error('INSTAGRAM_ACCOUNT_ID is required in environment variables');
}
*/

const imageGenConfig = {
    id: "wisdom_image_gen",
    name: "Wisdom Image Generator",
    description: "Generates images to accompany wisdom tweets",
    defaultWidth: 768,
    defaultHeight: 768,
    apiClientConfig: {
        apiKey: process.env.TOGETHER_API_KEY || '',
        baseApiUrl: "https://api.together.xyz/v1/images/generations"
    }
};

const enhancedImageGenWorker = createEnhancedImageGenPlugin(imageGenConfig);
const imageUrlHandlerWorker = createImageUrlHandlerWorker();
const twitterMediaWorker = createTwitterMediaWorker(
    process.env.TWITTER_API_KEY!,
    process.env.TWITTER_API_SECRET!,
    process.env.TWITTER_ACCESS_TOKEN!,
    process.env.TWITTER_ACCESS_SECRET!
);
const twitterWorker = twitterPlugin.getWorker();

// Initialize Instagram plugin
const instagramPlugin = new InstagramPlugin({
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN!,
    accountId: process.env.INSTAGRAM_ACCOUNT_ID!,
});
const instagramWorker = instagramPlugin.getWorker();

export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Execute only the specific instruction given to you",
    description: `You execute ONLY the ONE specific instruction given to you.

DO NOT plan ahead.
DO NOT create tasks.
DO NOT think about next steps.

Just do exactly what the current instruction tells you to do.`,

    workers: [
        twitterWorker,
        enhancedImageGenWorker,
        twitterMediaWorker,
        imageUrlHandlerWorker,
        instagramWorker,
    ],
    llmModel: LLMModel.Llama_3_3_70B_Instruct,
    getAgentState: async () => {
        return {
            lastPostTime: Date.now(),
            postsPerStep: 1,
        };
    }
});

wisdom_agent.setLogger((agent: any, msg: string) => {
    console.log(`🧠 [${agent.name}] ${new Date().toISOString()}`);
    console.log(msg);
    console.log("------------------------\n");
});

if (typeof global !== 'undefined') {
    (global as any).activeAgent = wisdom_agent;
}