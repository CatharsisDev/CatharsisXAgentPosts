"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.createTwitterMediaWorker = void 0;
var game_1 = require("@virtuals-protocol/game");
var axios_1 = require("axios");
var fs = require("fs");
var path = require("path");
var twitter_api_v2_1 = require("twitter-api-v2");
var imageUrlHandler_1 = require("./imageUrlHandler");
// Helper function to check if text resembles a command
function isCommandLike(text) {
    if (!text)
        return false;
    // Check for known function names
    if (text.includes('generate_and_tweet(') ||
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
function containsHashtags(text) {
    return Boolean(text && text.includes('#'));
}
function createTwitterMediaWorker(apiKey, apiSecret, accessToken, accessSecret) {
    var _this = this;
    var twitterClient = new twitter_api_v2_1.TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: accessToken,
        accessSecret: accessSecret
    });
    var tmpDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    function validateAndFixImageUrl(providedUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var storedUrl;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(!providedUrl ||
                            providedUrl.includes("[") ||
                            providedUrl.includes("generated.image") ||
                            !providedUrl.startsWith("https://") ||
                            providedUrl.endsWith("..."))) return [3 /*break*/, 3];
                        console.log("⚠️ Invalid image URL detected:", providedUrl);
                        storedUrl = (0, imageUrlHandler_1.getLastImageUrl)();
                        if (!storedUrl) return [3 /*break*/, 2];
                        console.log("✅ Using stored image URL instead:", storedUrl);
                        return [4 /*yield*/, (0, imageUrlHandler_1.shortenUrl)(storedUrl)];
                    case 1: 
                    // Shorten the URL before returning
                    return [2 /*return*/, _a.sent()];
                    case 2:
                        console.log("❌ No stored URL available");
                        return [2 /*return*/, null];
                    case 3:
                        if (!(providedUrl.length > 500)) return [3 /*break*/, 5];
                        return [4 /*yield*/, (0, imageUrlHandler_1.shortenUrl)(providedUrl)];
                    case 4: return [2 /*return*/, _a.sent()];
                    case 5: return [2 /*return*/, providedUrl];
                }
            });
        });
    }
    var uploadImageAndTweet = new game_1.GameFunction({
        name: "upload_image_and_tweet",
        description: "Upload an image URL and post a tweet with the image properly attached",
        args: [
            { name: "text", description: "The tweet text content" },
            { name: "image_url", description: "The URL of the image to upload" },
        ],
        executable: function (args, logger) { return __awaiter(_this, void 0, void 0, function () {
            var text, image_url, finalImageUrl, mediaBuffer, retryCount, maxRetries, imageResponse, downloadError_1, mediaId, tweet, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 14, , 15]);
                        text = args.text, image_url = args.image_url;
                        // Added logging at beginning
                        console.log("⚠️ TWEET ATTEMPT ⚠️");
                        console.log("Text:", text);
                        console.log("Image URL (first 100 chars):", image_url ? image_url.substring(0, 100) + "..." : "undefined");
                        if (!text) {
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Tweet text is required")];
                        }
                        // Check if text resembles a command
                        if (isCommandLike(text)) {
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Text appears to be a command rather than tweet content. Remove function names and try again.")];
                        }
                        return [4 /*yield*/, validateAndFixImageUrl(image_url)];
                    case 1:
                        finalImageUrl = _a.sent();
                        if (!finalImageUrl) {
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "No valid image URL provided and no stored URL available. Generate an image first.")];
                        }
                        if (containsHashtags(text)) {
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Please remove hashtags from your tweet content as per guidelines.")];
                        }
                        console.log("📸 Final image URL used:", finalImageUrl);
                        // Download with retry logic
                        if (logger)
                            logger("Downloading image from ".concat(finalImageUrl));
                        console.log("📥 Attempting image download...");
                        mediaBuffer = void 0;
                        retryCount = 0;
                        maxRetries = 3;
                        _a.label = 2;
                    case 2:
                        if (!(retryCount < maxRetries)) return [3 /*break*/, 11];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 8, , 10]);
                        return [4 /*yield*/, axios_1["default"].get(finalImageUrl, {
                                responseType: 'arraybuffer',
                                timeout: 15000,
                                maxRedirects: 5,
                                headers: {
                                    'Accept': 'image/jpeg,image/*',
                                    'User-Agent': 'TwitterBot/1.0'
                                }
                            })];
                    case 4:
                        imageResponse = _a.sent();
                        mediaBuffer = Buffer.from(imageResponse.data);
                        console.log("✅ Image downloaded successfully, size:", mediaBuffer.length);
                        if (logger)
                            logger("Created media buffer of size: ".concat(mediaBuffer.length));
                        if (!(!mediaBuffer || mediaBuffer.length < 1024)) return [3 /*break*/, 7];
                        if (!(retryCount >= maxRetries - 1)) return [3 /*break*/, 5];
                        throw new Error("Downloaded image too small (".concat((mediaBuffer === null || mediaBuffer === void 0 ? void 0 : mediaBuffer.length) || 0, " bytes) - possible download failure."));
                    case 5:
                        retryCount++;
                        console.log("\uD83D\uDD04 Retry ".concat(retryCount, "/").concat(maxRetries, ": Image too small"));
                        if (logger)
                            logger("Retry ".concat(retryCount, "/").concat(maxRetries, ": Image too small"));
                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 1000); })];
                    case 6:
                        _a.sent(); // Wait 1s between retries
                        return [3 /*break*/, 2];
                    case 7: return [3 /*break*/, 11]; // Success - exit retry loop
                    case 8:
                        downloadError_1 = _a.sent();
                        console.error("❌ Image download error:", downloadError_1.message);
                        if (retryCount >= maxRetries - 1) {
                            throw downloadError_1;
                        }
                        retryCount++;
                        console.log("\uD83D\uDD04 Retry ".concat(retryCount, "/").concat(maxRetries, " after error"));
                        if (logger)
                            logger("Retry ".concat(retryCount, "/").concat(maxRetries, " after error: ").concat(downloadError_1.message));
                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 1000); })];
                    case 9:
                        _a.sent(); // Wait 1s between retries
                        return [3 /*break*/, 10];
                    case 10: return [3 /*break*/, 2];
                    case 11:
                        // Upload to Twitter
                        console.log("📤 Uploading image to Twitter...");
                        if (logger)
                            logger("Uploading image to Twitter");
                        return [4 /*yield*/, twitterClient.v1.uploadMedia(mediaBuffer, {
                                mimeType: 'image/jpeg'
                            })];
                    case 12:
                        mediaId = _a.sent();
                        console.log("✅ Image uploaded to Twitter, media ID:", mediaId);
                        // Post tweet with media
                        console.log("📝 Posting tweet with media...");
                        if (logger)
                            logger('Posting tweet with attached media');
                        return [4 /*yield*/, twitterClient.v2.tweet(text, {
                                media: { media_ids: [mediaId] }
                            })];
                    case 13:
                        tweet = _a.sent();
                        console.log("🎉 SUCCESS: Tweet posted with ID:", tweet.data.id);
                        if (logger)
                            logger("Successfully posted tweet: ".concat(tweet.data.id));
                        return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, "Tweet posted successfully with media: ".concat(tweet.data.id))];
                    case 14:
                        error_1 = _a.sent();
                        console.error('❌ DETAILED ERROR:', JSON.stringify(error_1, null, 2));
                        console.error('Error posting tweet with media:', error_1);
                        return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Failed to post tweet with media: ".concat((error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || 'Unknown error'))];
                    case 15: return [2 /*return*/];
                }
            });
        }); }
    });
    // Combined function that handles both image generation and tweet posting
    var generateAndTweet = new game_1.GameFunction({
        name: "generate_and_tweet",
        description: "Generate an image and immediately post a tweet with it in a single step",
        args: [
            { name: "prompt", description: "The image generation prompt" },
            { name: "tweet_text", description: "The tweet text content" },
            { name: "width", description: "Width of generated image (optional)", "default": 768 },
            { name: "height", description: "Height of generated image (optional)", "default": 768 }
        ],
        executable: function (args, logger) { return __awaiter(_this, void 0, void 0, function () {
            var prompt_1, tweet_text, _a, width, _b, height, imageGenWorker, workers, generateImageFunction, genResult, imageUrl, feedbackMessage, urlMatch, resultStr, urlMatches, shortImageUrl, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 4, , 5]);
                        prompt_1 = args.prompt, tweet_text = args.tweet_text, _a = args.width, width = _a === void 0 ? 768 : _a, _b = args.height, height = _b === void 0 ? 768 : _b;
                        if (!prompt_1 || !tweet_text) {
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Both image prompt and tweet text are required")];
                        }
                        // Check if tweet text resembles a command
                        if (isCommandLike(tweet_text)) {
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Tweet text appears to be a command rather than content. Remove function names and try again.")];
                        }
                        if (containsHashtags(tweet_text)) {
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Please remove hashtags from your tweet content as per guidelines.")];
                        }
                        console.log("🔄 Combined generate_and_tweet starting...");
                        console.log("Using image dimensions: ".concat(width, "x").concat(height));
                        if (logger)
                            logger("Starting combined image generation and tweet posting with dimensions ".concat(width, "x").concat(height));
                        imageGenWorker = null;
                        // Try to find through any available context methods
                        if (typeof global !== 'undefined' && global.activeAgent && global.activeAgent.workers) {
                            workers = global.activeAgent.workers;
                            imageGenWorker = workers.find(function (w) {
                                return (w.id && w.id.includes('image_gen')) ||
                                    (w.name && typeof w.name === 'string' && w.name.includes('Image Generator'));
                            });
                            console.log("Found image gen worker through global context");
                        }
                        if (!imageGenWorker) {
                            console.error("Image generation worker not found");
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Image generation worker not found. Try using generate_image and upload_image_and_tweet separately.")];
                        }
                        generateImageFunction = imageGenWorker.functions.find(function (f) { return f.name === "generate_image"; });
                        if (!generateImageFunction) {
                            console.error("generate_image function not found");
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Image generation function not found. Try using generate_image and upload_image_and_tweet separately.")];
                        }
                        // Generate the image with specified dimensions
                        console.log("\uD83D\uDDBC\uFE0F Generating image with prompt: \"".concat(prompt_1, "\" and dimensions ").concat(width, "x").concat(height));
                        if (logger)
                            logger("Generating image with prompt: ".concat(prompt_1));
                        return [4 /*yield*/, generateImageFunction.executable({ prompt: prompt_1, width: width, height: height }, logger)];
                    case 1:
                        genResult = _c.sent();
                        console.log("Generation result type:", typeof genResult);
                        console.log("Generation result keys:", Object.keys(genResult || {}));
                        imageUrl = null;
                        // Try to extract from feedback_message
                        if (genResult && genResult.feedback_message) {
                            feedbackMessage = genResult.feedback_message;
                            urlMatch = feedbackMessage.match(/URL is: (https:\/\/[^\s]+)/);
                            if (urlMatch && urlMatch[1]) {
                                imageUrl = urlMatch[1];
                                console.log("✅ Extracted URL from feedback_message:", imageUrl);
                                // Store the URL for potential future use
                                (0, imageUrlHandler_1.storeImageUrl)(imageUrl);
                            }
                        }
                        // If not found in feedback, try looking in the entire result
                        if (!imageUrl) {
                            resultStr = JSON.stringify(genResult);
                            urlMatches = resultStr.match(/https:\/\/api\.together\.ai\/imgproxy\/[^"\\]+/);
                            if (urlMatches && urlMatches[0]) {
                                imageUrl = urlMatches[0];
                                console.log("✅ Extracted URL from result string:", imageUrl);
                                // Store the URL for potential future use
                                (0, imageUrlHandler_1.storeImageUrl)(imageUrl);
                            }
                        }
                        if (!imageUrl) {
                            imageUrl = (0, imageUrlHandler_1.getLastImageUrl)();
                            if (imageUrl) {
                                console.log("✅ Using previously stored URL:", imageUrl);
                            }
                        }
                        if (!imageUrl) {
                            console.error("❌ Failed to extract image URL");
                            return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Failed to extract image URL from generation result")];
                        }
                        return [4 /*yield*/, (0, imageUrlHandler_1.shortenUrl)(imageUrl)];
                    case 2:
                        shortImageUrl = _c.sent();
                        console.log("\uD83D\uDCDD Posting tweet with shortened image URL: ".concat(shortImageUrl));
                        if (logger)
                            logger("Posting tweet with shortened URL: ".concat(shortImageUrl));
                        return [4 /*yield*/, uploadImageAndTweet.executable({
                                text: tweet_text,
                                image_url: shortImageUrl
                            }, logger || (function () { }))];
                    case 3: 
                    // Use the existing upload function
                    return [2 /*return*/, _c.sent()];
                    case 4:
                        error_2 = _c.sent();
                        console.error('❌ ERROR in generate_and_tweet:', error_2);
                        return [2 /*return*/, new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Failed to generate and tweet: ".concat((error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || 'Unknown error'))];
                    case 5: return [2 /*return*/];
                }
            });
        }); }
    });
    return new game_1.GameWorker({
        id: "twitter_media_worker",
        name: "Twitter Media Worker",
        description: "Worker that handles Twitter media uploads and posting",
        functions: [uploadImageAndTweet, generateAndTweet]
    });
}
exports.createTwitterMediaWorker = createTwitterMediaWorker;
