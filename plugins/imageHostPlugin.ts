import FormData from "form-data";
import fetch from "node-fetch";

interface ImageHostConfig {
  apiKey: string;
}

interface ImageHostResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export class ImageHostPlugin {
  private apiKey: string;
  private readonly IMGBB_URL = "https://api.imgbb.com/1/upload";

  constructor(config: ImageHostConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Uploads image buffer to ImgBB and returns public URL
   * @param imageBuffer - Buffer containing image data
   * @param name - Optional name for the image
   * @returns Public URL of uploaded image
   */
  async uploadImage(
    imageBuffer: Buffer,
    name?: string
  ): Promise<ImageHostResponse> {
    try {
      const base64Image = imageBuffer.toString("base64");

      const formData = new FormData();
      formData.append("key", this.apiKey);
      formData.append("image", base64Image);
      if (name) {
        formData.append("name", name);
      }

      const response = await fetch(this.IMGBB_URL, {
        method: "POST",
        body: formData,
      });

      const data: any = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || "Image upload failed");
      }

      console.log(`Image uploaded successfully: ${data.data.url}`);

      return {
        success: true,
        url: data.data.url,
      };
    } catch (error: any) {
      console.error("Image upload error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Alternative: Upload image from URL (useful for testing)
   * @param imageUrl - URL of image to upload
   * @returns Public URL of uploaded image
   */
  async uploadFromUrl(imageUrl: string): Promise<ImageHostResponse> {
    try {
      const formData = new FormData();
      formData.append("key", this.apiKey);
      formData.append("image", imageUrl);

      const response = await fetch(this.IMGBB_URL, {
        method: "POST",
        body: formData,
      });

      const data: any = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || "Image upload failed");
      }

      return {
        success: true,
        url: data.data.url,
      };
    } catch (error: any) {
      console.error("Image upload from URL error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}