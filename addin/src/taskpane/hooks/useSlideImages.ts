import { useCallback, useEffect, useState } from "react";

type SlideImagePreview = {
  slideNumber: number;
  imageIndex: number;
  base64: string;
  format: string;
  width?: number;
  height?: number;
  name?: string;
};

type UseSlideImagesResult = {
  images: SlideImagePreview[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useSlideImages(autoLoad = true): UseSlideImagesResult {
  const [images, setImages] = useState<SlideImagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof PowerPoint === "undefined" || typeof PowerPoint.run !== "function") {
      setImages([]);
      setError("PowerPoint runtime unavailable. Open inside PowerPoint to preview slide images.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load("items");
        await context.sync();

        const collected: SlideImagePreview[] = [];

        for (let i = 0; i < slides.items.length; i++) {
          const slide = slides.items[i];
          const shapes = slide.shapes;
          shapes.load("items/type,items/name,items/width,items/height");
          await context.sync();

          let imageCount = 0;
          shapes.items.forEach((shape: any) => {
            if (shape.type === "Image") {
              imageCount += 1;
              if (typeof shape.getBase64Image === "function") {
                const base64Result = shape.getBase64Image();
                collected.push({
                  slideNumber: i + 1,
                  imageIndex: imageCount,
                  base64Promise: base64Result,
                  format: "png",
                  width: shape.width,
                  height: shape.height,
                  name: shape.name,
                } as any);
              }
            }
          });

          // Fallback: slide image if no per-shape captures
          if (imageCount === 0 && typeof slide.getImageAsBase64 === "function") {
            const slideImg = slide.getImageAsBase64();
            collected.push({
              slideNumber: i + 1,
              imageIndex: 1,
              base64Promise: slideImg,
              format: "png",
              name: `slide-${i + 1}-image`,
            } as any);
          }
        }

        // Now sync to resolve base64 promises
        await context.sync();

        const resolved = collected
          .map((item: any) => {
            if (!item.base64Promise || !item.base64Promise.value) {
              return null;
            }
            return {
              slideNumber: item.slideNumber,
              imageIndex: item.imageIndex,
              base64: item.base64Promise.value as string,
              format: item.format,
              width: item.width,
              height: item.height,
              name: item.name,
            } as SlideImagePreview;
          })
          .filter(Boolean) as SlideImagePreview[];

        setImages(resolved);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Unable to load slide images: ${message}`);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      void refresh();
    }
  }, [autoLoad, refresh]);

  return { images, loading, error, refresh };
}
