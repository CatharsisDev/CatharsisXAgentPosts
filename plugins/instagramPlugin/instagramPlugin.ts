import {
  GameWorker,
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game";

interface InstagramConfig {
  accessToken: string;
  accountId: string;
}

export class InstagramPlugin {
  private accessToken: string;
  private accountId: string;
  private readonly API_VERSION = "v21.0";
  private readonly BASE_URL = "https://graph.facebook.com";

  constructor(config: InstagramConfig) {
    this.accessToken = config.accessToken;
    this.accountId = config.accountId;
  }

  private async createMediaContainer(
    imageUrl: string,
    caption: string
  ): Promise<string> {
    const url = `${this.BASE_URL}/${this.API_VERSION}/${this.accountId}/media`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption,
        access_token: this.accessToken,
      }),
    });

    const data:any = await response.json();

    if (data.error) {
      throw new Error(
        `Instagram container creation failed: ${data.error.message}`
      );
    }

    return data.id;
  }

  private async publishMediaContainer(containerId: string): Promise<string> {
    const url = `${this.BASE_URL}/${this.API_VERSION}/${this.accountId}/media_publish`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: this.accessToken,
      }),
    });

    const data: any = await response.json();

    if (data.error) {
      throw new Error(
        `Instagram publish failed: ${data.error.message}`
      );
    }

    return data.id;
  }

  private postToInstagram = new GameFunction({
    name: "post_to_instagram",
    description: "Posts an image with caption to Instagram. Image must be a publicly accessible URL.",
    args: [
      {
        name: "imageUrl",
        description: "Publicly accessible URL of the image (JPEG format)",
      },
      {
        name: "caption",
        description: "Caption text for the Instagram post",
      },
    ],
    executable: async (args: any, logger: (msg: string) => void) => {
      try {
        logger("Creating Instagram media container...");
        const containerId = await this.createMediaContainer(
          args.imageUrl,
          args.caption
        );

        logger(`Container created: ${containerId}`);
        logger("Publishing to Instagram feed...");

        const mediaId = await this.publishMediaContainer(containerId);

        const feedback = `Successfully posted to Instagram: https://www.instagram.com/p/${mediaId}`;
        logger(feedback);

        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          feedback
        );
      } catch (error: any) {
        logger(`Instagram posting error: ${error.message}`);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Failed to post to Instagram: ${error.message}`
        );
      }
    },
  });

  getWorker(): GameWorker {
    return new GameWorker({
      id: "instagram_worker",
      name: "Instagram Publisher",
      description: "Handles posting images and captions to Instagram",
      functions: [this.postToInstagram],
    });
  }
}